// src/utils/id.js
import crypto from "crypto";

// Generate UUID
export function generateId() {
  return crypto.randomUUID();
}
