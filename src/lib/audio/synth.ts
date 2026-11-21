/**
 * Génération sonore : lit une suite d'accords saisie par l'utilisateur et en
 * fabrique un arrangement — jusqu'à cinq pistes d'accompagnement (instruments,
 * batterie, basse) et une mélodie. Tout est synthétisé par calcul, sans
 * échantillon enregistré ni accès réseau, et ne dépend pas du navigateur.
 */
import { LETTER_NAMES } from "./notes";
import { BASS_STYLES, DRUM_STYLES, PLAY_STYLES } from "./styles";
import { generateMelody, MELODY_BASE, parseMelody, solfaDoOf, type MelodyNote } from "./tune";
import { addBass, mixBass, Noise, playDrum, playNote, PROFILES, type InstrumentId } from "./voices";

// ——— Lecture des accords ———

export interface ParsedChord {
  /** Nom normalisé, en lettres : "F♯m7", "C/E". */
  label: string;
  /** Fondamentale (0 = Do … 11 = Si). */
  root: number;
  /** Intervalles en demi-tons depuis la fondamentale. */
  intervals: number[];
  /** Note de basse imposée par une écriture « C/E », sinon null. */
  bass: number | null;
  /** Partie du nom qui suit la fondamentale : "m7", "sus4"… */
  suffix: string;
}

/** Le même accord, monté (ou descendu) de `semitones` demi-tons. */
export function transposeChord(chord: ParsedChord, semitones: number): ParsedChord {
  const shift = ((Math.round(semitones) % 12) + 12) % 12;
  if (shift === 0) return chord;
  const root = (chord.root + shift) % 12;
  const bass = chord.bass === null ? null : (chord.bass + shift) % 12;
  const label = LETTER_NAMES[root] + chord.suffix + (bass === null ? "" : `/${LETTER_NAMES[bass]}`);
  return { ...chord, root, bass, label };
}

const QUALITIES: { names: string[]; suffix: string; intervals: number[] }[] = [
  { names: ["", "maj", "M"], suffix: "", intervals: [0, 4, 7] },
  { names: ["m", "min", "-"], suffix: "m", intervals: [0, 3, 7] },
  { names: ["7", "dom7"], suffix: "7", intervals: [0, 4, 7, 10] },
  { names: ["maj7", "M7", "ma7", "Δ"], suffix: "maj7", intervals: [0, 4, 7, 11] },
  { names: ["m7", "min7", "-7"], suffix: "m7", intervals: [0, 3, 7, 10] },
  { names: ["dim", "°"], suffix: "dim", intervals: [0, 3, 6] },
  { names: ["dim7", "°7"], suffix: "dim7", intervals: [0, 3, 6, 9] },
  { names: ["m7b5", "ø"], suffix: "m7♭5", intervals: [0, 3, 6, 10] },
  { names: ["aug", "+"], suffix: "aug", intervals: [0, 4, 8] },
  { names: ["sus4", "sus"], suffix: "sus4", intervals: [0, 5, 7] },
  { names: ["sus2"], suffix: "sus2", intervals: [0, 2, 7] },
  { names: ["7sus4", "7sus"], suffix: "7sus4", intervals: [0, 5, 7, 10] },
  { names: ["6"], suffix: "6", intervals: [0, 4, 7, 9] },
  { names: ["m6", "min6"], suffix: "m6", intervals: [0, 3, 7, 9] },
  { names: ["9"], suffix: "9", intervals: [0, 4, 7, 10, 14] },
  { names: ["m9", "min9"], suffix: "m9", intervals: [0, 3, 7, 10, 14] },
  { names: ["maj9", "M9"], suffix: "maj9", intervals: [0, 4, 7, 11, 14] },
  { names: ["add9"], suffix: "add9", intervals: [0, 4, 7, 14] },
  { names: ["5"], suffix: "5", intervals: [0, 7] },
];

const QUALITY_BY_NAME = new Map<string, (typeof QUALITIES)[number]>();
for (const quality of QUALITIES) for (const name of quality.names) QUALITY_BY_NAME.set(name, quality);

