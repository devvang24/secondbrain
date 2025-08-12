// src/routes/health.js
import express from "express";

const router = express.Router();

// Health check
router.get("/health", (_req, res) => res.json({ ok: true }));

export default router;
