/**
 * Mélodie du générateur : inventée d'après les accords, ou écrite à la main.
 * Les positions et durées sont en temps.
 */
import { estimateKey } from "./key";
import type { NoteNaming } from "./notes";
import type { ParsedChord } from "./synth";
import type { KeyMode } from "./types";
import { Noise } from "./voices";

export interface MelodyNote {
  at: number;
  dur: number;
  midi: number;
}

/** Do de référence de la mélodie (Do 5) quand l'octave est à 0. */
export const MELODY_BASE = 72;

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

const placeAbove = (pc: number, low: number) => low + ((((pc - low) % 12) + 12) % 12);

/** Tonalité la plus vraisemblable d'une suite d'accords. */
export function chordsKey(chords: ParsedChord[]): { tonic: number; mode: KeyMode } {
  const chroma = new Float32Array(12);
  chords.forEach((chord, index) => {
    // La fondamentale pèse plus que les autres notes ; le premier et le dernier accord aussi.
    const weight = index === 0 || index === chords.length - 1 ? 1.5 : 1;
    chroma[chord.root] += 0.5 * weight;
    for (const iv of chord.intervals) chroma[(chord.root + iv) % 12] += weight;
  });
  return estimateKey(chroma);
}

/** Classe de hauteur du « do » du solfa pour cette suite d'accords. */
export function solfaDoOf(chords: ParsedChord[]): number {
  const key = chordsKey(chords);
  return key.mode === "major" ? key.tonic : (key.tonic + 3) % 12;
}

// Découpages possibles de deux temps (en temps) : blanche, deux noires, noire et deux croches…
const CELLS = [[2], [1, 1], [1, 1], [1, 0.5, 0.5], [0.5, 0.5, 1], [1.5, 0.5], [0.5, 0.5, 0.5, 0.5]];

/**
 * Invente une mélodie sur les accords : notes de l'accord sur les appuis,
 * notes de la gamme par mouvement conjoint entre deux. Le même `seed` redonne
 * toujours la même mélodie ; en changer en donne une autre.
 */
export function generateMelody(chords: ParsedChord[], beatsPerChord: number | number[], seed: number, base = MELODY_BASE): MelodyNote[] {
  if (chords.length === 0) return [];
  // Durée de chaque accord, en temps : commune, ou propre à chacun.
  const lengths = chords.map((_, i) => (Array.isArray(beatsPerChord) ? (beatsPerChord[i] ?? 4) : beatsPerChord));
  const key = chordsKey(chords);
  const scale = (key.mode === "major" ? MAJOR_SCALE : MINOR_SCALE).map((iv) => (iv + key.tonic) % 12);
  const random = new Noise(seed * 7919 + 101);
  const low = base - 5;
  const high = base + 12;

  const stepInScale = (from: number, direction: number) => {
    let m = from + direction;
    while (!scale.includes(((m % 12) + 12) % 12)) m += direction;
    return m;
  };

  const notes: MelodyNote[] = [];
  let previous = base + 4;
  let lastStrong = -1;
  let chordStart = 0;
  chords.forEach((chord, ci) => {
    const length = lengths[ci];
    const classes = new Set(chord.intervals.map((iv) => (chord.root + iv) % 12));
    const tones: number[] = [];
    for (let m = low; m <= high; m++) if (classes.has(m % 12)) tones.push(m);
    const nearest = (pool: number[]) => [...pool].sort((a, b) => Math.abs(a - previous) - Math.abs(b - previous));

    // Par cellules de deux temps ; un accord de durée impaire finit par une note d'un temps.
    for (let b = 0; b < length; b += 2) {
      const remaining = length - b;
      const ending = ci === chords.length - 1 && b + 2 >= length;
      const cell = ending ? [Math.min(2, remaining)] : remaining < 2 ? [remaining] : CELLS[Math.floor(random.unit() * CELLS.length)];
      let at = chordStart + b;
      cell.forEach((dur, k) => {
        let midi: number;
        if (ending) {
          // On finit posé, sur la fondamentale du dernier accord.
          midi = nearest(tones.filter((m) => m % 12 === chord.root))[0] ?? nearest(tones)[0];
        } else if (k === 0 || (Number.isInteger(at) && random.unit() < 0.7)) {
          // Appui : une note de l'accord proche de la précédente, mais ni la même ni celle
          // de l'appui d'avant, pour que la ligne avance au lieu de tourner sur deux notes.
          const near = nearest(tones);
          const fresh = near.filter((m) => m !== previous && m !== lastStrong);
          const pool = (fresh.length > 0 ? fresh : near).slice(0, 3);
          midi = pool[Math.floor(random.unit() * pool.length)];
          lastStrong = midi;
        } else {
          let direction = random.unit() < 0.5 ? -1 : 1;
          if (previous >= high - 2) direction = -1;
          if (previous <= low + 2) direction = 1;
          midi = stepInScale(previous, direction);
        }
        notes.push({ at, dur, midi });
        previous = midi;
        at += dur;
      });
    }
    chordStart += length;
  });
  return notes;
}

