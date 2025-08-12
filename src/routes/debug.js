// src/routes/debug.js
import express from "express";
import { openai } from "../lib/openai.js";
import { EMBED_MODEL } from "../config/index.js";

const router = express.Router();

// Debug: embeddings
router.get("/debug/embed", async (_req, res) => {
  try {
    const r = await openai.embeddings.create({ model: EMBED_MODEL, input: ["ping"] });
    res.json({ ok: true, dims: r.data[0].embedding.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

export default router;
