// src/lib/chunk.js
import crypto from "crypto";

// Content hashing
export function contentHash(text, metadata = {}) {
  const norm = text.trim() + "|" + JSON.stringify(metadata ?? {});
  return crypto.createHash("sha256").update(norm).digest("hex");
}

// Text chunking
export function chunkText(text, max = 1000, overlap = 200) {
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
