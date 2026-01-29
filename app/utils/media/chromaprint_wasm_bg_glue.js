/**
 * Glue pour chromaprint-wasm : le package npm n’inclut pas chromaprint_wasm_bg.js,
 * seulement le .wasm. Ce module charge le WASM, fournit __wbindgen_throw, et réexporte
 * les exports du module pour que chromaprint_wasm.js puisse faire import * as wasm from './chromaprint_wasm_bg'.
 *
 * Nécessite top-level await (vite-plugin-top-level-await).
 */

// Vite résout l’URL du .wasm (asset avec hash en prod)
import wasmAssetUrl from "chromaprint-wasm/chromaprint_wasm_bg.wasm?url";

let memoryRef = null;
const importObject = {
  "./chromaprint_wasm": {
    __wbindgen_throw(ptr, len) {
      if (!memoryRef) throw new Error("chromaprint wasm: memory not ready");
      const mem = new Uint8Array(memoryRef.buffer);
      const msg = new TextDecoder().decode(mem.subarray(ptr, ptr + len));
      throw new Error(msg);
    },
  },
};

const response = await fetch(wasmAssetUrl);
const buffer = await response.arrayBuffer();
const module = await WebAssembly.compile(buffer);
const instance = await WebAssembly.instantiate(module, importObject);
memoryRef = instance.exports.memory;

export const memory = instance.exports.memory;
export const __wbindgen_global_argument_ptr =
  instance.exports.__wbindgen_global_argument_ptr;
export const __wbg_chromaprintcontext_free =
  instance.exports.__wbg_chromaprintcontext_free;
export const chromaprintcontext_new = instance.exports.chromaprintcontext_new;
export const chromaprintcontext_feed = instance.exports.chromaprintcontext_feed;
export const chromaprintcontext_finish =
  instance.exports.chromaprintcontext_finish;
export const __wbindgen_malloc = instance.exports.__wbindgen_malloc;
export const __wbindgen_free = instance.exports.__wbindgen_free;
