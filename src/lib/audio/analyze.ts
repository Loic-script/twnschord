import { estimateTempo, normalizeOnsets, trackBeats } from "./beat";
import { buildChords, FILE_QUALITIES, scoreChords } from "./chords";
import { cosine, SpectralChroma } from "./chroma";
import { FFT, hannWindow } from "./fft";
import { estimateKey } from "./key";
import { MelodySalience, quantizeMelody } from "./melody";
import type { Analysis, ProgressFn } from "./types";

const SLOTS_PER_BEAT = 2;
const CHANGE_PENALTY = 0.12;
const NO_CHORD_SCORE = 0.55;

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : 0.5 * (s[mid - 1] + s[mid]);
}

/** Écart entre la phase de mesure la plus marquée et la moyenne, pour une métrique donnée. */
function meterContrast(novelty: Float32Array, beatsPerBar: number): { phase: number; value: number } {
  const sums = new Float32Array(beatsPerBar);
  const counts = new Float32Array(beatsPerBar);
  let total = 0;
  for (let i = 0; i < novelty.length; i++) {
    sums[i % beatsPerBar] += novelty[i];
    counts[i % beatsPerBar]++;
    total += novelty[i];
  }
  const mean = novelty.length ? total / novelty.length : 0;
  let phase = 0;
  let max = -Infinity;
  for (let p = 0; p < beatsPerBar; p++) {
    const v = counts[p] ? sums[p] / counts[p] : 0;
    if (v > max) {
      max = v;
      phase = p;
    }
  }
  return { phase, value: mean > 1e-6 ? (max - mean) / mean : 0 };
}

/**
 * Analyse complète d'un morceau : accordage, tempo et temps, mesure,
 * accords temps par temps, tonalité et mélodie quantifiée.
 *
 * `samples` est un signal mono ; 22 050 Hz est la cadence visée, mais toute
 * cadence fonctionne (les tailles de fenêtres s'adaptent).
 */
