// src/middleware/errors.js

// 404 handler
export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: "not_found", message: "Route not found" } });
}

// Global error handler
export function errorHandler(err, _req, res, _next) {
  console.error("[UNCAUGHT]", err);
  res.status(500).json({ error: { code: "internal_error", message: "Unexpected error" } });
}
