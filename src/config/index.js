// src/config/index.js
import "dotenv/config";

export const PORT = Number(process.env.PORT || 3000);
export const QDRANT_URL = process.env.QDRANT_URL;
export const COLLECTION = process.env.QDRANT_COLLECTION || "secondbrain";
export const EMBED_MODEL = "text-embedding-3-small"; // 1536 dims
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export function logBootInfo() {
  console.log("[BOOT]", {
    node: process.version,
    port: PORT,
    qdrant: QDRANT_URL,
    collection: COLLECTION,
    openaiKey: OPENAI_API_KEY ? `set(len=${OPENAI_API_KEY.length})` : "missing"
  });
}
