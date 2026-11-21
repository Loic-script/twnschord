export interface ChromaOptions {
  /** Fréquence minimale prise en compte pour le chroma (Hz). */
  minFreq?: number;
  /** Fréquence maximale prise en compte pour le chroma (Hz). */
  maxFreq?: number;
  /** Bornes du registre de basse (Hz). */
  bassMin?: number;
  bassMax?: number;
  /** Seuil relatif des pics spectraux retenus (fraction du pic le plus fort). */
  peakThreshold?: number;
}

/**
 * Chroma calculé à partir des pics spectraux.
 *
 * Chaque maximum local du spectre est localisé précisément (interpolation
 * parabolique sur le log-amplitude), converti en note, puis ajouté à sa classe
 * de hauteur. Ne garder que les pics rend le chroma bien moins sensible au
 * bruit large bande (percussions, souffle) qu'une simple somme de bandes.
 */
export class SpectralChroma {
  /** Décalage d'accordage appliqué, en demi-tons (−0,5 … 0,5). */
  tuning = 0;

  private readonly binHz: number;
  private readonly kLo: number;
  private readonly kHi: number;
  private readonly minFreq: number;
  private readonly maxFreq: number;
  private readonly bassMax: number;
  private readonly peakThreshold: number;
  private devRe = 0;
  private devIm = 0;

  constructor(sampleRate: number, fftSize: number, opts: ChromaOptions = {}) {
    this.binHz = sampleRate / fftSize;
    this.minFreq = opts.minFreq ?? 98;
    this.maxFreq = opts.maxFreq ?? 1900;
    const bassMin = opts.bassMin ?? 50;
    this.bassMax = opts.bassMax ?? 250;
    this.peakThreshold = opts.peakThreshold ?? 0.03;
    this.kLo = Math.max(2, Math.floor(Math.min(bassMin, this.minFreq) / this.binHz));
    this.kHi = Math.min(fftSize / 2 - 2, Math.ceil(this.maxFreq / this.binHz));
  }

  /** Remplit `chroma` et `bass` (12 valeurs chacun) à partir du spectre d'amplitude. */
  compute(mags: Float32Array, chroma: Float32Array, bass: Float32Array): void {
    chroma.fill(0);
    bass.fill(0);
    const { kLo, kHi, binHz } = this;
    let max = 0;
    for (let k = kLo; k <= kHi; k++) if (mags[k] > max) max = mags[k];
    if (max <= 1e-9) return;
    const thr = max * this.peakThreshold;
    const eps = max * 1e-6;

    for (let k = kLo; k <= kHi; k++) {
      const m = mags[k];
      if (m < thr || m <= mags[k - 1] || m < mags[k + 1]) continue;
      const a = Math.log(mags[k - 1] + eps);
      const b = Math.log(m + eps);
      const c = Math.log(mags[k + 1] + eps);
      const denom = a - 2 * b + c;
      let delta = denom < 0 ? (0.5 * (a - c)) / denom : 0;
      if (delta > 0.5) delta = 0.5;
      else if (delta < -0.5) delta = -0.5;

      const freq = (k + delta) * binHz;
      const raw = 69 + 12 * Math.log2(freq / 440);
      const midi = raw - this.tuning;
      const nearest = Math.round(midi);
      const cos = Math.cos(Math.PI * (midi - nearest));
      const amp = Math.sqrt(m) * cos * cos;
      const pc = ((nearest % 12) + 12) % 12;

      if (freq >= this.minFreq && freq <= this.maxFreq) chroma[pc] += amp;
      if (freq <= this.bassMax) bass[pc] += amp;
      if (freq >= 150) {
        // Statistique circulaire de l'écart au demi-ton, pour estimer l'accordage.
        const sq = Math.sqrt(m);
        this.devRe += sq * Math.cos(2 * Math.PI * raw);
        this.devIm += sq * Math.sin(2 * Math.PI * raw);
      }
    }
  }

  /** Accordage estimé depuis le dernier `resetTuningStats`, en demi-tons (−0,5 … 0,5). */
  estimatedTuning(): number {
    if (Math.abs(this.devRe) + Math.abs(this.devIm) < 1e-9) return 0;
    return Math.atan2(this.devIm, this.devRe) / (2 * Math.PI);
  }

  resetTuningStats(): void {
    this.devRe = 0;
    this.devIm = 0;
  }
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>, offA = 0, offB = 0, n = 12): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[offA + i];
    const y = b[offB + i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}
