import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    react(),
    ...(process.env.ANALYZE === "true"
      ? [
          visualizer({
            open: true,
            filename: "stats.html",
          }),
        ]
      : []),
  ],
});
