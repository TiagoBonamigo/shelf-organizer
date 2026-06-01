import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: "web",
  plugins: [react()],
  resolve: {
    alias: {
      "@server": path.resolve(__dirname, "server"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
  },
});
