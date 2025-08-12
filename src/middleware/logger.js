// src/middleware/logger.js

// Request logger middleware
export function requestLogger(req, res, next) {
  const t0 = Date.now();
  res.on("finish", () => {
    console.log(`[REQ] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${Date.now() - t0}ms`);
  });
  next();
}
