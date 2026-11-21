export interface PitchResult {
  /** Fréquence fondamentale en Hz. */
  freq: number;
  /** Netteté de la périodicité, de 0 (bruit) à 1 (son parfaitement périodique). */
  clarity: number;
}

export interface PitchOptions {
  minFreq?: number;
  maxFreq?: number;
  threshold?: number;
}

/**
 * Détecteur de hauteur monophonique — algorithme YIN
 * (de Cheveigné & Kawahara, 2002) avec interpolation parabolique.
 */
export class PitchDetector {
  private readonly rate: number;
  private readonly decim: number;
  private readonly n: number;
  private readonly x: Float32Array;
  private readonly cmnd: Float32Array;
  private readonly tauMin: number;
  private readonly tauMax: number;
  private readonly threshold: number;

  constructor(sampleRate: number, bufferSize: number, opts: PitchOptions = {}) {
    const minFreq = opts.minFreq ?? 50;
    const maxFreq = opts.maxFreq ?? 2100;
    this.threshold = opts.threshold ?? 0.15;
    // Au-delà de 32 kHz on divise la cadence par 2 : deux fois moins de calcul,
    // sans perte utile pour des fondamentales sous 2 kHz.
    this.decim = sampleRate > 32000 ? 2 : 1;
    this.rate = sampleRate / this.decim;
    this.n = Math.floor(bufferSize / this.decim);
    this.x = new Float32Array(this.n);
    this.tauMin = Math.max(2, Math.floor(this.rate / maxFreq));
    this.tauMax = Math.min(Math.floor(this.rate / minFreq), Math.floor(this.n / 2));
    this.cmnd = new Float32Array(this.tauMax + 1);
  }

  detect(buf: Float32Array): PitchResult | null {
    const { x, n, decim, cmnd, tauMin, tauMax } = this;
    if (decim === 2) {
      for (let i = 0; i < n; i++) x[i] = 0.5 * (buf[2 * i] + buf[2 * i + 1]);
    } else {
      for (let i = 0; i < n; i++) x[i] = buf[i];
    }

    const w = n - tauMax;
    let running = 0;
    cmnd[0] = 1;
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let j = 0; j < w; j++) {
        const d = x[j] - x[j + tau];
        sum += d * d;
      }
      running += sum;
      cmnd[tau] = running > 0 ? (sum * tau) / running : 1;
    }
    if (running <= 1e-12) return null;

    // Premier creux sous le seuil ; à défaut, le minimum global s'il est assez net.
    let tau = -1;
    for (let t = tauMin; t < tauMax; t++) {
      if (cmnd[t] < this.threshold) {
        while (t + 1 < tauMax && cmnd[t + 1] < cmnd[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      let best = tauMin;
      for (let t = tauMin + 1; t < tauMax; t++) if (cmnd[t] < cmnd[best]) best = t;
      if (cmnd[best] > 0.3) return null;
      tau = best;
    }

    let refined = tau;
    if (tau > 1 && tau < tauMax) {
      const a = cmnd[tau - 1];
      const b = cmnd[tau];
      const c = cmnd[tau + 1];
      const denom = a - 2 * b + c;
      if (denom > 1e-12) refined = tau + (0.5 * (a - c)) / denom;
    }
    return { freq: this.rate / refined, clarity: Math.max(0, 1 - cmnd[tau]) };
  }
}
