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
  /** Durée propre à cet accord, en temps, écrite « G:2 » ; sinon la durée commune (SongOptions.beatsPerChord). */
  beats?: number;
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
/** Durée maximale d'un accord, en temps. */
export const MAX_CHORD_BEATS = 16;

export interface ParsedProgression {
  chords: ParsedChord[];
  errors: string[];
  /** Position de chaque accord dans le texte, [début, fin[ : sert à réécrire sa durée. */
  spans: [number, number][];
}

/**
 * Lit une suite d'accords : « C G Am F », « Do Sol Lam Fa », « Dm7 | G7 | Cmaj7 ».
 * Les accords sont séparés par des espaces, virgules ou barres ; « % » répète le précédent.
 * « :n » après un accord lui donne n temps : « C G:2 D:2 ».
 */
export function parseProgression(text: string): ParsedProgression {
  const chords: ParsedChord[] = [];
  const errors: string[] = [];
  const spans: [number, number][] = [];
  for (const match of text.matchAll(/[^\s,;|]+/g)) {
    const token = match[0];
    if (/^[-–—:.]+$/.test(token)) continue;
    if (chords.length >= MAX_CHORDS) break;
    const timed = /^(.+?):(\d{1,2})$/.exec(token);
    const name = timed ? timed[1] : token;
    const beats = timed ? Math.max(1, Math.min(MAX_CHORD_BEATS, Number(timed[2]))) : undefined;
    let chord: ParsedChord | null;
    if (name === "%") {
      const previous = chords[chords.length - 1];
      chord = previous ? { ...previous, beats: undefined } : null;
    } else {
      chord = parseChord(name);
    }
    if (!chord) {
      errors.push(token);
      continue;
    }
    chords.push(beats === undefined ? chord : { ...chord, beats });
    spans.push([match.index, match.index + token.length]);
  }
  return { chords, errors, spans };
}

/**
 * Le texte avec une nouvelle durée pour l'accord situé en `span` : « Am » devient « Am:2 ».
 * `beats` null retire la durée propre (l'accord reprend la durée commune).
 */
export function withChordBeats(text: string, span: [number, number], beats: number | null): string {
  const token = text.slice(span[0], span[1]).replace(/:\d{1,2}$/, "");
  return text.slice(0, span[0]) + token + (beats === null ? "" : `:${beats}`) + text.slice(span[1]);
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
  /** Durée commune des accords, en temps ; un accord écrit « G:2 » garde la sienne. */
  beatsPerChord: number;
  /**
   * Temps par mesure (le chiffre du haut de 4/4, 3/4, 6/8…), 4 par défaut. Les motifs de jeu, de basse
   * et de batterie se répètent au rythme de la mesure.
   */
  beatsPerBar?: number;
  /**
   * Changement de tonalité, en demi-tons (−12 … +12) : accords, basse et mélodie
   * sont décalés ensemble. Les accords et la mélodie restent écrits dans leur tonalité d'origine.
   */
  transpose?: number;
  tracks: Track[];
  /** Première voix de la mélodie. */
  melody?: MelodyOptions;
  /** Voix suivantes (2ᵉ voix, 3ᵉ voix…), qui accompagnent la première. */
  voices?: VoiceOptions[];
  sampleRate?: number;
}

/**
 * Une voix qui accompagne la mélodie : en harmonie sous la voix précédente (notes de l'accord en
 * cours, une tierce à une sixte plus bas, comme une 2ᵉ voix de chorale), ou écrite à la main.
 */
export interface VoiceOptions {
  mode: "harmony" | "manual";
  /** Notes écrites (mode "manual"), même écriture que la mélodie. */
  text: string;
  instrument: InstrumentId;
  octave: number;
  volume: number;
}

/** Nombre de voix au plus, mélodie comprise. */
export const MAX_VOICES = 10;

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
  /** Durée commune d'un accord, en secondes. */
  chordDuration: number;
  /** Début de chaque accord dans la boucle, en secondes. */
  chordStarts: number[];
}

