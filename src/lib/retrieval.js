// src/lib/retrieval.js
import { embedBatch } from "./openai.js";
import { searchCollection } from "./qdrant.js";

// Main retrieval function for chat
export async function retrieveChunks(query, { k = 12, score_threshold = 0.2 } = {}) {
  const [qvec] = await embedBatch([query]);
  const hits = await searchCollection(qvec, { limit: k, score_threshold });

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

// Retrieval function for route endpoint
export async function retrieveForQuery(query, { k = 12, score_threshold = 0.2 } = {}) {
  const [qvec] = await embedBatch([query]);
  const hits = await searchCollection(qvec, { limit: k, score_threshold });

  // group by item_id and sort
  const byItem = new Map();
  for (const h of hits) {
    const p = h.payload || {};
    if (!p.item_id) continue;
    const it = byItem.get(p.item_id) || { item_id: p.item_id, title: p.title ?? null, chunks: [], top: 0 };
    it.chunks.push({ text: p.text, chunk_index: p.chunk_index, score: h.score });
    it.top = Math.max(it.top, h.score);
    byItem.set(p.item_id, it);
  }
  return Array.from(byItem.values())
    .map(i => ({ ...i, chunks: i.chunks.sort((a,b)=>b.score-a.score) }))
    .sort((a,b)=>b.top - a.top);
}

// Context builder for chat
export function buildContext(items, maxChars = 4000) {
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

// Context builder for route endpoint
export function buildCtx(items, maxChars = 4000) {
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
