import path from "node:path";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), viteReact()],
  base: "./",
  publicDir: false,
  resolve: { tsconfigPaths: true },
  build: {
    outDir: "desktop/ui",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "desktop.html"),
    },
  },
});
