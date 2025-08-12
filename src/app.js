// src/app.js
import express from "express";
import helmet from "helmet";
import compression from "compression";

// Middleware
import { requestLogger } from "./middleware/logger.js";
import { notFoundHandler, errorHandler } from "./middleware/errors.js";
import { rateLimitMiddleware } from "./middleware/ratelimit.js";
import { corsMiddleware } from "./middleware/cors.js";

// Initialize Qdrant
import { ensureCollection } from "./lib/qdrant.js";

// Routes
import healthRoutes from "./routes/health.js";
import vdCheckRoutes from "./routes/vdCheck.js";
import debugRoutes from "./routes/debug.js";
import searchRoutes from "./routes/search.js";
import nodesRoutes from "./routes/nodes.js";
import chatRoutes from "./routes/chat.js";
import routeRoutes from "./routes/route.js";

export async function createApp() {
  // Ensure Qdrant collection exists
  await ensureCollection();

  // Create Express app
  const app = express();

  // Trust proxy
  app.set("trust proxy", 1);

  // Basic middleware
  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));

  // CORS
  app.use(corsMiddleware);

  // Rate limiting
  app.use(rateLimitMiddleware);

  // Request logging
  app.use(requestLogger);

  // Versioned API router
  const api = express.Router();

  // Mount route handlers
  api.use(healthRoutes);
  api.use(vdCheckRoutes);
  api.use(debugRoutes);
  api.use(searchRoutes);
  api.use(nodesRoutes);
  api.use(chatRoutes);
  api.use(routeRoutes);

  // Mount versioned API
  app.use("/v1", api);

  // Error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