/** Durée de chaque accord, en temps : la sienne s'il en a une, sinon la durée commune. */
export function chordLengths(chords: ParsedChord[], beatsPerChord: number): number[] {
  const common = clamp(Math.round(beatsPerChord), 1, MAX_CHORD_BEATS * 2);
  return chords.map((chord) => chord.beats ?? common);
}

const barOf = (options: SongOptions) => clamp(Math.round(options.beatsPerBar ?? 4), 1, 16);

/**
 * Longueur, en temps, sur laquelle se répète un motif de jeu, de basse ou de batterie. Les motifs
 * sont écrits pour 4 temps : une mesure de 2 ou 3 temps en joue le début ; une mesure ternaire de 6,
 * 9 ou 12 temps (6/8…) les enchaîne par groupes de 3 ; les autres, par groupes de 4.
 */
function patternCycle(beatsPerBar: number): number {
  if (beatsPerBar <= 4) return beatsPerBar;
  return beatsPerBar % 3 === 0 ? 3 : 4;
}

/** Découpe `length` temps en morceaux de `cycle` temps : [début, longueur]. */
function segments(length: number, cycle: number): [number, number][] {
  const out: [number, number][] = [];
  for (let at = 0; at < length - 1e-9; at += cycle) out.push([at, Math.min(cycle, length - at)]);
  return out;
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
  const lengths = chordLengths(options.chords, options.beatsPerChord);
  const cycle = patternCycle(barOf(options));
  const plucked = profile.engine === "pluck";
  const sustained = profile.engine === "blown";
  let start = 0;

  options.chords.forEach((chord, index) => {
    const chordStart = start;
    start += lengths[index];
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

    // Le motif reprend au début de chaque cycle tant que l'accord dure.
    for (const [offset, span] of segments(lengths[index], cycle)) {
      const t0 = (chordStart + offset) * beat;
      for (const step of style.steps) {
        if (step.at >= span - 1e-9) continue;
        const at = t0 + step.at * beat;
        const length = Math.min(step.dur, span - step.at) * beat;
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
          notes.forEach((m, j) => playNote(out, sr, id, at + j * stagger, dur, fit(m + shift), gain, noise));
        }
      }
    }
  });
}

function renderBass(out: Float32Array, sr: number, options: SongOptions, track: Track, beat: number, noise: Noise): void {
  const style = BASS_STYLES.find((x) => x.id === track.style) ?? BASS_STYLES[0];
  const shift = 12 * clamp(Math.round(track.octave), -2, 2);
  const lengths = chordLengths(options.chords, options.beatsPerChord);
  const cycle = patternCycle(barOf(options));
  let start = 0;
  // Tessiture d'une basse quatre cordes : la fondamentale se place à partir du Mi grave.
  const rootOf = (chord: ParsedChord) => placeAbove(chord.bass ?? chord.root, 28);
  // La basse est jouée à part, puis passe dans son préampli avant d'être mélangée.
  const bus = new Float32Array(out.length);

  options.chords.forEach((chord, index) => {
    const chordStart = start;
    start += lengths[index];
    const root = rootOf(chord);
    const next = options.chords[(index + 1) % options.chords.length];
    // Sur un accord à basse imposée (C/E), la basse ne quitte pas cette note.
    const free = chord.bass === null;
    const third = chord.intervals.find((iv) => iv === 3 || iv === 4) ?? chord.intervals.find((iv) => iv === 2 || iv === 5) ?? 7;
    const seventh = chord.intervals.includes(11) ? 11 : 10;
    const parts = segments(lengths[index], cycle);
    parts.forEach(([offset, span], part) => {
      const t0 = (chordStart + offset) * beat;
      // La note d'approche (« A ») mène à l'accord suivant : seulement dans le dernier cycle de l'accord.
      const last = part === parts.length - 1;
      for (const [at, dur, token, gain] of style.steps) {
        if (at >= span - 1e-9) continue;
        let midi = root;
        if (token === "8") midi = root + 12;
        else if (token === "A") midi = last ? rootOf(next) - 1 : root + fifthOf(chord);
        else if (free) {
          if (token === "3") midi = root + third;
          else if (token === "5") midi = root + fifthOf(chord);
          else if (token === "6") midi = root + sixthOf(chord);
          else if (token === "7") midi = root + seventh;
        }
        addBass(bus, sr, t0 + at * beat, Math.min(dur, span - at) * beat, fit(midi + shift, 23, 72), gain, noise);
      }
    });
  });
  mixBass(out, bus, 0.6 * track.volume);
}

