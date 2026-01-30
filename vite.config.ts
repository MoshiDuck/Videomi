// Todo : vite.config.ts
import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

/** Supprime la référence source map du worker PDF pour éviter l’erreur Wrangler (fichier .map absent). */
function stripPdfWorkerSourceMap() {
  return {
    name: "strip-pdf-worker-source-map",
    enforce: "post" as const,
    generateBundle(_, bundle) {
      const strip = (str: string) =>
        str.replace(/\n?\/\/# sourceMappingURL=[^\n]*/g, "").trimEnd();

      for (const [fileName, output] of Object.entries(bundle)) {
        if (!fileName.includes("pdf.worker")) continue;

        if (output.type === "asset") {
          const source = output.source as string | Uint8Array;
          const str = typeof source === "string" ? source : new TextDecoder().decode(source);
          if (str.includes("sourceMappingURL")) {
            (output as { source: string }).source = strip(str);
          }
          continue;
        }

        if (output.type === "chunk" && "code" in output) {
          const code = output.code as string;
          if (code.includes("sourceMappingURL")) {
            (output as { code: string }).code = strip(code);
          }
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