// ——— Mélodie écrite à la main ———

const LATIN: Record<string, number> = { do: 0, ré: 2, re: 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11 };
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SOLFA: Record<string, number> = { d: 0, r: 2, m: 4, f: 5, s: 7, l: 9, t: 11 };

const RE_LATIN = /^(do|ré|re|mi|fa|sol|la|si)([#♯b♭]?)(\d?)(['’,]*)$/i;
const RE_LETTER = /^([A-G])([#♯b♭]?)(\d?)(['’,]*)$/;
const RE_SOLFA = /^([drmfslt])([#♯b♭]?)(['’,]*)$/;

// Syllabes du solfa à do mobile (do re mi fa so la ti), avec leurs altérations chromatiques :
// voyelle « i » pour la note haussée d'un demi-ton (di, ri, fi, si, li), « a » ou « e » pour la note
// baissée (ra, me, se, le, te / ta). « si » y est le so haussé, et non le si fixe.
const SYLLABLES: Record<string, number> = { do: 0, di: 1, ra: 1, re: 2, ri: 3, me: 3, mi: 4, fa: 5, fi: 6, se: 6, so: 7, sol: 7, si: 8, le: 8, la: 9, li: 10, te: 10, ta: 10, ti: 11 };
/** Syllabes qui n'existent qu'en solfa à do mobile : leur présence fait lire tout le texte ainsi. */
const SOLFA_ONLY = new Set(["so", "ti", "di", "ri", "fi", "li", "ra", "me", "se", "le", "te", "ta"]);
const RE_SYLLABLE = /^([a-zé]+?)(['’,]*)$/i;
const syllableOf = (part: string) => (RE_SYLLABLE.exec(part)?.[1] ?? "").toLowerCase().replace("é", "e");

/** Le texte est-il écrit en syllabes de solfa à do mobile (« so la ti do ») ? */
function writtenInSyllables(text: string): boolean {
  return text.split(/[\s.]+/).some((part) => SOLFA_ONLY.has(syllableOf(part)));
}

const accidental = (mark: string) => (mark === "#" || mark === "♯" ? 1 : mark ? -1 : 0);
const octaveMarks = (marks: string) => [...marks].reduce((sum, c) => sum + (c === "," ? -12 : 12), 0);

/**
 * Hauteur d'une note écrite : nom fixe (« sol », « Sib », « G », « F#4 ») ou
 * solfa à do mobile (« d r m f s l t »). « ' » monte d'une octave, « , » descend.
 */
function pitchOf(token: string, doPc: number, base: number, syllables = false): number | null {
  if (syllables) {
    const m = RE_SYLLABLE.exec(token);
    const value = m ? SYLLABLES[syllableOf(token)] : undefined;
    if (m && value !== undefined) return placeAbove(doPc, base - 5) + value + octaveMarks(m[2]);
  }
  let m = RE_LATIN.exec(token);
  if (m) {
    const pc = LATIN[m[1].toLowerCase()] + accidental(m[2]);
    return (m[3] ? 12 * (Number(m[3]) + 1) : base) + pc + octaveMarks(m[4]);
  }
  m = RE_LETTER.exec(token);
  if (m) {
    const pc = LETTER[m[1]] + accidental(m[2]);
    return (m[3] ? 12 * (Number(m[3]) + 1) : base) + pc + octaveMarks(m[4]);
  }
  m = RE_SOLFA.exec(token);
  if (m) return placeAbove(doPc, base - 5) + SOLFA[m[1]] + accidental(m[2]) + octaveMarks(m[3]);
  return null;
}

export const MAX_MELODY_BEATS = 512;

/**
 * Lit une mélodie écrite : un mot par temps, séparés par des espaces.
 * « - » prolonge la note précédente, « _ » est un silence, et un point coupe
 * le temps en parts égales (« do.ré » : deux croches).
 */
export function parseMelody(text: string, doPc: number, base = MELODY_BASE): { notes: MelodyNote[]; beats: number; errors: string[] } {
  const notes: MelodyNote[] = [];
  const errors: string[] = [];
  const syllables = writtenInSyllables(text);
  let at = 0;
  for (const token of text.trim().split(/\s+/)) {
    if (!token || token === "|") continue;
    if (at >= MAX_MELODY_BEATS) break;
    const parts = token.split(".");
    const length = 1 / parts.length;
    for (const part of parts) {
      if (part === "-" || part === "–") {
        const last = notes[notes.length - 1];
        if (last && Math.abs(last.at + last.dur - at) < 1e-6) last.dur += length;
      } else if (part !== "" && part !== "_" && part !== "0" && part !== "x") {
        const midi = pitchOf(part, doPc, base, syllables);
        if (midi === null || midi < 24 || midi > 108) errors.push(part);
        else notes.push({ at, dur: length, midi });
      }
      at += length;
    }
  }
  return { notes, beats: at, errors };
}

const LATIN_TEXT = ["do", "do#", "ré", "mib", "mi", "fa", "fa#", "sol", "lab", "la", "sib", "si"];
const LETTER_TEXT = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/**
 * Écrit une mélodie dans la notation que `parseMelody` sait relire
 * (grille à la croche), pour l'afficher ou la retoucher à la main.
 */
export function melodyToText(notes: MelodyNote[], totalBeats: number, naming: NoteNaming, base = MELODY_BASE, beatsPerBar = 4): string {
  const slots = new Array<string>(Math.round(totalBeats * 2)).fill("_");
  for (const note of notes) {
    const start = Math.round(note.at * 2);
    const length = Math.max(1, Math.round(note.dur * 2));
    if (start >= slots.length) continue;
    const octave = Math.floor((note.midi - base) / 12);
    const pc = ((note.midi % 12) + 12) % 12;
    const name = (naming === "latin" ? LATIN_TEXT : LETTER_TEXT)[pc];
    slots[start] = name + (octave > 0 ? "'".repeat(octave) : ",".repeat(-octave));
    for (let i = start + 1; i < Math.min(slots.length, start + length); i++) slots[i] = "-";
  }
  const beats: string[] = [];
  for (let b = 0; b * 2 < slots.length; b++) {
    const first = slots[b * 2];
    const second = slots[b * 2 + 1] ?? "_";
    const whole = first === "_" ? second === "_" : second === "-";
    beats.push(whole ? first : `${first}.${second}`);
  }
  // Une barre « | » à chaque début de mesure.
  const bar = Math.max(1, Math.round(beatsPerBar));
  return beats.map((beat, i) => (i > 0 && i % bar === 0 ? `| ${beat}` : beat)).join(" ");
}
