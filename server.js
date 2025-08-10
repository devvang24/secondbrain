// server.js
import "dotenv/config";
import express from "express";
import crypto from "crypto";
import OpenAI from "openai";
import { QdrantClient } from "@qdrant/js-client-rest";

// --- Boot logging
const bootStartedAtMs = Date.now();
console.log(`[BOOT] server.js starting @ ${new Date().toISOString()} cwd=${process.cwd()} node=${process.version}`);
console.log("[ENV] summary", {
  PORT: process.env.PORT || null,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? `set(len=${process.env.OPENAI_API_KEY.length})` : "missing",
  QDRANT_URL: process.env.QDRANT_URL || "missing",
  QDRANT_COLLECTION: process.env.QDRANT_COLLECTION || "secondbrain(default)"
});

const app = express();
app.use(express.json({ limit: "2mb" }));
// Request/response logger
app.use((req, res, next) => {
  const startedAt = Date.now();
  let bodyLen = 0;
  try {
    if (typeof req.body === "string") bodyLen = req.body.length;
    else bodyLen = Buffer.byteLength(JSON.stringify(req.body ?? {}));
  } catch {
    bodyLen = -1;
  }
  console.log(`[REQ] ${req.method} ${req.originalUrl} bodyLen=${bodyLen}`);
  res.on("finish", () => {
    console.log(`[RES] ${req.method} ${req.originalUrl} status=${res.statusCode} durMs=${Date.now() - startedAt}`);
  });
  next();
});

// ---- Clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
console.log(`[INIT] OpenAI client ${process.env.OPENAI_API_KEY ? "configured" : "MISSING_API_KEY"}`);
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL });
console.log(`[INIT] Qdrant client url=${process.env.QDRANT_URL}`);

const COLLECTION = process.env.QDRANT_COLLECTION || "secondbrain";
const EMBED_MODEL = "text-embedding-3-small"; // 1536-dim
console.log(`[CONFIG] COLLECTION=${COLLECTION} EMBED_MODEL=${EMBED_MODEL}`);

// ---- Helpers
function contentHash(text, metadata = {}) {
  console.log(`[FUNC] contentHash enter textLen=${text?.length ?? 0}`);
  const norm = text.trim() + "|" + JSON.stringify(metadata ?? {});
  const hash = crypto.createHash("sha256").update(norm).digest("hex");
  console.log(`[FUNC] contentHash exit hash=${hash.slice(0, 8)}...`);
  return hash;
}
function chunkText(text, max = 1000, overlap = 200) {
  console.log(`[FUNC] chunkText enter textLen=${text?.length ?? 0} max=${max} overlap=${overlap}`);
  const out = []; let i = 0, idx = 0;
  while (i < text.length) {
    const end = Math.min(i + max, text.length);
    const seg = text.slice(i, end);
    out.push({ idx, text: seg, tokens: Math.ceil(seg.length / 4) });
    if (end === text.length) break;
    i = end - overlap; idx++;
  }
  console.log(`[FUNC] chunkText exit chunks=${out.length}`);
  return out;
}
async function embedBatch(texts) {
  console.log(`[FUNC] embedBatch enter count=${texts?.length ?? 0}`);
  const t0 = Date.now();
  try {
    const res = await openai.embeddings.create({ model: EMBED_MODEL, input: texts });
    console.log(`[FUNC] embedBatch exit count=${res.data?.length ?? 0} durMs=${Date.now() - t0}`);
    return res.data.map(d => d.embedding);
  } catch (e) {
    console.error(`[FUNC] embedBatch error`, e);
    throw e;
  }
}

// ---- Ensure collection exists on boot
async function ensureCollection() {
  console.log(`[BOOT] ensureCollection check name=${COLLECTION}`);
  const dim = 1536;
  try {
    await qdrant.getCollection(COLLECTION);
    console.log(`[BOOT] ensureCollection exists name=${COLLECTION}`);
  } catch (e) {
    console.warn(`[BOOT] ensureCollection missing; creating name=${COLLECTION}`);
    try {
      await qdrant.createCollection(COLLECTION, { vectors: { size: dim, distance: "Cosine" } });
      console.log(`[BOOT] ensureCollection created name=${COLLECTION} dim=${dim}`);
    } catch (ce) {
      console.error(`[BOOT] ensureCollection create failed`, ce);
      throw ce;
    }
  }
}
await ensureCollection();
console.log(`[BOOT] ensureCollection complete`);


