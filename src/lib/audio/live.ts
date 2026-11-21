import { bestChord, buildChords, LIVE_QUALITIES, scoreChords, type ChordDef } from "./chords";
import { cosine, SpectralChroma } from "./chroma";
import { FFT, hannWindow } from "./fft";
import { freqToMidi } from "./notes";
import { PitchDetector } from "./pitch";

export interface LiveNote {
  /** Note MIDI la plus proche. */
  midi: number;
  freq: number;
  /** Écart à la note juste, en cents (−50 … +50). */
  cents: number;
  clarity: number;
}

export interface LiveChord {
  label: string;
  /** "note" quand une seule note sonne, "chord" sinon. */
  kind: "note" | "chord";
  root: number;
  tones: number[];
  /** Ressemblance entre le son et l'accord, de 0 à 1. */
  confidence: number;
}

export interface LiveResult {
  silent: boolean;
  /** Niveau d'entrée (RMS). */
  level: number;
  note: LiveNote | null;
  chord: LiveChord | null;
  /** Énergie lissée des 12 classes de hauteur, normalisée entre 0 et 1. */
  chroma: Float32Array;
}

const MIN_CONFIDENCE = 0.72;

/**
 * Analyse en continu : reçoit les `bufferSize` derniers échantillons du micro
 * et renvoie la note et l'accord entendus. Aucun accès au DOM ni au réseau.
 */
export class LiveAnalyzer {
  readonly bufferSize: number;

  private readonly fft: FFT;
  private readonly window: Float32Array;
  private readonly mags: Float32Array;
  private readonly chromaCalc: SpectralChroma;
  private readonly pitch: PitchDetector;
  private readonly pitchSize: number;
  private readonly chords: ChordDef[];
  private readonly scores: Float32Array;
  private readonly frame = new Float32Array(12);
  private readonly bass = new Float32Array(12);
  private readonly smooth = new Float32Array(12);
  private readonly smoothBass = new Float32Array(12);
  private readonly out = new Float32Array(12);
  private noiseFloor = 0.002;
  private candidate = -1;
  private candidateCount = 0;
  private current = -1;
  private recentNotes: number[] = [];

  constructor(sampleRate: number, bufferSize = 8192) {
    this.bufferSize = bufferSize;
    this.fft = new FFT(bufferSize);
    this.window = hannWindow(bufferSize);
    this.mags = new Float32Array(bufferSize / 2);
    this.chromaCalc = new SpectralChroma(sampleRate, bufferSize, { minFreq: 60, maxFreq: 2100 });
    this.pitchSize = bufferSize / 2;
    this.pitch = new PitchDetector(sampleRate, this.pitchSize);
    this.chords = buildChords(LIVE_QUALITIES);
    this.scores = new Float32Array(this.chords.length);
  }

  reset(): void {
    this.smooth.fill(0);
    this.smoothBass.fill(0);
    this.candidate = -1;
    this.candidateCount = 0;
    this.current = -1;
    this.recentNotes = [];
  }

  process(buf: Float32Array): LiveResult {
    let sq = 0;
    for (let i = 0; i < buf.length; i++) sq += buf[i] * buf[i];
    const level = Math.sqrt(sq / buf.length);

    // Seuil de silence adaptatif : le bruit de fond de la pièce est suivi lentement.
    if (level < this.noiseFloor) this.noiseFloor = level;
    else this.noiseFloor += (level - this.noiseFloor) * 0.001;
    const gate = Math.max(0.004, this.noiseFloor * 3);

    if (level < gate) {
      for (let i = 0; i < 12; i++) {
        this.smooth[i] *= 0.7;
        this.smoothBass[i] *= 0.7;
      }
      this.candidate = -1;
      this.candidateCount = 0;
      this.current = -1;
      this.recentNotes = [];
      this.out.fill(0);
      return { silent: true, level, note: null, chord: null, chroma: this.out };
    }

    // — Accord : chroma lissé dans le temps, comparé aux gabarits.
    this.fft.magnitudes(buf, this.window, this.mags);
    this.chromaCalc.compute(this.mags, this.frame, this.bass);
    // Une attaque change brutalement le chroma : on suit alors plus vite.
    const alpha = cosine(this.frame, this.smooth) < 0.6 ? 0.7 : 0.4;
    let max = 0;
    for (let i = 0; i < 12; i++) {
      this.smooth[i] += (this.frame[i] - this.smooth[i]) * alpha;
      this.smoothBass[i] += (this.bass[i] - this.smoothBass[i]) * alpha;
      if (this.smooth[i] > max) max = this.smooth[i];
    }
    for (let i = 0; i < 12; i++) this.out[i] = max > 0 ? this.smooth[i] / max : 0;

    scoreChords(this.smooth, this.smoothBass, this.chords, this.scores);
    const best = bestChord(this.scores);
    if (best === this.candidate) this.candidateCount++;
    else {
      this.candidate = best;
      this.candidateCount = 1;
    }
    // Un accord doit tenir deux trames de suite avant de remplacer l'affichage.
    if (this.candidateCount >= 2) this.current = best;

    let chord: LiveChord | null = null;
    if (this.current >= 0) {
      const def = this.chords[this.current];
      const confidence = cosine(this.smooth, def.template);
      if (confidence >= MIN_CONFIDENCE) {
        chord = {
          label: def.label,
          kind: def.quality === "note" ? "note" : "chord",
          root: def.root,
          tones: def.tones,
          confidence: Math.min(1, confidence),
        };
      }
    }

    // — Note : hauteur fondamentale sur la moitié la plus récente du tampon.
    let note: LiveNote | null = null;
    const pitch = this.pitch.detect(buf.subarray(buf.length - this.pitchSize));
    if (pitch && pitch.clarity > 0.8) {
      const exact = freqToMidi(pitch.freq);
      const midi = Math.round(exact);
      this.recentNotes.push(midi);
      if (this.recentNotes.length > 3) this.recentNotes.shift();
      // Affichée seulement si deux des trois dernières mesures concordent.
      const agree = this.recentNotes.filter((m) => m === midi).length;
      if (agree >= 2) {
        note = { midi, freq: pitch.freq, cents: Math.round((exact - midi) * 100), clarity: pitch.clarity };
      }
    } else {
      this.recentNotes = [];
    }

    return { silent: false, level, note, chord, chroma: this.out };
  }
}
