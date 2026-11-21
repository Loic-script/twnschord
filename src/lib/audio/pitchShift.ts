import { FFT, hannWindow } from "./fft";

const SIZE = 4096;
const HOP = SIZE / 4;
const TWO_PI = 2 * Math.PI;

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Monte ou descend un enregistrement de `semitones` demi-tons sans changer sa
 * durée ni sa vitesse.
 *
 * Méthode : vocodeur de phase. Le son est d'abord étiré dans le temps — on le
 * découpe en trames, on mesure la fréquence réelle de chaque composante d'après
 * l'avance de sa phase, puis on recolle les trames plus espacées en gardant ces
 * phases cohérentes. Le résultat étiré est ensuite relu plus vite (ou plus
 * lentement) : la durée d'origine revient, et la hauteur a changé.
 * Les phases des composantes voisines d'un pic du spectre sont verrouillées sur
 * lui, ce qui évite le son « métallique » d'un vocodeur naïf.
 */
export async function pitchShift(input: Float32Array, semitones: number, onProgress?: (fraction: number) => void): Promise<Float32Array> {
  if (semitones === 0 || input.length === 0) return input.slice();
  const ratio = Math.pow(2, semitones / 12);
  const analysisHop = HOP / ratio;
  const half = SIZE / 2;
  const bins = half + 1;
  const frames = Math.ceil(input.length / analysisHop) + 1;
  const stretched = new Float32Array(frames * HOP + SIZE);

  const fft = new FFT(SIZE);
  const win = hannWindow(SIZE);
  const re = new Float32Array(SIZE);
  const im = new Float32Array(SIZE);
  const mag = new Float32Array(bins);
  const phase = new Float32Array(bins);
  const previousPhase = new Float32Array(bins);
  const outPhase = new Float64Array(bins);
  const nextPhase = new Float64Array(bins);
  const peaks = new Int32Array(bins);
  // En montant, ce qui dépasserait la fréquence maximale est coupé pour ne pas se replier en parasites.
  const cutoff = ratio > 1 ? Math.floor(half / ratio) : half;
  let previousStart = 0;

  for (let i = 0; i < frames; i++) {
    const start = Math.round(i * analysisHop) - half;
    for (let j = 0; j < SIZE; j++) {
      const index = start + j;
      re[j] = index >= 0 && index < input.length ? input[index] * win[j] : 0;
      im[j] = 0;
    }
    fft.transform(re, im);
    for (let k = 0; k < bins; k++) {
      mag[k] = Math.hypot(re[k], im[k]);
      phase[k] = Math.atan2(im[k], re[k]);
    }

    if (i === 0) {
      for (let k = 0; k < bins; k++) nextPhase[k] = phase[k];
    } else {
      const advance = start - previousStart;
      // Pics du spectre : chacun impose sa phase à ses voisins.
      let count = 0;
      for (let k = 2; k < bins - 2; k++) {
        const m = mag[k];
        if (m > mag[k - 1] && m > mag[k - 2] && m >= mag[k + 1] && m >= mag[k + 2]) peaks[count++] = k;
      }
      if (count === 0) {
        for (let k = 0; k < bins; k++) nextPhase[k] = phase[k];
      } else {
        for (let p = 0; p < count; p++) {
          const k = peaks[p];
          const omega = (TWO_PI * k) / SIZE;
          let delta = phase[k] - previousPhase[k] - omega * advance;
          delta -= TWO_PI * Math.round(delta / TWO_PI);
          const peakPhase = outPhase[k] + (omega + delta / advance) * HOP;
          const from = p === 0 ? 0 : (peaks[p - 1] + k + 1) >> 1;
          const to = p === count - 1 ? bins - 1 : (k + peaks[p + 1]) >> 1;
          for (let b = from; b <= to; b++) nextPhase[b] = peakPhase + phase[b] - phase[k];
        }
      }
    }

    for (let k = 0; k < bins; k++) {
      const wrapped = nextPhase[k] - TWO_PI * Math.round(nextPhase[k] / TWO_PI);
      outPhase[k] = wrapped;
      previousPhase[k] = phase[k];
      const m = k <= cutoff ? mag[k] : 0;
      re[k] = m * Math.cos(wrapped);
      im[k] = m * Math.sin(wrapped);
    }
    // Spectre d'un signal réel : la seconde moitié est le conjugué de la première.
    for (let k = 1; k < half; k++) {
      re[SIZE - k] = re[k];
      im[SIZE - k] = -im[k];
    }
    fft.transform(re, im, true);
    const offset = i * HOP;
    for (let j = 0; j < SIZE; j++) stretched[offset + j] += re[j] * win[j];
    previousStart = start;

    if (i % 64 === 63) {
      onProgress?.(i / frames);
      await pause();
    }
  }

  // Relecture à la vitesse qui ramène la durée d'origine. Les fenêtres superposées
  // (quatre par point) se somment à 1,5 : on divise pour retrouver le niveau.
  const out = new Float32Array(input.length);
  const last = stretched.length - 2;
  for (let t = 0; t < out.length; t++) {
    const position = Math.min(last, t * ratio + half);
    const index = Math.floor(position);
    const a = stretched[index];
    out[t] = (a + (stretched[index + 1] - a) * (position - index)) / 1.5;
  }
  onProgress?.(1);
  return out;
}
