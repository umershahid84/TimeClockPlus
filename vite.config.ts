import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The client source lives in src/client as part of this single integrated
// project (no separate frontend/ package). The build output goes to
// dist/client, which the Express server serves as static files in
// production alongside the /api routes it hosts itself.
export default defineConfig({
  root: "src/client",
  plugins: [react()],
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
