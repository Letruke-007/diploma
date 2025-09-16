import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

export default defineConfig(({ mode }) => ({
  plugins: [react(), svgr()],
  build: {
    outDir: "dist",
    sourcemap: false,
    cssCodeSplit: true,
  },
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/d": "http://localhost:8000",
    },
  },
}));
