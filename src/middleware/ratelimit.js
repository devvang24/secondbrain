// src/middleware/ratelimit.js
import rateLimit from "express-rate-limit";

// Basic rate limit
export const rateLimitMiddleware = rateLimit({ 
  windowMs: 60_000, 
  max: 240 
});
