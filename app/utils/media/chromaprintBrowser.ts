/**
 * Calcul de l'empreinte Chromaprint côté navigateur via chromaprint-wasm.
 * Utilise la lib officielle (Rust → WASM) pour un fingerprint bit-identique à fpcalc / AcoustID.
 * Utilisé uniquement dans le navigateur (typeof window !== 'undefined').
 */

/** Taux d'échantillonnage attendu par chromaprint-wasm (Fingerprinter::new(44100)). */
const TARGET_SAMPLE_RATE = 44100;

/**
 * Rééchantillonne du PCM float mono vers une autre fréquence (interpolation linéaire).
 */
function resampleTo(
  samples: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (Math.abs(fromRate - toRate) < 1) return samples;
  const ratio = fromRate / toRate;
  const outLength = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIndex = i * ratio;
    const j = Math.floor(srcIndex);
    const frac = srcIndex - j;
    const a = samples[j] ?? 0;
    const b = samples[j + 1] ?? a;
    out[i] = a * (1 - frac) + b * frac;
  }
  return out;
}

/**
 * Convertit PCM float [-1, 1] en Int16 (pour chromaprint-wasm).
 */
function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!));
    out[i] = v < 0 ? v * 32768 : v * 32767;
  }
  return out;
}

/**
 * Calcule l'empreinte Chromaprint + durée à partir d'un fichier audio (navigateur uniquement).
 * Utilise chromaprint-wasm (lib officielle Rust → WASM) pour un résultat bit-identique à fpcalc.
 * Retourne { fingerprint, duration } ou null en cas d'erreur / environnement non-navigateur.
 */
export async function calculateChromaprintFromFile(
  file: File
): Promise<{ fingerprint: string; duration: number } | null> {
  if (typeof window === "undefined") return null;

  const AudioContextClass =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return null;

  const ctx = new AudioContextClass();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const durationSec = audioBuffer.duration;
    const sr = audioBuffer.sampleRate;

    let channelData: Float32Array;
    if (audioBuffer.numberOfChannels === 1) {
      channelData = audioBuffer.getChannelData(0);
    } else {
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.getChannelData(1);
      channelData = new Float32Array(left.length);
      for (let i = 0; i < left.length; i++) {
        channelData[i] = (left[i]! + right[i]!) / 2;
      }
    }

    const mono44100 = resampleTo(channelData, sr, TARGET_SAMPLE_RATE);
    const pcm16 = floatToInt16(mono44100);

    const wasm = await import("chromaprint-wasm");
    const ChromaprintContext = (wasm as { ChromaprintContext: new () => ChromaprintContextInstance }).ChromaprintContext;
    if (!ChromaprintContext) {
      console.warn("[chromaprintBrowser] ChromaprintContext introuvable");
      return null;
    }

    const chromaprintContext = new ChromaprintContext();
    chromaprintContext.feed(pcm16);
    const fingerprint = chromaprintContext.finish();
    const duration = Math.round(durationSec);

    return { fingerprint, duration };
  } catch (e) {
    console.warn("[chromaprintBrowser] Erreur calcul empreinte:", e);
    return null;
  } finally {
    ctx.close().catch(() => {});
  }
}

/** Instance ChromaprintContext exposée par chromaprint-wasm. */
interface ChromaprintContextInstance {
  feed(data: Int16Array): void;
  finish(): string;
}
