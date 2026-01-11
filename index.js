// Entry point for the Expo Router app.
// Add lightweight, web-only performance timers for debugging startup.

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  // Guard to ensure we only start the timers once per page load
  if (!window.__WEB_TOTAL_STARTUP_TIMER_STARTED__) {
    window.__WEB_TOTAL_STARTUP_TIMER_STARTED__ = true;

    // Total time from JS entry to RootLayout becoming ready
    console.time("WEB_TOTAL_STARTUP");

    // Time from JS entry until the first Runner web screen finishes mounting
    console.time("WEB_RUNNER_FIRST_SCREEN_MOUNT");

    console.log("[PERF] WEB timers started (WEB_TOTAL_STARTUP, WEB_RUNNER_FIRST_SCREEN_MOUNT)");
  }
}

import "expo-router/entry";

