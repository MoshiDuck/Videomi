// Todo : vite.config.ts
import path from "path";
import { fileURLToPath } from "url";
import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import tsconfigPaths from "vite-tsconfig-paths";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chromaprintWasmGlue = path.resolve(
  __dirname,
  "app/utils/media/chromaprint_wasm_bg_glue.js"
);

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
    wasm(),
    topLevelAwait(),
    tsconfigPaths(),
  ],
  define: {
    // Polyfill Buffer pour le navigateur
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      // chromaprint-wasm : glue qui charge le .wasm et fournit __wbindgen_throw
      'chromaprint-wasm/chromaprint_wasm_bg': chromaprintWasmGlue,
      './chromaprint_wasm_bg': chromaprintWasmGlue,
    },
  },
  optimizeDeps: {
    exclude: ['chromaprint-wasm'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
    include: ['buffer'],
  },
  worker: {
    format: 'es', // Utiliser le format ES modules pour les workers (pas IIFE)
    rollupOptions: {
      output: {
        format: 'es', // Forcer le format ES pour les workers
      },
    },
  },
});
