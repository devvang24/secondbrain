// src/lib/openai.js
import OpenAI from "openai";
import { OPENAI_API_KEY, EMBED_MODEL } from "../config/index.js";

// OpenAI client
export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Embedding helper
export async function embedBatch(texts) {
  const r = await openai.embeddings.create({ model: EMBED_MODEL, input: texts });
  return r.data.map(d => d.embedding);
}

// Intent classifier using LLM
export async function classifyIntent(input) {
  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 100,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Classify the input. Output JSON only." },
      { role: "user", content:
`Input: ${input}

Return:
{
  "intent": "ingest" | "query",
  "title": string|null,
  "text": string|null
}

Rules:
- "ingest" when user is saving a note (e.g., "I met Jerry today in Sunburn.")
- "query" when user is asking a question about notes.
- For "ingest", set "text" to the note content, "title" short or null.
- For "query", title=null, text=null.` }
    ]
  });

  try {
    const out = JSON.parse(r.choices[0].message.content);
    if (out.intent !== "ingest" && out.intent !== "query") return { intent: "query", title: null, text: null };
    return out;
  } catch {
    return { intent: "query", title: null, text: null };
  }
}

// Chat completion helper
export async function generateAnswer(query, context) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 400,
    messages: [
      { role: "system", content: "Answer strictly using the provided notes. Be concise. If nothing relevant, say 'No relevant notes found.' Cite titles/chunk indexes when helpful." },
      { role: "user", content: `Question:\n${query}\n\nNotes:\n${context}` }
    ]
  });

  return completion.choices?.[0]?.message?.content?.trim() || "No response.";
}