export async function analyzeAudio(
  samples: Float32Array,
  sampleRate: number,
  onProgress?: ProgressFn,
): Promise<Analysis> {
  const duration = samples.length / sampleRate;
  if (duration < 1) throw new Error("Extrait trop court : il faut au moins une seconde de son.");

  // Fenêtre longue (≈ 190 ms) pour l'harmonie et la mélodie, courte pour les attaques.
  let size = 1024;
  while (size < sampleRate * 0.14) size *= 2;
  const hop = size / 8;
  const onsetSize = size / 4;
  const onsetHop = hop / 2;
  const fps = sampleRate / hop;
  const onsetFps = sampleRate / onsetHop;
  const nFrames = Math.floor(samples.length / hop) + 1;
  const nOnsets = Math.floor(samples.length / onsetHop) + 1;

  const fill = (buf: Float32Array, center: number) => {
    const start = center - (buf.length >> 1);
    for (let i = 0; i < buf.length; i++) {
      const idx = start + i;
      buf[i] = idx >= 0 && idx < samples.length ? samples[idx] : 0;
    }
  };

  const fft = new FFT(size);
  const win = hannWindow(size);
  const buf = new Float32Array(size);
  const mags = new Float32Array(size / 2);
  const chroma12 = new Float32Array(12);
  const bass12 = new Float32Array(12);
  const chroma = new SpectralChroma(sampleRate, size);

  // 1. Accordage global, sur un échantillon de trames.
  onProgress?.(0, "Accordage");
  for (let i = 0; i < nFrames; i += 6) {
    fill(buf, i * hop);
    fft.magnitudes(buf, win, mags);
    chroma.compute(mags, chroma12, bass12);
  }
  const tuning = chroma.estimatedTuning();
  chroma.tuning = tuning;
  await pause();

  // 2. Chroma, basse et mélodie trame par trame.
  const chromaFrames = new Float32Array(nFrames * 12);
  const bassFrames = new Float32Array(nFrames * 12);
  const pitchFrames = new Int16Array(nFrames);
  const salienceFrames = new Float32Array(nFrames);
  const salience = new MelodySalience(sampleRate, size, tuning);
  for (let i = 0; i < nFrames; i++) {
    fill(buf, i * hop);
    fft.magnitudes(buf, win, mags);
    chroma.compute(mags, chroma12, bass12);
    chromaFrames.set(chroma12, i * 12);
    bassFrames.set(bass12, i * 12);
    pitchFrames[i] = salience.frame(mags);
    salienceFrames[i] = salience.salience;
    if (i % 256 === 255) {
      onProgress?.(0.1 + 0.55 * (i / nFrames), "Harmonie");
      await pause();
    }
  }

  // 3. Enveloppe d'attaques (flux spectral sur fenêtre courte).
  const onsetFft = new FFT(onsetSize);
  const onsetWin = hannWindow(onsetSize);
  const onsetBuf = new Float32Array(onsetSize);
  const onsetMags = new Float32Array(onsetSize / 2);
  const previous = new Float32Array(onsetSize / 2);
  const flux = new Float32Array(nOnsets);
  const scale = (4 / onsetSize) * 1000;
  for (let j = 0; j < nOnsets; j++) {
    fill(onsetBuf, j * onsetHop);
    onsetFft.magnitudes(onsetBuf, onsetWin, onsetMags);
    let sum = 0;
    for (let k = 1; k < onsetMags.length; k++) {
      const v = Math.log1p(onsetMags[k] * scale);
      const d = v - previous[k];
      if (d > 0) sum += d;
      previous[k] = v;
    }
    flux[j] = j === 0 ? 0 : sum;
    if (j % 1024 === 1023) {
      onProgress?.(0.65 + 0.2 * (j / nOnsets), "Rythme");
      await pause();
    }
  }
  const onsetEnv = normalizeOnsets(flux, onsetFps);

  // 4. Tempo et temps.
  onProgress?.(0.86, "Tempo");
  let bpm = estimateTempo(onsetEnv, onsetFps);
  let beats: number[] = [];
  if (bpm > 0) beats = trackBeats(onsetEnv, onsetFps, bpm).map((f) => f / onsetFps);
  if (bpm <= 0 || beats.length < 4) {
    bpm = bpm > 0 ? bpm : 120;
    beats = [0];
  }
  const intervals: number[] = [];
  for (let i = 1; i < beats.length; i++) intervals.push(beats[i] - beats[i - 1]);
  // Les temps tombent sur des trames entières : la médiane seule arrondirait le tempo.
  // On moyenne donc les intervalles proches de la médiane.
  const typical = intervals.length ? median(intervals) : 60 / bpm;
  const steady = intervals.filter((d) => Math.abs(d - typical) <= typical * 0.1);
  const period = steady.length ? steady.reduce((a, b) => a + b, 0) / steady.length : typical;
  // On prolonge la grille jusqu'aux deux bouts du morceau.
  while (beats[0] - period >= -0.02) beats.unshift(Math.max(0, beats[0] - period));
  while (beats[beats.length - 1] + period < duration) beats.push(beats[beats.length - 1] + period);
  const nBeats = beats.length;
  await pause();

  // 5. Chroma et basse moyennés par temps.
  const beatChroma = new Float32Array(nBeats * 12);
  const beatBass = new Float32Array(nBeats * 12);
  const energy = new Float32Array(nBeats);
  for (let b = 0; b < nBeats; b++) {
    const t1 = b + 1 < nBeats ? beats[b + 1] : Math.min(duration, beats[b] + period);
    let f0 = Math.min(nFrames - 1, Math.ceil(beats[b] * fps));
    let f1 = Math.min(nFrames, Math.ceil(t1 * fps));
    if (f1 <= f0) f1 = f0 + 1;
    f0 = Math.max(0, f0);
    for (let f = f0; f < f1; f++) {
      for (let i = 0; i < 12; i++) {
        beatChroma[b * 12 + i] += chromaFrames[f * 12 + i];
        beatBass[b * 12 + i] += bassFrames[f * 12 + i];
      }
    }
    let e = 0;
    for (let i = 0; i < 12; i++) e += beatChroma[b * 12 + i];
    energy[b] = e / (f1 - f0);
  }
  const loud = Float32Array.from(energy).sort()[Math.min(nBeats - 1, Math.floor(nBeats * 0.9))];
  const silent = (b: number) => energy[b] < loud * 0.1;

  // 6. Mesure : 3 ou 4 temps, et position du premier temps fort,
  //    d'après les endroits où l'harmonie change le plus.
  const novelty = new Float32Array(nBeats);
  for (let b = 1; b < nBeats; b++) {
    if (silent(b) || silent(b - 1)) continue;
    novelty[b] = 1 - cosine(beatChroma, beatChroma, (b - 1) * 12, b * 12);
  }
  const four = meterContrast(novelty, 4);
  const three = meterContrast(novelty, 3);
  const ternary = three.value > 0.3 && three.value > four.value * 1.4;
  const beatsPerBar = ternary ? 3 : 4;
  const downbeat = ternary ? three.phase : four.phase;

  // 7. Accords : Viterbi sur les temps, les changements étant moins coûteux
  //    en début de mesure qu'au milieu.
  onProgress?.(0.9, "Accords");
  const chords = buildChords(FILE_QUALITIES);
  const nStates = chords.length + 1;
  const none = chords.length;
  const scores = new Float32Array(chords.length);
  let delta = new Float32Array(nStates);
  let next = new Float32Array(nStates);
  const back = new Int16Array(nBeats * nStates);
  for (let b = 0; b < nBeats; b++) {
    const quiet = silent(b);
    if (!quiet) scoreChords(beatChroma, beatBass, chords, scores, 0.1, b * 12, b * 12);
    const pos = (((b - downbeat) % beatsPerBar) + beatsPerBar) % beatsPerBar;
    const factor = pos === 0 ? 0.6 : beatsPerBar === 4 && pos === 2 ? 0.9 : 1.3;
    const penalty = CHANGE_PENALTY * factor;
    let bestPrev = 0;
    for (let s = 1; s < nStates; s++) if (delta[s] > delta[bestPrev]) bestPrev = s;
    for (let s = 0; s < nStates; s++) {
      const emission = s === none ? (quiet ? 1 : NO_CHORD_SCORE) : quiet ? 0 : scores[s];
      if (b > 0 && delta[bestPrev] - penalty > delta[s]) {
        next[s] = delta[bestPrev] - penalty + emission;
        back[b * nStates + s] = bestPrev;
      } else {
        next[s] = delta[s] + emission;
        back[b * nStates + s] = s;
      }
    }
    [delta, next] = [next, delta];
  }
  let state = 0;
  for (let s = 1; s < nStates; s++) if (delta[s] > delta[state]) state = s;
  const beatChords = new Array<string>(nBeats);
  for (let b = nBeats - 1; b >= 0; b--) {
    beatChords[b] = state === none ? "N" : chords[state].label;
    state = back[b * nStates + state];
  }

  // 8. Tonalité, sur la somme des chromas normalisés de chaque temps.
  const global = new Float32Array(12);
  for (let b = 0; b < nBeats; b++) {
    if (silent(b)) continue;
    let norm = 0;
    for (let i = 0; i < 12; i++) norm += beatChroma[b * 12 + i] ** 2;
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < 12; i++) global[i] += beatChroma[b * 12 + i] / norm;
  }
  const key = estimateKey(global);

  // 9. Mélodie ramenée sur la grille (deux subdivisions par temps).
  onProgress?.(0.95, "Mélodie");
  const slotTimes: number[] = [];
  for (let b = 0; b < nBeats; b++) {
    const t1 = b + 1 < nBeats ? beats[b + 1] : beats[b] + period;
    for (let s = 0; s < SLOTS_PER_BEAT; s++) slotTimes.push(beats[b] + ((t1 - beats[b]) * s) / SLOTS_PER_BEAT);
  }
  slotTimes.push(beats[nBeats - 1] + period);
  const { melody, attacks } = quantizeMelody(
    { pitch: pitchFrames, salience: salienceFrames, fps },
    slotTimes,
    onsetEnv,
    onsetFps,
  );
  // Pas de mélodie pendant les silences.
  for (let b = 0; b < nBeats; b++) {
    if (!silent(b)) continue;
    for (let s = 0; s < SLOTS_PER_BEAT; s++) {
      melody[b * SLOTS_PER_BEAT + s] = null;
      attacks[b * SLOTS_PER_BEAT + s] = 0;
    }
  }

  onProgress?.(1, "Terminé");
  return {
    version: 1,
    duration: Math.round(duration * 1000) / 1000,
    tempo: Math.round((60 / period) * 10) / 10,
    beats: beats.map((t) => Math.round(t * 1000) / 1000),
    beatsPerBar,
    downbeat,
    key,
    tuningCents: Math.round(tuning * 100),
    beatChords,
    slotsPerBeat: SLOTS_PER_BEAT,
    melody,
    attacks,
  };
}
