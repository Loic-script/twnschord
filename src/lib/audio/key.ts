import type { KeyMode } from "./types";

// Profils de tonalité de Krumhansl & Kessler.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(chroma: ArrayLike<number>, profile: number[], tonic: number): number {
  let mx = 0;
  let my = 0;
  for (let i = 0; i < 12; i++) {
    mx += chroma[i];
    my += profile[i];
  }
  mx /= 12;
  my /= 12;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < 12; i++) {
    const x = chroma[(i + tonic) % 12] - mx;
    const y = profile[i] - my;
    num += x * y;
    dx += x * x;
    dy += y * y;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

/** Tonalité la plus probable pour un chroma global (12 valeurs). */
export function estimateKey(chroma: ArrayLike<number>): { tonic: number; mode: KeyMode } {
  let best = { tonic: 0, mode: "major" as KeyMode };
  let bestScore = -Infinity;
  for (let tonic = 0; tonic < 12; tonic++) {
    const maj = correlation(chroma, MAJOR, tonic);
    if (maj > bestScore) {
      bestScore = maj;
      best = { tonic, mode: "major" };
    }
    const min = correlation(chroma, MINOR, tonic);
    if (min > bestScore) {
      bestScore = min;
      best = { tonic, mode: "minor" };
    }
  }
  return best;
}
