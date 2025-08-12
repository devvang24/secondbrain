// src/utils/timers.js

// Boot timer utility
export function createBootTimer() {
  const startTime = Date.now();
  
  return {
    elapsed: () => Date.now() - startTime
  };
}
