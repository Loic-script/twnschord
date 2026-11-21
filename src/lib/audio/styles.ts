/**
 * Les façons de jouer du générateur : jeux d'accompagnement, rythmes de
 * batterie et lignes de basse. Chaque motif décrit une mesure de 4 temps ;
 * les positions et durées sont en temps (0,5 = une croche, 1/3 = un triolet).
 */
import type { DrumSound } from "./voices";

// ——— Jeux d'accompagnement ———

/**
 * Ce qu'un pas joue : "C" l'accord, "L" la basse de l'accord (main gauche),
 * "L5" sa quinte, "L6" sa sixte, "L8" son octave, ou un nombre : la n-ième
 * note de l'arpège de l'accord.
 */
export type What = "C" | "L" | "L5" | "L6" | "L8" | number;

export interface Step {
  at: number;
  dur: number;
  what: What[];
  gain: number;
  /** Sens du grattage à la guitare : "d" vers le bas, "u" vers le haut. */
  stroke?: "d" | "u";
}

const s = (at: number, dur: number, what: What | What[], gain = 1, stroke?: "d" | "u"): Step => ({
  at,
  dur,
  what: Array.isArray(what) ? what : [what],
  gain,
  stroke,
});

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export interface PlayStyle {
  id: string;
  name: string;
  steps: Step[];
}

export const PLAY_STYLES: PlayStyle[] = [
  {
    id: "block",
    name: "Plaqué",
    steps: [s(0, 2, "L", 0.9), s(2, 2, "L", 0.8), s(0, 0.95, "C", 1), s(1, 0.95, "C", 0.7), s(2, 0.95, "C", 0.85), s(3, 0.95, "C", 0.7)],
  },
  {
    id: "arpeggio",
    name: "Arpégé",
    steps: [s(0, 4, "L", 0.9), ...range(8).map((k) => s(k / 2, 1.5, k, k % 2 ? 0.8 : 1))],
  },
  {
    id: "strum",
    name: "Gratté (feu de camp)",
    steps: [
      s(0, 1, "C", 1.1, "d"),
      s(1, 0.5, "C", 1, "d"),
      s(1.5, 1, "C", 0.7, "u"),
      s(2.5, 0.5, "C", 0.7, "u"),
      s(3, 0.5, "C", 1, "d"),
      s(3.5, 0.5, "C", 0.7, "u"),
    ],
  },
  {
    id: "pop",
    name: "Pop",
    steps: [
      s(0, 1.5, "L", 0.9),
      s(1.5, 0.5, "L", 0.6),
      s(2, 1.5, "L", 0.85),
      s(3.5, 0.5, "L", 0.6),
      s(0, 1.4, "C", 1),
      s(1.5, 0.9, "C", 0.75),
      s(2.5, 0.5, "C", 0.6),
      s(3, 0.9, "C", 0.85),
    ],
  },
  {
    id: "ballad",
    name: "Ballade",
    steps: [
      s(0, 4, "L", 0.9),
      s(0.5, 1.5, "L5", 0.6),
      s(1, 1.5, "L8", 0.65),
      s(1.5, 0.5, 0, 0.5),
      s(2, 2, "C", 0.8),
      s(3, 1, 1, 0.55),
      s(3.5, 0.5, 2, 0.55),
    ],
  },
  {
    id: "gospel",
    name: "Gospel",
    // Balancement ternaire : l'accord sur le temps et sur le dernier triolet, appuis sur 2 et 4.
    steps: range(4).flatMap((b) => [
      s(b, 0.9, b % 2 ? "L8" : "L", 0.85),
      s(b, 0.6, "C", b % 2 ? 1 : 0.8),
      s(b + 2 / 3, 0.3, "C", 0.55),
    ]),
  },
  {
    id: "classical",
    name: "Classique",
    // Basse d'Alberti : grave, aigu, médium, aigu, en doubles croches.
    steps: [s(0, 2, "L", 0.8), s(2, 2, "L", 0.7), ...range(16).map((k) => s(k / 4, 0.3, [0, 2, 1, 2][k % 4], k % 4 === 0 ? 0.9 : 0.65))],
  },
  {
    id: "hymn",
    name: "Cantique",
    steps: [s(0, 2, ["L", "C"], 0.9), s(2, 2, ["L", "C"], 0.8)],
  },
  {
    id: "march",
    name: "Marche",
    steps: [s(0, 0.9, "L", 1), s(1, 0.45, "C", 0.8), s(2, 0.9, "L5", 0.9), s(3, 0.45, "C", 0.8)],
  },
  {
    id: "reggae",
    name: "Reggae",
    steps: [s(0, 1, "L", 0.7), s(0.5, 0.25, "C", 0.9), s(1.5, 0.25, "C", 1), s(2.5, 0.25, "C", 0.9), s(3.5, 0.25, "C", 1)],
  },
  {
    id: "bossa",
    name: "Bossa nova",
    steps: [
      s(0, 1.4, "L", 0.8),
      s(1.5, 0.5, "L5", 0.6),
      s(2, 1.4, "L5", 0.75),
      s(3.5, 0.5, "L", 0.6),
      s(0, 0.9, "C", 0.9),
      s(1.5, 0.7, "C", 0.8),
      s(3, 0.7, "C", 0.85),
    ],
  },
  {
    id: "jazz",
    name: "Jazz",
    steps: [s(0, 1, "L", 0.6), s(0, 1, "C", 0.9), s(5 / 3, 1, "C", 0.8), s(11 / 3, 0.3, "C", 0.55)],
  },
  {
    id: "rock",
    name: "Rock",
    steps: [s(0, 2, "L", 1), s(2, 2, "L", 0.9), ...range(8).map((k) => s(k / 2, 0.45, "C", k % 2 ? 0.65 : 1))],
  },
  {
    id: "funk",
    name: "Funk",
    steps: [
      s(0, 0.4, "L", 1),
      s(2.75, 0.2, "L", 0.7),
      s(3.5, 0.3, "L8", 0.7),
      s(0, 0.18, "C", 1),
      s(0.75, 0.18, "C", 0.7),
      s(1.5, 0.18, "C", 0.8),
      s(2.5, 0.18, "C", 0.9),
      s(3, 0.18, "C", 0.7),
      s(3.75, 0.18, "C", 0.6),
    ],
  },
  {
    id: "blues",
    name: "Blues",
    // Boogie : quinte puis sixte à la main gauche, en rythme ternaire.
    steps: [
      ...range(4).flatMap((b) => [s(b, 0.6, ["L", b % 2 ? "L6" : "L5"], 0.9), s(b + 2 / 3, 0.3, ["L", b % 2 ? "L6" : "L5"], 0.6)]),
      s(1, 0.5, "C", 0.6),
      s(3, 0.5, "C", 0.6),
    ],
  },
  {
    id: "sustain",
    name: "Tenu (nappe)",
    steps: [s(0, 4, ["L", "C"], 0.9)],
  },
];

