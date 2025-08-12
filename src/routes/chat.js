// src/routes/chat.js
import express from "express";
import { retrieveChunks, buildContext } from "../lib/retrieval.js";
import { openai } from "../lib/openai.js";

const router = express.Router();

// POST /v1/chat { query: string, k?: number, mode?: "answer"|"notes" }
router.post("/chat", async (req, res) => {
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

export default router;