function findQuality(raw: string) {
  const text = raw.replace(/♭/g, "b").replace(/♯/g, "#");
  // « M » (majeur) et « m » (mineur) se distinguent par la casse : on essaie d'abord tel quel.
  return QUALITY_BY_NAME.get(text) ?? QUALITY_BY_NAME.get(text.toLowerCase()) ?? null;
}

const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LATIN_ROOTS: [string, string][] = [
  ["sol", "G"],
  ["do", "C"],
  ["ré", "D"],
  ["re", "D"],
  ["mi", "E"],
  ["fa", "F"],
  ["la", "A"],
  ["si", "B"],
];

interface RootMatch {
  pc: number;
  name: string;
  rest: string;
}

/** Lectures possibles du début d'un accord : nom latin (« Sol », « Sib ») puis lettre (« G », « Bb »). */
function rootMatches(text: string): RootMatch[] {
  const starts: { letter: string; rest: string }[] = [];
  const lower = text.toLowerCase();
  for (const [name, letter] of LATIN_ROOTS) {
    if (lower.startsWith(name)) starts.push({ letter, rest: text.slice(name.length) });
  }
  const first = text.charAt(0).toUpperCase();
  if (first in NATURAL) starts.push({ letter: first, rest: text.slice(1) });

  return starts.map(({ letter, rest }) => {
    const mark = rest.charAt(0);
    const shift = mark === "#" || mark === "♯" ? 1 : mark === "b" || mark === "♭" ? -1 : 0;
    return {
      pc: (NATURAL[letter] + shift + 12) % 12,
      name: letter + (shift === 1 ? "♯" : shift === -1 ? "♭" : ""),
      rest: shift === 0 ? rest : rest.slice(1),
    };
  });
}

export function parseChord(token: string): ParsedChord | null {
  const parts = token.split("/");
  if (parts.length > 2) return null;
  for (const root of rootMatches(parts[0])) {
    const quality = findQuality(root.rest);
    if (!quality) continue;
    let bass: number | null = null;
    let bassName = "";
    if (parts.length === 2) {
      const match = rootMatches(parts[1]).find((r) => r.rest === "");
      if (!match) return null;
      bass = match.pc;
      bassName = `/${match.name}`;
    }
    return { label: root.name + quality.suffix + bassName, root: root.pc, intervals: quality.intervals, bass, suffix: quality.suffix };
  }
  return null;
}

export const MAX_CHORDS = 64;

/**
 * Lit une suite d'accords : « C G Am F », « Do Sol Lam Fa », « Dm7 | G7 | Cmaj7 ».
 * Les accords sont séparés par des espaces, virgules ou barres ; « % » répète le précédent.
 */
export function parseProgression(text: string): { chords: ParsedChord[]; errors: string[] } {
  const chords: ParsedChord[] = [];
  const errors: string[] = [];
  for (const token of text.trim().split(/[\s,;|]+/)) {
    if (!token || /^[-–—:.]+$/.test(token)) continue;
    if (chords.length >= MAX_CHORDS) break;
    if (token === "%") {
      if (chords.length > 0) chords.push(chords[chords.length - 1]);
      else errors.push(token);
      continue;
    }
    const chord = parseChord(token);
    if (chord) chords.push(chord);
    else errors.push(token);
  }
  return { chords, errors };
}

// ——— Arrangement ———

export type TrackInstrument = InstrumentId | "drums" | "bass";

export interface Track {
  instrument: TrackInstrument;
  /** Identifiant du jeu, du rythme de batterie ou de la ligne de basse, selon l'instrument. */
  style: string;
  /** Décalage d'octave, de −2 à +2 (sans effet sur la batterie). */
  octave: number;
  /** Volume de la piste : 1 = normal, 0 = muet, 1,5 = fort. */
  volume: number;
}

export type MelodyMode = "none" | "auto" | "manual";

export interface MelodyOptions {
  mode: MelodyMode;
  /** Mélodie écrite par l'utilisateur (mode "manual"). */
  text: string;
  /** Graine de la mélodie générée (mode "auto") : en changer donne une autre mélodie. */
  seed: number;
  instrument: InstrumentId;
  octave: number;
  volume: number;
}

