/**
 * Saillance de hauteur par sommation d'harmoniques : pour chaque note
 * candidate, on additionne l'énergie trouvée à ses premiers harmoniques.
 * La note la plus saillante de la trame est retenue comme note de mélodie.
 */
export class MelodySalience {
  readonly minMidi: number;
  readonly maxMidi: number;
  /** Saillance de la note renvoyée par le dernier appel à `frame`. */
  salience = 0;

  private readonly harmonics: number;
  private readonly bins: Int32Array;
  private readonly weights: Float32Array;
  private readonly bias: Float32Array;

  constructor(sampleRate: number, fftSize: number, tuning = 0, minMidi = 48, maxMidi = 86, harmonics = 5) {
    this.minMidi = minMidi;
    this.maxMidi = maxMidi;
    this.harmonics = harmonics;
    const notes = maxMidi - minMidi + 1;
    const binHz = sampleRate / fftSize;
    const top = fftSize / 2 - 2;
    this.bins = new Int32Array(notes * harmonics);
    this.weights = new Float32Array(harmonics);
    this.bias = new Float32Array(notes);
    for (let h = 0; h < harmonics; h++) this.weights[h] = Math.pow(0.8, h);
    for (let i = 0; i < notes; i++) {
      const f0 = 440 * Math.pow(2, (minMidi + i + tuning - 69) / 12);
      // La mélodie est en général la voix la plus aiguë : léger avantage aux aigus.
      this.bias[i] = 1 + 0.02 * i;
      for (let h = 0; h < harmonics; h++) {
        const k = Math.round((f0 * (h + 1)) / binHz);
        this.bins[i * harmonics + h] = k >= 1 && k <= top ? k : -1;
      }
    }
  }

  /** Note MIDI la plus saillante pour ce spectre d'amplitude. */
  frame(mags: Float32Array): number {
    const { bins, weights, harmonics, bias } = this;
    const notes = this.maxMidi - this.minMidi + 1;
    let best = 0;
    let bestVal = 0;
    for (let i = 0; i < notes; i++) {
      let s = 0;
      for (let h = 0; h < harmonics; h++) {
        const k = bins[i * harmonics + h];
        if (k < 0) break;
        let m = mags[k];
        if (mags[k - 1] > m) m = mags[k - 1];
        if (mags[k + 1] > m) m = mags[k + 1];
        s += weights[h] * Math.sqrt(m);
      }
      s *= bias[i];
      if (s > bestVal) {
        bestVal = s;
        best = i;
      }
    }
    this.salience = bestVal;
    return this.minMidi + best;
  }
}

export interface MelodyFrames {
  /** Note MIDI retenue par trame. */
  pitch: Int16Array;
  /** Saillance de cette note par trame. */
  salience: Float32Array;
  /** Trames par seconde. */
  fps: number;
}

function percentile(values: Float32Array, p: number): number {
  if (values.length === 0) return 0;
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/**
 * Ramène la mélodie trame par trame sur la grille rythmique.
 * `slotTimes` contient les bornes des subdivisions (une de plus que de subdivisions).
 * Pour chaque subdivision : vote pondéré des trames, puis décision voisé / silence.
 */
export function quantizeMelody(
  frames: MelodyFrames,
  slotTimes: number[],
  onsetEnv: Float32Array,
  onsetFps: number,
): { melody: (number | null)[]; attacks: number[] } {
  const slots = slotTimes.length - 1;
  const melody: (number | null)[] = new Array(slots).fill(null);
  const share = new Float32Array(slots);
  const reference = percentile(frames.salience, 0.9);
  const voicedThreshold = reference * 0.3;
  const hist = new Float32Array(128);
  const nFrames = frames.pitch.length;

  for (let s = 0; s < slots; s++) {
    let f0 = Math.ceil(slotTimes[s] * frames.fps);
    let f1 = Math.ceil(slotTimes[s + 1] * frames.fps);
    if (f0 >= nFrames) break;
    if (f1 > nFrames) f1 = nFrames;
    if (f1 <= f0) f1 = Math.min(nFrames, f0 + 1);
    f0 = Math.max(0, f0);
    hist.fill(0);
    let total = 0;
    for (let f = f0; f < f1; f++) {
      hist[frames.pitch[f]] += frames.salience[f];
      total += frames.salience[f];
    }
    if (total <= 0) continue;
    let best = 0;
    for (let m = 1; m < 128; m++) if (hist[m] > hist[best]) best = m;
    share[s] = hist[best] / total;
    if (total / (f1 - f0) >= voicedThreshold && share[s] >= 0.4) melody[s] = best;
  }

  // Nettoyage : sauts d'octave isolés et notes parasites d'une seule subdivision.
  for (let s = 1; s < slots - 1; s++) {
    const prev = melody[s - 1];
    const cur = melody[s];
    const next = melody[s + 1];
    if (prev === null || next === null || cur === null || prev !== next || cur === prev) continue;
    if (Math.abs(cur - prev) === 12 || share[s] < 0.6) melody[s] = prev;
  }

  const attacks = new Array<number>(slots).fill(0);
  const reach = Math.max(1, Math.round(onsetFps * 0.06));
  for (let s = 0; s < slots; s++) {
    const cur = melody[s];
    if (cur === null) continue;
    if (s === 0 || melody[s - 1] !== cur) {
      attacks[s] = 1;
      continue;
    }
    // Même note que la subdivision précédente : nouvelle attaque seulement si
    // l'enveloppe d'attaques marque un pic net à cet instant.
    const center = Math.round(slotTimes[s] * onsetFps);
    let peak = 0;
    for (let i = Math.max(0, center - reach); i <= Math.min(onsetEnv.length - 1, center + reach); i++) {
      if (onsetEnv[i] > peak) peak = onsetEnv[i];
    }
    if (peak > 2) attacks[s] = 1;
  }
  return { melody, attacks };
}
