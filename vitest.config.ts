import { defineConfig } from "vitest/config";

// Deliberately not merging vite.config.ts (which sets root: "src/client"
// for the browser build) - server-side unit tests live under src/server
// and should run relative to the project root.
export default defineConfig({
  test: {
    include: ["src/server/**/*.test.ts"],
    environment: "node",
  },
});
