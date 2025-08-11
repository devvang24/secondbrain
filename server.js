// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import OpenAI from "openai";
import { QdrantClient } from "@qdrant/js-client-rest";

// ----- Boot info
const bootStartedAt = Date.now();
const PORT = Number(process.env.PORT || 3000);
const QDRANT_URL = process.env.QDRANT_URL;
const COLLECTION = process.env.QDRANT_COLLECTION || "secondbrain";
const EMBED_MODEL = "text-embedding-3-small"; // 1536 dims

console.log("[BOOT]", {
  node: process.version,
  port: PORT,
  qdrant: QDRANT_URL,
  collection: COLLECTION,
  openaiKey: process.env.OPENAI_API_KEY ? `set(len=${process.env.OPENAI_API_KEY.length})` : "missing"
});

// ----- App + middleware
const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "2mb" }));

// CORS (web frontends); RN ignores CORS
const allowlist = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);
app.use(
  cors({
    origin: (origin, cb) => (!origin ? cb(null, true) : cb(null, allowlist.has(origin))),
    credentials: false
  })
);

// Basic rate limit
app.use(rateLimit({ windowMs: 60_000, max: 240 }));

// Tiny request logger
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => {
    console.log(`[REQ] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${Date.now() - t0}ms`);
  });
  next();
});

// ----- Clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const qdrant = new QdrantClient({ url: QDRANT_URL });

// ----- Helper utils
function contentHash(text, metadata = {}) {
  const norm = text.trim() + "|" + JSON.stringify(metadata ?? {});
  return crypto.createHash("sha256").update(norm).digest("hex");
}
function chunkText(text, max = 1000, overlap = 200) {
  const out = [];
  let i = 0, idx = 0;
  while (i < text.length) {
    const end = Math.min(i + max, text.length);
    const seg = text.slice(i, end);
    out.push({ idx, text: seg, tokens: Math.ceil(seg.length / 4) });
    if (end === text.length) break;
    i = end - overlap; idx++;
  }
  return out;
}
async function embedBatch(texts) {
  const r = await openai.embeddings.create({ model: EMBED_MODEL, input: texts });
  return r.data.map(d => d.embedding);
}

// ----- Ensure collection exists
async function ensureCollection() {
  const size = 1536;
  try {
    await qdrant.getCollection(COLLECTION);
    console.log("[QDRANT] collection exists:", COLLECTION);
  } catch {
    await qdrant.createCollection(COLLECTION, { vectors: { size, distance: "Cosine" } });
    console.log("[QDRANT] collection created:", COLLECTION, "size", size);
  }
}
await ensureCollection();

// ----- Versioned API
const api = express.Router();

// --- Retrieval helpers (server-side RAG)
async function retrieveChunks(query, { k = 12, score_threshold = 0.2 } = {}) {
  const [qvec] = await embedBatch([query]);
  const hits = await qdrant.search(COLLECTION, {
    vector: qvec,
    limit: k,
    score_threshold,
    with_payload: true
  });

  // Group by item_id
  const byItem = new Map();
  for (const h of hits) {
    const p = h.payload || {};
    const id = p.item_id;
    if (!id) continue;
    const entry = byItem.get(id) || { item_id: id, title: p.title ?? null, chunks: [], topScore: h.score };
    entry.chunks.push({ text: p.text, chunk_index: p.chunk_index, score: h.score });
    entry.topScore = Math.max(entry.topScore, h.score);
    byItem.set(id, entry);
  }

  // Sort items by best score; sort each item's chunks by score
  return Array.from(byItem.values())
    .map(it => ({ ...it, chunks: it.chunks.sort((a,b)=>b.score-a.score) }))
    .sort((a,b)=>b.topScore - a.topScore);
}

function buildContext(items, maxChars = 4000) {
  // Flatten top chunks into a single context string with a char budget
  let out = "";
  for (const it of items) {
    for (const c of it.chunks) {
      const block = `Title: ${it.title ?? "(untitled)"} | Chunk ${c.chunk_index} | Score ${c.score.toFixed(3)}\n${c.text}\n---\n`;
      if (out.length + block.length > maxChars) return out;
      out += block;
    }
  }
  return out;
}


// Health
api.get("/health", (_req, res) => res.json({ ok: true }));

// Qdrant ping
api.get("/vd-check", async (_req, res) => {
  const c = await qdrant.getCollections();
  res.json({ qdrant: "up", collections: (c.collections || []).map(x => x.name) });
});

