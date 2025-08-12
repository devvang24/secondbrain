// src/utils/logger.js

// Setup process error handlers
export function setupProcessHandlers() {
  process.on("unhandledRejection", r => console.error("[unhandledRejection]", r));
  process.on("uncaughtException", e => console.error("[uncaughtException]", e));
}
