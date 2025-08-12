// src/server.js
import { createApp } from "./app.js";
import { PORT, logBootInfo } from "./config/index.js";
import { createBootTimer } from "./utils/timers.js";
import { setupProcessHandlers } from "./utils/logger.js";

// Boot
const bootTimer = createBootTimer();
logBootInfo();

// Create app
const app = await createApp();

// Setup process handlers
setupProcessHandlers();

// Start server
app.listen(PORT, () => {
  console.log(`API ready on :${PORT} in ${bootTimer.elapsed()}ms`);
});
