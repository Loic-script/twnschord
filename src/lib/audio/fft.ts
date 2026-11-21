/**
 * FFT radix-2 itérative pour signaux réels.
 * Une instance par taille : les tables (bit-reversal, cos/sin) sont précalculées.
 */
export class FFT {
  readonly size: number;
  private readonly rev: Uint32Array;
  private readonly cosT: Float32Array;
  private readonly sinT: Float32Array;
  private readonly re: Float32Array;
  private readonly im: Float32Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error("La taille de la FFT doit être une puissance de 2");
    }
    this.size = size;
    this.rev = new Uint32Array(size);
    this.re = new Float32Array(size);
    this.im = new Float32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cosT = new Float32Array(size / 2);
    this.sinT = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      const a = (-2 * Math.PI * i) / size;
      this.cosT[i] = Math.cos(a);
      this.sinT[i] = Math.sin(a);
    }
  }

  /**
   * Transformée complexe en place sur `re` et `im` (longueur = size).
   * Avec `inverse`, calcule la transformée inverse, déjà divisée par la taille.
   */
  transform(re: Float32Array, im: Float32Array, inverse = false): void {
    const n = this.size;
    const { rev, cosT, sinT } = this;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        const tr = re[i];
        re[i] = re[j];
        re[j] = tr;
        const ti = im[i];
        im[i] = im[j];
        im[j] = ti;
      }
    }
    const sign = inverse ? -1 : 1;
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let start = 0; start < n; start += len) {
        for (let j = 0, t = 0; j < half; j++, t += step) {
          const a = start + j;
          const b = a + half;
          const wr = cosT[t];
          const wi = sign * sinT[t];
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
    if (inverse) {
      for (let i = 0; i < n; i++) {
        re[i] /= n;
        im[i] /= n;
      }
    }
  }

  /**
   * Spectre d'amplitude de `input` (longueur = size) multiplié par `window`.
   * Écrit size/2 valeurs dans `out`.
   */
  magnitudes(input: ArrayLike<number>, window: Float32Array, out: Float32Array): void {
    const n = this.size;
    const { re, im, rev, cosT, sinT } = this;
    for (let i = 0; i < n; i++) {
      re[rev[i]] = input[i] * window[i];
      im[i] = 0;
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let start = 0; start < n; start += len) {
        for (let j = 0, t = 0; j < half; j++, t += step) {
          const a = start + j;
          const b = a + half;
          const wr = cosT[t];
          const wi = sinT[t];
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
    const bins = n >> 1;
    for (let k = 0; k < bins; k++) {
      out[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }
  }
}

export function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  }
  return w;
}