import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log(`[INIT] Serving static from ${__dirname}`);
app.use(express.static(__dirname));


// ---- Health & Qdrant check
app.get("/health", (_req, res) => {
  console.log(`[ROUTE] GET /health`);
  res.json({ ok: true });
});
app.get("/vd-check", async (_req, res) => {
  console.log(`[ROUTE] GET /vd-check`);
  try {
    const c = await qdrant.getCollections();
    const names = c.collections?.map(x => x.name) ?? [];
    console.log(`[VD] collections=${names.length}`);
    res.json({ qdrant: "up", collections: names });
  } catch (e) {
    console.error(`[VD] error`, e);
    res.status(500).json({ qdrant: "down", error: String(e) });
  }
});

// ---- Ingest: chunk -> embed -> upsert to Qdrant
app.post("/ingest", async (req, res) => {
  const { text, title = null, metadata = {} } = req.body ?? {};
  console.log(`[ROUTE] POST /ingest textLen=${typeof text === "string" ? text.length : 0} title=${title ?? ""}`);
  if (!text || typeof text !== "string") {
    console.log(`[INGEST] invalid text`);
    return res.status(400).json({ error: "text required" });
  }

  try {
    const itemId = crypto.randomUUID();
    console.log(`[INGEST] itemId=${itemId}`);
    const baseHash = contentHash(text, metadata);
    const chunks = chunkText(text);
    console.log(`[INGEST] chunks=${chunks.length}`);
    const tEmb = Date.now();
    const embs = await embedBatch(chunks.map(c => c.text));
    console.log(`[INGEST] embeddings ready vectors=${embs.length} durMs=${Date.now() - tEmb}`);

    const points = chunks.map((c, i) => ({
  id: crypto.randomUUID(), // <-- instead of sha256 hex
  vector: embs[i],
  payload: {
    item_id: itemId,
    title,
    chunk_index: c.idx,
    text: c.text,
    tokens: c.tokens,
    metadata,
    embedding_model: EMBED_MODEL,
    content_hash: baseHash
  }
}));


    console.log(`[INGEST] upserting points=${points.length} into collection=${COLLECTION}`);
    const tUp = Date.now();
    await qdrant.upsert(COLLECTION, { points });
    console.log(`[INGEST] upsert complete durMs=${Date.now() - tUp}`);
    res.json({ item_id: itemId, chunks: chunks.length, status: "persisted" });
  } catch (e) {
    console.error(`[INGEST] error`, e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ---- Search: embed query -> vector search
app.get("/search", async (req, res) => {
  const q = String(req.query.q || "");
  const k = Number(req.query.k || 5);
  console.log(`[ROUTE] GET /search qLen=${q.length} k=${k}`);
  if (!q) {
    console.log(`[SEARCH] missing q`);
    return res.status(400).json({ error: "q required" });
  }

  try {
    const tEmb = Date.now();
    const [qvec] = await embedBatch([q]);
    console.log(`[SEARCH] query embedded durMs=${Date.now() - tEmb}`);
    const tSearch = Date.now();
    const hits = await qdrant.search(COLLECTION, {
      vector: qvec,
      limit: k,
      with_payload: true
    });
    console.log(`[SEARCH] completed hits=${hits?.length ?? 0} durMs=${Date.now() - tSearch}`);
    const out = hits.map(h => ({
      score: h.score,
      item_id: h.payload.item_id,
      chunk_index: h.payload.chunk_index,
      title: h.payload.title,
      text: h.payload.text
    }));
    res.json(out);
  } catch (e) {
    console.error(`[SEARCH] error`, e);
    res.status(500).json({ error: "internal_error" });
  }
});

app.get("/debug/embed", async (_req, res) => {
  try {
    const r = await openai.embeddings.create({ model: EMBED_MODEL, input: ["ping"] });
    res.json({ ok: true, dims: r.data[0].embedding.length });
  } catch (e) {
    console.error("EMBED ERROR:", e);
    res.status(500).json({ ok: false, detail: String(e?.message || e) });
  }
});


const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`API ready on :${port}`);
  console.log(`[BOOT] ready in ${Date.now() - bootStartedAtMs}ms`);
});

// Global error handlers
process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED_REJECTION]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT_EXCEPTION]", err);
});
