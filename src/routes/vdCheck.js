// src/routes/vdCheck.js
import express from "express";
import { getCollections } from "../lib/qdrant.js";

const router = express.Router();

// Qdrant ping
router.get("/vd-check", async (_req, res) => {
  const c = await getCollections();
  res.json({ qdrant: "up", collections: (c.collections || []).map(x => x.name) });
});

export default router;