// ——— Batterie ———

export type Hit = [at: number, sound: DrumSound, gain: number];

export interface DrumStyle {
  id: string;
  name: string;
  hits: Hit[];
}

const hats = (count: number, loud: number, soft: number): Hit[] =>
  range(count).map((k) => [(k * 4) / count, "h", (k * 4) % count === 0 ? loud : soft] as Hit);

export const DRUM_STYLES: DrumStyle[] = [
  {
    id: "pop",
    name: "Pop",
    hits: [[0, "k", 0.6], [1.5, "k", 0.32], [2, "k", 0.52], [1, "s", 0.3], [3, "s", 0.3], ...hats(8, 0.16, 0.09)],
  },
  {
    id: "rock",
    name: "Rock",
    hits: [[0, "k", 0.65], [2, "k", 0.6], [2.5, "k", 0.5], [1, "s", 0.36], [3, "s", 0.36], ...hats(8, 0.2, 0.14)],
  },
  {
    id: "ballad",
    name: "Ballade",
    hits: [[0, "k", 0.55], [2.5, "k", 0.28], [2, "x", 0.3], ...hats(4, 0.11, 0.11)],
  },
  {
    id: "gospel",
    name: "Gospel (12/8)",
    hits: [[0, "k", 0.6], [2, "k", 0.5], [2 + 2 / 3, "k", 0.3], [1, "s", 0.32], [3, "s", 0.32], ...hats(12, 0.15, 0.08)],
  },
  {
    id: "reggae",
    name: "Reggae",
    // « One drop » : rien sur le premier temps, tout tombe sur le troisième.
    hits: [[2, "k", 0.6], [2, "x", 0.32], ...hats(8, 0.09, 0.16)],
  },
  {
    id: "bossa",
    name: "Bossa nova",
    hits: [[0, "k", 0.45], [1.5, "k", 0.3], [2, "k", 0.45], [3.5, "k", 0.3], [0, "x", 0.26], [1.5, "x", 0.26], [3, "x", 0.26], ...hats(8, 0.1, 0.07)],
  },
  {
    id: "jazz",
    name: "Jazz swing",
    hits: [
      [0, "r", 0.16],
      [1, "r", 0.2],
      [1 + 2 / 3, "r", 0.12],
      [2, "r", 0.16],
      [3, "r", 0.2],
      [3 + 2 / 3, "r", 0.12],
      [1, "h", 0.14],
      [3, "h", 0.14],
      [0, "k", 0.25],
      [2 + 2 / 3, "s", 0.1],
    ],
  },
  {
    id: "funk",
    name: "Funk",
    hits: [[0, "k", 0.62], [0.75, "k", 0.4], [2.5, "k", 0.5], [1, "s", 0.34], [3, "s", 0.34], [1.75, "s", 0.1], [2.25, "s", 0.1], ...hats(16, 0.14, 0.07)],
  },
  {
    id: "disco",
    name: "Disco",
    hits: [
      ...range(4).map((b) => [b, "k", 0.6] as Hit),
      [1, "s", 0.3],
      [3, "s", 0.3],
      ...range(4).map((b) => [b, "h", 0.1] as Hit),
      ...range(4).map((b) => [b + 0.5, "o", 0.13] as Hit),
    ],
  },
  {
    id: "shuffle",
    name: "Shuffle (blues)",
    hits: [
      [0, "k", 0.6],
      [2, "k", 0.55],
      [1, "s", 0.32],
      [3, "s", 0.32],
      ...range(4).flatMap((b) => [[b, "h", 0.16] as Hit, [b + 2 / 3, "h", 0.09] as Hit]),
    ],
  },
];

