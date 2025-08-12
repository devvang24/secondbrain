// src/routes/route.js
import express from "express";
import { classifyIntent, embedBatch, generateAnswer } from "../lib/openai.js";
import { contentHash, chunkText } from "../lib/chunk.js";
import { upsertPoints } from "../lib/qdrant.js";
import { retrieveForQuery, buildCtx } from "../lib/retrieval.js";
import { generateId } from "../utils/id.js";
import { EMBED_MODEL } from "../config/index.js";

const router = express.Router();

// POST /v1/route { text: string, k?: number }
router.post("/route", async (req, res) => {
  const input = String(req.body?.text || "");
  const k = Math.max(1, Math.min(Number(req.body?.k || 12), 50));
  if (!input) return res.status(400).json({ error: { code: "bad_request", message: "text required" } });

  try {
    // 1) classify
    const cls = await classifyIntent(input);

    if (cls.intent === "ingest") {
      // 2a) ingest note (reuse your existing helpers)
      const text = (cls.text || input).trim();
      const title = (cls.title || null);
      const itemId = generateId();
      const baseHash = contentHash(text, {});
      const chunks = chunkText(text);
      const embs = await embedBatch(chunks.map(c => c.text));
      const points = chunks.map((c, i) => ({
        id: generateId(),
        vector: embs[i],
        payload: {
          item_id: itemId, title, chunk_index: c.idx, text: c.text,
          tokens: c.tokens, metadata: {}, embedding_model: EMBED_MODEL, content_hash: baseHash
        }
      }));
      await upsertPoints(points);
      return res.json({ action: "ingest", result: { item_id: itemId, chunks: points.length, status: "persisted" } });
    }

    // 2b) answer query (retrieve → summarize)
    const items = await retrieveForQuery(input, { k, score_threshold: 0.2 });
    const ctx = buildCtx(items, 4000);
    if (!ctx) return res.json({ action: "query", result: { answer: "No relevant notes found.", notes: items } });

    const answer = await generateAnswer(input, ctx);
    return res.json({ action: "query", result: { answer, notes: items, usage: null } });
  } catch (e) {
    console.error("[ROUTE] error", e);
    return res.status(500).json({ error: { code: "internal_error", message: "route failed", detail: String(e?.message || e) } });
  }
});

export default router;
