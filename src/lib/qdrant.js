// src/lib/qdrant.js
import { QdrantClient } from "@qdrant/js-client-rest";
import { QDRANT_URL, COLLECTION } from "../config/index.js";

// Qdrant client
export const qdrant = new QdrantClient({ url: QDRANT_URL });

// Ensure collection exists
export async function ensureCollection() {
  const size = 1536;
  try {
    await qdrant.getCollection(COLLECTION);
    console.log("[QDRANT] collection exists:", COLLECTION);
  } catch {
    await qdrant.createCollection(COLLECTION, { vectors: { size, distance: "Cosine" } });
    console.log("[QDRANT] collection created:", COLLECTION, "size", size);
  }
}

// Upsert points to collection
export async function upsertPoints(points) {
  return await qdrant.upsert(COLLECTION, { points });
}

// Search in collection
export async function searchCollection(vector, options = {}) {
  const { limit = 12, score_threshold = 0.2, with_payload = true } = options;
  return await qdrant.search(COLLECTION, {
    vector,
    limit,
    score_threshold,
    with_payload
  });
}

// Get all collections (for health check)
export async function getCollections() {
  return await qdrant.getCollections();
}

// Scroll through collection points
export async function scrollCollection(options = {}) {
  const { limit = 20, with_payload = true } = options;
  return await qdrant.scroll(COLLECTION, {
    limit,
    with_payload
  });
}
