// Todo : vite.config.ts
import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import type { OutputBundle, OutputChunk, OutputAsset, NormalizedOutputOptions } from "rollup";

/** Supprime la référence source map du worker PDF pour éviter l’erreur Wrangler (fichier .map absent). */
function stripPdfWorkerSourceMap() {
  return {
    name: "strip-pdf-worker-source-map",
    enforce: "post" as const,
    generateBundle(_options: NormalizedOutputOptions, bundle: OutputBundle) {
      const strip = (str: string) =>
        str.replace(/\n?\/\/# sourceMappingURL=[^\n]*/g, "").trimEnd();

      for (const [fileName, output] of Object.entries(bundle)) {
        if (!fileName.includes("pdf.worker")) continue;

        if ((output as OutputAsset).type === "asset") {
          const asset = output as OutputAsset;
          const source = asset.source as string | Uint8Array;
          const str = typeof source === "string" ? source : new TextDecoder().decode(source);
          if (str.includes("sourceMappingURL")) {
            asset.source = strip(str);
          }
          continue;
        }

        const chunk = output as OutputChunk;
        if (chunk.type === "chunk" && "code" in chunk && chunk.code.includes("sourceMappingURL")) {
          chunk.code = strip(chunk.code);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
    stripPdfWorkerSourceMap(),
  ],
  define: {
    // Polyfill Buffer pour le navigateur
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
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