export interface SongOptions {
  chords: ParsedChord[];
  /** Battements par minute. */
  tempo: number;
  /** Durée de chaque accord, en temps (mesure à 4 temps). */
  beatsPerChord: 2 | 4;
  /**
   * Changement de tonalité, en demi-tons (−12 … +12) : accords, basse et mélodie
   * sont décalés ensemble. Les accords et la mélodie restent écrits dans leur tonalité d'origine.
   */
  transpose?: number;
  tracks: Track[];
  melody?: MelodyOptions;
  sampleRate?: number;
}

export const MAX_TRANSPOSE = 12;

const transposeOf = (options: SongOptions) => clamp(Math.round(options.transpose ?? 0), -MAX_TRANSPOSE, MAX_TRANSPOSE);

/** Les accords tels qu'ils seront entendus, une fois la tonalité changée. */
export function heardChords(chords: ParsedChord[], transpose: number): ParsedChord[] {
  return transpose === 0 ? chords : chords.map((chord) => transposeChord(chord, transpose));
}

export interface RenderedSong {
  /** Signal mono : la suite d'accords, puis la résonance des dernières notes. */
  samples: Float32Array;
  sampleRate: number;
  /** Longueur de la suite d'accords elle-même, en échantillons (sans la résonance finale). */
  loopLength: number;
  /** Durée d'un accord, en secondes. */
  chordDuration: number;
}

export const MAX_TRACKS = 5;

/** Types proposés pour un instrument : jeux, rythmes de batterie ou lignes de basse. */
export function stylesFor(instrument: TrackInstrument): { id: string; name: string }[] {
  if (instrument === "drums") return DRUM_STYLES;
  if (instrument === "bass") return BASS_STYLES;
  return PLAY_STYLES;
}

