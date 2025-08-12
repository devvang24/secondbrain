// src/routes/search.js
import express from "express";
import { embedBatch } from "../lib/openai.js";
import { searchCollection } from "../lib/qdrant.js";

const router = express.Router();

// GET /v1/search?q=&k=
router.get("/search", async (req, res) => {
  const q = String(req.query.q || "");
  const k = Math.max(1, Math.min(Number(req.query.k || 5), 50));
  if (!q) return res.status(400).json({ error: { code: "bad_request", message: "q required" } });

  try {
    const [qvec] = await embedBatch([q]);
    const hits = await searchCollection(qvec, { limit: k, score_threshold: 0.2 });
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

export default router;
