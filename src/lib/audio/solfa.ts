import { pcName } from "./notes";
import type { Analysis } from "./types";

/**
 * Notation de la mélodie :
 * - "solfa"  : solfa tonique à do mobile (d r m f s l t), relatif à la tonalité ;
 * - "latin"  : noms fixes do ré mi ;
 * - "letter" : noms fixes C D E.
 */
export type Notation = "solfa" | "latin" | "letter";

// Degrés chromatiques du solfa tonique à partir de do.
const SOLFA = ["d", "de", "r", "re", "m", "f", "fe", "s", "se", "l", "ta", "t"];

export interface SheetToken {
  kind: "note" | "hold" | "rest";
  text: string;
  /** Marque d'octave du solfa : +1 = octave supérieure (d'), −1 = inférieure (d,). */
  octave: number;
}

export interface SheetBeat {
  /** Index du temps dans `analysis.beats`. */
  beat: number;
  time: number;
  /** Accord à afficher sur ce temps, ou null s'il prolonge le précédent. */
  chord: string | null;
  /** Une entrée si le temps est plein, plusieurs s'il est divisé. */
  tokens: SheetToken[];
}

export interface SheetBar {
  index: number;
  /** Mesure incomplète de départ (anacrouse). */
  pickup: boolean;
  beats: SheetBeat[];
}

export interface Sheet {
  bars: SheetBar[];
  /** Classe de hauteur du « do » du solfa (0 = Do … 11 = Si). */
  doPc: number;
}

export interface Meter {
  beatsPerBar: number;
  downbeat: number;
}

/** Do du solfa : la tonique en majeur, la tierce mineure au-dessus en mineur (la = tonique). */
export function solfaDo(key: Analysis["key"]): number {
  return key.mode === "major" ? key.tonic : (key.tonic + 3) % 12;
}

/** Choisit le do de référence (sans marque d'octave) qui contient le plus de notes. */
function referenceDo(melody: (number | null)[], doPc: number): number {
  const notes = melody.filter((m): m is number => m !== null);
  if (notes.length === 0) return 60 + doPc;
  let best = 60 + doPc;
  let bestCount = -1;
  for (let base = 24 + doPc; base < 108; base += 12) {
    let count = 0;
    for (const m of notes) if (m >= base && m < base + 12) count++;
    if (count > bestCount) {
      bestCount = count;
      best = base;
    }
  }
  return best;
}

export function buildSheet(analysis: Analysis, notation: Notation, meter?: Meter): Sheet {
  const beatsPerBar = meter?.beatsPerBar ?? analysis.beatsPerBar;
  const downbeat = (((meter?.downbeat ?? analysis.downbeat) % beatsPerBar) + beatsPerBar) % beatsPerBar;
  const spb = analysis.slotsPerBeat;
  const doPc = solfaDo(analysis.key);
  const base = referenceDo(analysis.melody, doPc);

  const token = (slot: number): SheetToken => {
    const midi = analysis.melody[slot] ?? null;
    if (midi === null) return { kind: "rest", text: "", octave: 0 };
    if (!analysis.attacks[slot]) return { kind: "hold", text: "–", octave: 0 };
    if (notation === "solfa") {
      const rel = midi - base;
      return { kind: "note", text: SOLFA[((rel % 12) + 12) % 12], octave: Math.floor(rel / 12) };
    }
    return { kind: "note", text: pcName(midi, notation), octave: 0 };
  };

  const bars: SheetBar[] = [];
  let current: SheetBar | null = null;
  let lastChord = "N";

  for (let b = 0; b < analysis.beats.length; b++) {
    const pos = (((b - downbeat) % beatsPerBar) + beatsPerBar) % beatsPerBar;
    if (current === null || pos === 0) {
      current = { index: bars.length, pickup: b < downbeat, beats: [] };
      bars.push(current);
    }

    const label = analysis.beatChords[b] ?? "N";
    let chord: string | null = null;
    if (label !== "N" && (label !== lastChord || current.beats.length === 0)) chord = label;
    lastChord = label;

    let tokens: SheetToken[] = [];
    for (let s = 0; s < spb; s++) tokens.push(token(b * spb + s));
    // Temps non divisé : les subdivisions suivantes ne font que prolonger la première.
    const first = tokens[0];
    const undivided = tokens.every((t, i) => i === 0 || (first.kind === "rest" ? t.kind === "rest" : t.kind === "hold"));
    if (undivided) tokens = [first];

    current.beats.push({ beat: b, time: analysis.beats[b], chord, tokens });
  }

  // Les mesures entièrement vides en fin de morceau (silence final) ne sont pas affichées.
  const isEmpty = (bar: SheetBar) =>
    bar.beats.every((beat) => (analysis.beatChords[beat.beat] ?? "N") === "N" && beat.tokens.every((t) => t.kind === "rest"));
  while (bars.length > 1 && isEmpty(bars[bars.length - 1])) bars.pop();
  return { bars, doPc };
}
