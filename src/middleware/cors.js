// src/middleware/cors.js
import cors from "cors";

// CORS allowlist
const allowlist = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

// CORS middleware
export const corsMiddleware = cors({
  origin: (origin, cb) => (!origin ? cb(null, true) : cb(null, allowlist.has(origin))),
  credentials: false
});