// ——— Basse ———

/** R fondamentale, 3 tierce, 5 quinte, 6 sixte, 7 septième, 8 octave, A note d'approche vers l'accord suivant. */
export type BassToken = "R" | "3" | "5" | "6" | "7" | "8" | "A";
export type BassStep = [at: number, dur: number, token: BassToken, gain: number];

export interface BassStyle {
  id: string;
  name: string;
  steps: BassStep[];
}

export const BASS_STYLES: BassStyle[] = [
  { id: "pop", name: "Pop", steps: [[0, 1.4, "R", 1], [1.5, 0.5, "R", 0.8], [2, 1.4, "5", 0.9], [3.5, 0.5, "R", 0.8]] },
  { id: "root", name: "Notes tenues", steps: [[0, 2, "R", 1], [2, 2, "R", 0.9]] },
  { id: "rock", name: "Rock (croches)", steps: range(8).map((k) => [k / 2, 0.45, "R", k % 2 ? 0.8 : 1] as BassStep) },
  { id: "alternate", name: "Alternée (marche)", steps: [[0, 1, "R", 1], [2, 1, "5", 0.95]] },
  { id: "walking", name: "Walking (jazz)", steps: [[0, 0.95, "R", 1], [1, 0.95, "3", 0.9], [2, 0.95, "5", 0.95], [3, 0.95, "A", 0.9]] },
  { id: "reggae", name: "Reggae", steps: [[0, 0.5, "R", 1], [1.5, 0.5, "R", 0.9], [2, 0.5, "5", 0.9], [2.5, 0.5, "R", 0.9]] },
  { id: "bossa", name: "Bossa nova", steps: [[0, 1.4, "R", 1], [1.5, 0.5, "5", 0.8], [2, 1.4, "5", 0.9], [3.5, 0.5, "R", 0.8]] },
  {
    id: "funk",
    name: "Funk",
    steps: [[0, 0.3, "R", 1], [0.75, 0.2, "8", 0.8], [1.5, 0.3, "R", 0.9], [2.5, 0.25, "R", 0.9], [2.75, 0.2, "7", 0.75], [3.5, 0.25, "8", 0.8]],
  },
  { id: "disco", name: "Disco (octaves)", steps: range(8).map((k) => [k / 2, 0.4, k % 2 ? "8" : "R", k % 2 ? 0.8 : 1] as BassStep) },
  {
    id: "boogie",
    name: "Boogie (blues)",
    steps: range(4).flatMap((b) => {
      const token = (["R", "3", "5", "6"] as BassToken[])[b];
      return [[b, 0.6, token, 1] as BassStep, [b + 2 / 3, 0.3, token, 0.7] as BassStep];
    }),
  },
];