// Debug: embeddings
api.get("/debug/embed", async (_req, res) => {
  try {
    const r = await openai.embeddings.create({ model: EMBED_MODEL, input: ["ping"] });
    res.json({ ok: true, dims: r.data[0].embedding.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /v1/chat  { query: string, k?: number, mode?: "answer"|"notes" }
api.post("/chat", async (req, res) => {
  const query = String(req.body?.query || "");
  const k = Math.max(1, Math.min(Number(req.body?.k || 12), 50));
  const mode = (req.body?.mode === "notes") ? "notes" : "answer";
  if (!query) return res.status(400).json({ error: { code: "bad_request", message: "query required" } });

  try {
    // 1) Retrieve relevant chunks from Qdrant
    const items = await retrieveChunks(query, { k, score_threshold: 0.2 });

    // If caller only wants the notes, return early
    if (mode === "notes") return res.json({ answer: null, notes: items });

    // 2) Build compact context for LLM
    const context = buildContext(items, 4000);

    // If nothing relevant, reply simply
    if (!context) return res.json({ answer: "No relevant notes found.", notes: items });

    // 3) Ask LLM to summarize/answer using only provided notes
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        { role: "system",
          content: "Answer strictly using the provided notes. Be concise. If nothing relevant, say 'No relevant notes found.' Cite titles/chunk indexes when helpful." },
        { role: "user",
          content: `Question:\n${query}\n\nNotes:\n${context}` }
      ]
    });

    const answer = completion.choices?.[0]?.message?.content?.trim() || "No response.";
    res.json({
      answer,
      notes: items,
      usage: completion.usage ?? null,
      model: completion.model ?? "gpt-4o-mini"
    });
  } catch (e) {
    console.error("[CHAT] error", e);
    res.status(500).json({ error: { code: "internal_error", message: "chat failed", detail: String(e?.message || e) } });
  }
});


// ---- POST /v1/nodes  (ingest)
api.post("/nodes", async (req, res) => {
  const { text, title = null, metadata = {} } = req.body ?? {};
  if (!text || typeof text !== "string") return res.status(400).json({ error: { code: "bad_request", message: "text required" } });

  try {
    const itemId = crypto.randomUUID();
    const baseHash = contentHash(text, metadata);
    const chunks = chunkText(text);
    const embs = await embedBatch(chunks.map(c => c.text));

    // Deterministic point IDs => same content overwrites (de-dupe)
    const points = chunks.map((c, i) => ({
  id: crypto.randomUUID(),            // ← replace the sha256 hex with this
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

    await qdrant.upsert(COLLECTION, { points });
    res.json({ item_id: itemId, chunks: points.length, status: "persisted" });
  } catch (e) {
    console.error("[INGEST] error", e);
    res.status(500).json({ error: { code: "internal_error", message: "ingest failed" } });
  }
});

// ---- GET /v1/search?q=&k=
api.get("/search", async (req, res) => {
  const q = String(req.query.q || "");
  const k = Math.max(1, Math.min(Number(req.query.k || 5), 50));
  if (!q) return res.status(400).json({ error: { code: "bad_request", message: "q required" } });

  try {
    const [qvec] = await embedBatch([q]);
    const hits = await qdrant.search(COLLECTION, {
      vector: qvec,
      limit: k,
      with_payload: true,
      score_threshold: 0.2 // tighten if needed
    });
    const out = hits.map(h => ({
      score: h.score,
      item_id: h.payload.item_id,
      chunk_index: h.payload.chunk_index,
      title: h.payload.title,
      text: h.payload.text
    }));
    res.json(out);
  } catch (e) {
    console.error("[SEARCH] error", e);
    res.status(500).json({ error: { code: "internal_error", message: "search failed" } });
  }
});

// ---- GET /v1/nodes?limit=&offset=   (simple list)
api.get("/nodes", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const offset = Number(req.query.offset ?? 0);

    // Scroll some points (MVP). For a real app, keep a separate "items" collection.
    const r = await qdrant.scroll(COLLECTION, {
      limit: limit + offset,
      with_payload: true
    });
    const pts = r.points ?? [];

    // Group by item_id; choose lowest chunk_index as preview
    const byItem = new Map();
    for (const p of pts) {
      const pid = p.payload?.item_id;
      if (!pid) continue;
      const prev = byItem.get(pid);
      if (!prev || (p.payload.chunk_index ?? 0) < (prev.payload.chunk_index ?? 0)) {
        byItem.set(pid, p);
      }
    }

    const items = Array.from(byItem.values())
      .slice(offset, offset + limit)
      .map(p => ({
        item_id: p.payload.item_id,
        title: p.payload.title ?? null,
        preview: String(p.payload.text ?? "").slice(0, 180),
        chunk_count: 1
      }));

    res.json(items);
  } catch (e) {
    console.error("[NODES_LIST] error", e);
    res.status(500).json({ error: { code: "internal_error", message: "list failed" } });
  }
});

// Mount versioned API
app.use("/v1", api);

// 404 + error handlers
app.use((req, res) => res.status(404).json({ error: { code: "not_found", message: "Route not found" } }));
app.use((err, _req, res, _next) => {
  console.error("[UNCAUGHT]", err);
  res.status(500).json({ error: { code: "internal_error", message: "Unexpected error" } });
});

// Start
app.listen(PORT, () => {
  console.log(`API ready on :${PORT} in ${Date.now() - bootStartedAt}ms`);
});

// Safety nets
process.on("unhandledRejection", r => console.error("[unhandledRejection]", r));
process.on("uncaughtException", e => console.error("[uncaughtException]", e));