function renderDrums(out: Float32Array, sr: number, options: SongOptions, track: Track, beat: number, noise: Noise): void {
  const style = DRUM_STYLES.find((x) => x.id === track.style) ?? DRUM_STYLES[0];
  const totalBeats = chordLengths(options.chords, options.beatsPerChord).reduce((sum, n) => sum + n, 0);
  const bar = barOf(options);
  const cycle = patternCycle(bar);
  // Le rythme suit la mesure (et non les accords) : il recommence à chaque mesure, par cycles.
  for (let barStart = 0; barStart < totalBeats - 1e-9; barStart += bar) {
    for (const [offset, span] of segments(bar, cycle)) {
      for (const [at, sound, gain] of style.hits) {
        const when = barStart + offset + at;
        if (at >= span - 1e-9 || when >= totalBeats - 1e-9) continue;
        playDrum(out, sr, sound, when * beat, gain * track.volume, noise);
      }
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
  const lengths = chordLengths(options.chords, options.beatsPerChord);
  if (melody.mode === "auto") {
    const generated = generateMelody(options.chords, lengths, melody.seed, base);
    return { notes: generated.map((note) => ({ ...note, midi: note.midi + shift })), errors: [] };
  }
  const parsed = parseMelody(melody.text, solfaDoOf(options.chords), base);
  const totalBeats = lengths.reduce((sum, n) => sum + n, 0);
  return { notes: repeatOver(parsed, totalBeats, shift), errors: parsed.errors };
}

/** Une mélodie écrite, répétée jusqu'à couvrir `totalBeats` temps, et décalée de `shift` demi-tons. */
function repeatOver(parsed: { notes: MelodyNote[]; beats: number }, totalBeats: number, shift: number): MelodyNote[] {
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
  return notes;
}

/** Voix effectivement jouées : la mélodie (si elle existe), puis les voix suivantes. */
export function voicesOf(options: SongOptions): { instrument: InstrumentId; volume: number }[] {
  const melody = options.melody && options.melody.mode !== "none" ? [options.melody] : [];
  return [...melody, ...(options.voices ?? []).slice(0, MAX_VOICES - 1)];
}

/**
 * Notes de chaque voix, dans l'ordre de voicesOf : la mélodie, puis chaque voix suivante, en
 * harmonie sous la précédente ou écrite à la main.
 */
export function voiceNotes(options: SongOptions): { notes: MelodyNote[]; errors: string[] }[] {
  const lists: { notes: MelodyNote[]; errors: string[] }[] = [];
  const hasMelody = Boolean(options.melody && options.melody.mode !== "none" && options.chords.length > 0);
  if (options.melody && options.melody.mode !== "none") lists.push(hasMelody ? melodyNotes(options) : { notes: [], errors: [] });
  if (options.chords.length === 0) return [...lists, ...(options.voices ?? []).slice(0, MAX_VOICES - 1).map(() => ({ notes: [], errors: [] }))];

  const shift = transposeOf(options);
  const lengths = chordLengths(options.chords, options.beatsPerChord);
  const totalBeats = lengths.reduce((sum, n) => sum + n, 0);
  // Accords entendus (tonalité appliquée) et leur début, en temps : pour l'harmonie.
  const heard = heardChords(options.chords, shift);
  const starts: number[] = [];
  lengths.reduce((at, n) => (starts.push(at), at + n), 0);
  const chordAt = (beat: number) => {
    let i = 0;
    while (i + 1 < starts.length && starts[i + 1] <= beat + 1e-9) i++;
    return heard[i];
  };

  for (const voice of (options.voices ?? []).slice(0, MAX_VOICES - 1)) {
    const octave = 12 * clamp(Math.round(voice.octave), -2, 2);
    if (voice.mode === "manual") {
      const parsed = parseMelody(voice.text, solfaDoOf(options.chords), MELODY_BASE + octave);
      lists.push({ notes: repeatOver(parsed, totalBeats, shift), errors: parsed.errors });
      continue;
    }
    // Harmonie : sous chaque note de la voix précédente, la note de l'accord en cours la plus proche,
    // d'une tierce à une sixte plus bas ; à défaut, la même note une octave plus bas.
    const above = lists[lists.length - 1]?.notes ?? [];
    const notes = above.map((note) => {
      const chord = chordAt(note.at);
      const classes = new Set(chord.intervals.map((iv) => (chord.root + iv) % 12));
      let midi = note.midi - 12;
      for (let down = 3; down <= 9; down++) {
        const m = note.midi - down;
        if (classes.has(((m % 12) + 12) % 12)) {
          midi = m;
          break;
        }
      }
      return { ...note, midi: midi + octave };
    });
    lists.push({ notes, errors: [] });
  }
  return lists;
}

/** Les notes d'une voix, jouées dans `out`. */
function renderVoice(out: Float32Array, sr: number, instrument: InstrumentId, notes: MelodyNote[], volume: number, beat: number, noise: Noise): void {
  for (const note of notes) {
    playNote(out, sr, instrument, note.at * beat, Math.max(0.05, note.dur * beat - 0.02), fit(note.midi, 36, 100), 1.7 * volume, noise);
  }
}

/** Durée et découpage d'un morceau : longueur de la boucle, début de chaque accord. */
function layout(options: SongOptions) {
  const sr = options.sampleRate ?? 44100;
  const beat = 60 / clamp(options.tempo, 40, 220);
  const lengths = chordLengths(options.chords, options.beatsPerChord);
  const chordStarts: number[] = [];
  let total = 0;
  for (const length of lengths) {
    chordStarts.push(total * beat);
    total += length;
  }
  const loopLength = Math.round(total * beat * sr);
  return { sr, beat, chordStarts, loopLength, length: loopLength + Math.round(1.5 * sr), chordDuration: beat * options.beatsPerChord };
}

export interface SongStems {
  /**
   * Un signal par piste (dans l'ordre de `tracks`, toutes, même muettes), puis un par voix (la
   * mélodie si elle existe, puis les voix suivantes). Chacun est rendu au volume 1 et non normalisé :
   * le volume de chaque piste s'applique au mélange, ce qui permet de le changer sans recalcul.
   */
  stems: Float32Array[];
  sampleRate: number;
  loopLength: number;
  chordDuration: number;
  chordStarts: number[];
  /** Durée d'un temps, en secondes. */
  beatSeconds: number;
}

/** Le morceau rendu piste par piste, pour un mélange en direct (volume, muet) sans recalcul. */
export function renderStems(options: SongOptions): SongStems {
  const { sr, beat, chordStarts, loopLength, length, chordDuration } = layout(options);
  const noise = new Noise(20261121);
  const heard: SongOptions = { ...options, chords: heardChords(options.chords, transposeOf(options)) };
  const stems: Float32Array[] = [];
  for (const track of options.tracks.slice(0, MAX_TRACKS)) {
    const out = new Float32Array(length);
    const unit = { ...track, volume: 1 };
    if (track.instrument === "drums") renderDrums(out, sr, heard, unit, beat, noise);
    else if (track.instrument === "bass") renderBass(out, sr, heard, unit, beat, noise);
    else renderInstrument(out, sr, heard, unit, beat, noise);
    stems.push(out);
  }
  const lists = voiceNotes(options);
  voicesOf(options).forEach((voice, k) => {
    const out = new Float32Array(length);
    renderVoice(out, sr, voice.instrument, lists[k]?.notes ?? [], 1, beat, noise);
    stems.push(out);
  });
  return { stems, sampleRate: sr, loopLength, chordDuration, chordStarts, beatSeconds: beat };
}

/** Ce qui définit le morceau lui-même, sans ses pistes : accords, tempo, mesure, tonalité. */
export type SongFrame = Pick<SongOptions, "chords" | "tempo" | "beatsPerChord" | "beatsPerBar" | "transpose" | "sampleRate">;

/** Découpage du morceau : longueur de la boucle (en échantillons), début de chaque accord (en secondes). */
export function songLayout(frame: SongFrame): Omit<SongStems, "stems"> & { length: number } {
  const { sr, beat, chordStarts, loopLength, length, chordDuration } = layout({ ...frame, tracks: [] });
  return { sampleRate: sr, loopLength, length, chordDuration, chordStarts, beatSeconds: beat };
}

/**
 * Une seule piste d'accompagnement, rendue seule au volume 1. Son aléa (`seed`) lui est propre :
 * elle ne dépend d'aucune autre piste, ce qui permet de la calculer à part — en parallèle, ou seule
 * quand on ne change qu'elle.
 */
export function renderTrackStem(frame: SongFrame, track: Track, seed: number): Float32Array {
  const options: SongOptions = { ...frame, tracks: [] };
  const { sr, beat, length } = layout(options);
  const out = new Float32Array(length);
  const heard: SongOptions = { ...options, chords: heardChords(frame.chords, transposeOf(options)) };
  const unit = { ...track, volume: 1 };
  const noise = new Noise(seed);
  if (track.instrument === "drums") renderDrums(out, sr, heard, unit, beat, noise);
  else if (track.instrument === "bass") renderBass(out, sr, heard, unit, beat, noise);
  else renderInstrument(out, sr, heard, unit, beat, noise);
  return out;
}

/** Une seule voix (notes déjà calculées par voiceNotes), rendue seule au volume 1. */
export function renderVoiceStem(frame: SongFrame, instrument: InstrumentId, notes: MelodyNote[], seed: number): Float32Array {
  const { sr, beat, length } = layout({ ...frame, tracks: [] });
  const out = new Float32Array(length);
  renderVoice(out, sr, instrument, notes, 1, beat, new Noise(seed));
  return out;
}

/**
 * Mélange des pistes avec leur volume (0 = muette), puis mise à niveau : `scale` fixe donne
 * exactement le niveau entendu en direct ; sans lui, le mélange est normalisé.
 */
export function mixStems(stems: Float32Array[], gains: number[], scale?: number): Float32Array {
  const out = new Float32Array(stems[0]?.length ?? 0);
  stems.forEach((stem, k) => {
    const g = gains[k] ?? 1;
    if (g === 0) return;
    for (let i = 0; i < stem.length; i++) out[i] += g * stem[i];
  });
  if (scale === undefined) {
    normalize(out);
  } else {
    for (let i = 0; i < out.length; i++) out[i] *= scale;
    // Garde-fou : jamais de saturation dans le fichier.
    let peak = 0;
    for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
    if (peak > 0.98) normalize(out, 0.95);
  }
  return out;
}

/** Niveau qui amène le mélange de toutes les pistes, au volume 1, à la hauteur habituelle. */
export function stemsScale(stems: Float32Array[]): number {
  const length = stems[0]?.length ?? 0;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const stem of stems) sum += stem[i];
    peak = Math.max(peak, Math.abs(sum));
  }
  return peak <= 1e-9 ? 1 : 0.89 / peak;
}

export function renderSong(options: SongOptions): RenderedSong {
  const sr = options.sampleRate ?? 44100;
  const beat = 60 / clamp(options.tempo, 40, 220);
  const chordDuration = beat * options.beatsPerChord;
  const lengths = chordLengths(options.chords, options.beatsPerChord);
  const chordStarts: number[] = [];
  let total = 0;
  for (const length of lengths) {
    chordStarts.push(total * beat);
    total += length;
  }
  const loopLength = Math.round(total * beat * sr);
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
  // Voix suivantes (2ᵉ voix…).
  if (options.voices && options.voices.length > 0) {
    const lists = voiceNotes(options);
    const first = melody && melody.mode !== "none" ? 1 : 0;
    options.voices.slice(0, MAX_VOICES - 1).forEach((voice, k) => {
      if (voice.volume > 0) renderVoice(out, sr, voice.instrument, lists[first + k]?.notes ?? [], voice.volume, beat, noise);
    });
  }

  normalize(out);
  return { samples: out, sampleRate: sr, loopLength, chordDuration, chordStarts };
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