/** Type choisi d'office quand on ajoute une piste de cet instrument. */
export function defaultStyle(instrument: TrackInstrument): string {
  if (instrument === "drums" || instrument === "bass") return "pop";
  if (instrument === "guitar" || instrument === "nylon") return "strum";
  if (instrument === "piano" || instrument === "epiano") return "pop";
  if (instrument === "vibes") return "arpeggio";
  return "sustain";
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Note de la classe `pc` la plus grave à partir de `low`. */
const placeAbove = (pc: number, low: number) => low + ((((pc - low) % 12) + 12) % 12);

/** Ramène une note dans l'étendue jouable. */
function fit(midi: number, low = 26, high = 100): number {
  while (midi > high) midi -= 12;
  while (midi < low) midi += 12;
  return midi;
}

/** Notes de l'accord rangées dans l'octave qui commence à `low`, du grave à l'aigu. */
function tonesFrom(chord: ParsedChord, low: number): number[] {
  const notes = chord.intervals.map((iv) => placeAbove(chord.root + iv, low));
  return [...new Set(notes)].sort((a, b) => a - b);
}

/** Montée puis descente sur les notes de l'accord, octave comprise. */
function arpeggio(tones: number[]): number[] {
  const up = [...tones, tones[0] + 12];
  return [...up, ...up.slice(1, -1).reverse()];
}

// Arpège de guitare : ordre des cordes, de la basse (0) vers l'aigu.
const PICKING = [0, 2, 3, 2, 4, 2, 3, 2];

const fifthOf = (chord: ParsedChord) => chord.intervals.find((iv) => iv >= 6 && iv <= 8) ?? 7;
const sixthOf = (chord: ParsedChord) => (chord.intervals.includes(3) ? 10 : 9);

function renderInstrument(out: Float32Array, sr: number, options: SongOptions, track: Track, beat: number, noise: Noise): void {
  const id = track.instrument as InstrumentId;
  const profile = PROFILES[id];
  const style = PLAY_STYLES.find((x) => x.id === track.style) ?? PLAY_STYLES[0];
  const shift = 12 * clamp(Math.round(track.octave), -2, 2);
  const bpc = options.beatsPerChord;
  const plucked = profile.engine === "pluck";
  const sustained = profile.engine === "blown";

  options.chords.forEach((chord, index) => {
    const t0 = index * bpc * beat;
    const low = placeAbove(chord.bass ?? chord.root, profile.low);
    const upper = tonesFrom(chord, profile.chord);
    let chordNotes: number[];
    let line: number[];
    if (plucked) {
      // Accord de guitare : la basse, l'accord, puis ses deux premières notes redoublées à l'octave.
      chordNotes = [...new Set([low, ...upper, ...upper.slice(0, 2).map((m) => m + 12)])].sort((a, b) => a - b).slice(0, 6);
      line = PICKING.map((i) => chordNotes[Math.min(i, chordNotes.length - 1)]);
    } else {
      chordNotes = upper.slice(0, profile.voices);
      line = arpeggio(chordNotes);
    }

    for (const step of style.steps) {
      if (step.at >= bpc - 1e-9) continue;
      const start = t0 + step.at * beat;
      const length = Math.min(step.dur, bpc - step.at) * beat;
      const dur = sustained ? Math.max(0.05, length - 0.03) : length;
      for (const what of step.what) {
        let notes: number[];
        let gain = step.gain * track.volume;
        if (what === "C") {
          // À la guitare, le coup vers le haut ne prend que les cordes aiguës, dans l'autre sens.
          notes = plucked && step.stroke === "u" ? chordNotes.slice(-4).reverse() : chordNotes;
        } else if (typeof what === "number") {
          notes = [line[what % line.length]];
        } else {
          notes = [low + (what === "L5" ? fifthOf(chord) : what === "L6" ? sixthOf(chord) : what === "L8" ? 12 : 0)];
          gain *= 1.35;
        }
        const stagger = what === "C" ? profile.strum : 0;
        notes.forEach((m, j) => playNote(out, sr, id, start + j * stagger, dur, fit(m + shift), gain, noise));
      }
    }
  });
}

function renderBass(out: Float32Array, sr: number, options: SongOptions, track: Track, beat: number, noise: Noise): void {
  const style = BASS_STYLES.find((x) => x.id === track.style) ?? BASS_STYLES[0];
  const shift = 12 * clamp(Math.round(track.octave), -2, 2);
  const bpc = options.beatsPerChord;
  // Tessiture d'une basse quatre cordes : la fondamentale se place à partir du Mi grave.
  const rootOf = (chord: ParsedChord) => placeAbove(chord.bass ?? chord.root, 28);
  // La basse est jouée à part, puis passe dans son préampli avant d'être mélangée.
  const bus = new Float32Array(out.length);

  options.chords.forEach((chord, index) => {
    const t0 = index * bpc * beat;
    const root = rootOf(chord);
    const next = options.chords[(index + 1) % options.chords.length];
    // Sur un accord à basse imposée (C/E), la basse ne quitte pas cette note.
    const free = chord.bass === null;
    const third = chord.intervals.find((iv) => iv === 3 || iv === 4) ?? chord.intervals.find((iv) => iv === 2 || iv === 5) ?? 7;
    const seventh = chord.intervals.includes(11) ? 11 : 10;
    for (const [at, dur, token, gain] of style.steps) {
      if (at >= bpc - 1e-9) continue;
      let midi = root;
      if (token === "8") midi = root + 12;
      else if (token === "A") midi = rootOf(next) - 1;
      else if (free) {
        if (token === "3") midi = root + third;
        else if (token === "5") midi = root + fifthOf(chord);
        else if (token === "6") midi = root + sixthOf(chord);
        else if (token === "7") midi = root + seventh;
      }
      addBass(bus, sr, t0 + at * beat, Math.min(dur, bpc - at) * beat, fit(midi + shift, 23, 72), gain, noise);
    }
  });
  mixBass(out, bus, 0.6 * track.volume);
}

function renderDrums(out: Float32Array, sr: number, options: SongOptions, track: Track, beat: number, noise: Noise): void {
  const style = DRUM_STYLES.find((x) => x.id === track.style) ?? DRUM_STYLES[0];
  const totalBeats = options.chords.length * options.beatsPerChord;
  for (let bar = 0; bar < totalBeats; bar += 4) {
    for (const [at, sound, gain] of style.hits) {
      if (bar + at >= totalBeats - 1e-9) continue;
      playDrum(out, sr, sound, (bar + at) * beat, gain * track.volume, noise);
    }
  }
}

/**
 * Notes de la mélodie pour ces réglages : générée, ou lue dans le texte de
 * l'utilisateur et répétée jusqu'à couvrir toute la suite d'accords.
 */
export function melodyNotes(options: SongOptions): { notes: MelodyNote[]; errors: string[] } {
  const melody = options.melody;
  if (!melody || melody.mode === "none" || options.chords.length === 0) return { notes: [], errors: [] };
  const base = MELODY_BASE + 12 * clamp(Math.round(melody.octave), -2, 2);
  // La mélodie est pensée dans la tonalité d'origine, puis décalée avec les accords :
  // changer de tonalité ne change donc pas son dessin.
  const shift = transposeOf(options);
  if (melody.mode === "auto") {
    const generated = generateMelody(options.chords, options.beatsPerChord, melody.seed, base);
    return { notes: generated.map((note) => ({ ...note, midi: note.midi + shift })), errors: [] };
  }
  const parsed = parseMelody(melody.text, solfaDoOf(options.chords), base);
  const totalBeats = options.chords.length * options.beatsPerChord;
  const notes: MelodyNote[] = [];
  if (parsed.beats > 0 && parsed.notes.length > 0) {
    for (let offset = 0; offset < totalBeats - 1e-9; offset += parsed.beats) {
      for (const note of parsed.notes) {
        const at = offset + note.at;
        if (at >= totalBeats - 1e-9) break;
        notes.push({ at, dur: Math.min(note.dur, totalBeats - at), midi: note.midi + shift });
      }
    }
  }
  return { notes, errors: parsed.errors };
}

export function renderSong(options: SongOptions): RenderedSong {
  const sr = options.sampleRate ?? 44100;
  const beat = 60 / clamp(options.tempo, 40, 220);
  const chordDuration = beat * options.beatsPerChord;
  const loopLength = Math.round(options.chords.length * chordDuration * sr);
  const out = new Float32Array(loopLength + Math.round(1.5 * sr));
  const noise = new Noise(20261121);

  // Les pistes jouent les accords dans la tonalité demandée.
  const heard: SongOptions = { ...options, chords: heardChords(options.chords, transposeOf(options)) };
  for (const track of options.tracks.slice(0, MAX_TRACKS)) {
    if (track.volume <= 0) continue;
    if (track.instrument === "drums") renderDrums(out, sr, heard, track, beat, noise);
    else if (track.instrument === "bass") renderBass(out, sr, heard, track, beat, noise);
    else renderInstrument(out, sr, heard, track, beat, noise);
  }

  const melody = options.melody;
  if (melody && melody.mode !== "none" && melody.volume > 0) {
    for (const note of melodyNotes(options).notes) {
      playNote(out, sr, melody.instrument, note.at * beat, Math.max(0.05, note.dur * beat - 0.02), fit(note.midi, 36, 100), 1.7 * melody.volume, noise);
    }
  }

  normalize(out);
  return { samples: out, sampleRate: sr, loopLength, chordDuration };
}

function normalize(samples: Float32Array, target = 0.89): void {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak <= 1e-9) return;
  const scale = target / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
}

/**
 * Prépare une boucle sans coupure : la résonance qui dépasse la fin est
 * reportée sur le début, comme si le morceau se répétait déjà.
 */
export function foldTail(samples: Float32Array, loopLength: number): Float32Array {
  const out = samples.slice(0, loopLength);
  if (loopLength === 0) return out;
  for (let i = loopLength; i < samples.length; i++) out[(i - loopLength) % loopLength] += samples[i];
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0.98) normalize(out, 0.95);
  return out;
}

/** Fichier WAV mono 16 bits. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const clipped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(clipped * 32767), true);
  }
  return buffer;
}
