// src/routes/nodes.js
import express from "express";
import { contentHash, chunkText } from "../lib/chunk.js";
import { embedBatch } from "../lib/openai.js";
import { upsertPoints, scrollCollection } from "../lib/qdrant.js";
import { generateId } from "../utils/id.js";
import { EMBED_MODEL } from "../config/index.js";

const router = express.Router();

// POST /v1/nodes (ingest)
router.post("/nodes", async (req, res) => {
  const { text, title = null, metadata = {} } = req.body ?? {};
  if (!text || typeof text !== "string") return res.status(400).json({ error: { code: "bad_request", message: "text required" } });

  try {
    const itemId = generateId();
    const baseHash = contentHash(text, metadata);
    const chunks = chunkText(text);
    const embs = await embedBatch(chunks.map(c => c.text));

    // Deterministic point IDs => same content overwrites (de-dupe)
    const points = chunks.map((c, i) => ({
      id: generateId(),
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

    await upsertPoints(points);
    res.json({ item_id: itemId, chunks: points.length, status: "persisted" });
  } catch (e) {
    console.error("[INGEST] error", e);
    res.status(500).json({ error: { code: "internal_error", message: "ingest failed" } });
  }
});

// GET /v1/nodes?limit=&offset= (simple list)
router.get("/nodes", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const offset = Number(req.query.offset ?? 0);

    // Scroll some points (MVP). For a real app, keep a separate "items" collection.
    const r = await scrollCollection({ limit: limit + offset });
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

export default router;
