import { LETTER_NAMES } from "./notes";

export interface ChordQuality {
  id: string;
  suffix: string;
  intervals: number[];
  /** Pénalité a priori : départage en faveur des accords les plus courants. */
  prior: number;
}

export const QUALITIES: Record<string, ChordQuality> = {
  maj: { id: "maj", suffix: "", intervals: [0, 4, 7], prior: 0 },
  min: { id: "min", suffix: "m", intervals: [0, 3, 7], prior: 0 },
  dom7: { id: "dom7", suffix: "7", intervals: [0, 4, 7, 10], prior: 0.02 },
  maj7: { id: "maj7", suffix: "maj7", intervals: [0, 4, 7, 11], prior: 0.02 },
  min7: { id: "min7", suffix: "m7", intervals: [0, 3, 7, 10], prior: 0.02 },
  dim: { id: "dim", suffix: "dim", intervals: [0, 3, 6], prior: 0.03 },
  aug: { id: "aug", suffix: "aug", intervals: [0, 4, 8], prior: 0.05 },
  sus4: { id: "sus4", suffix: "sus4", intervals: [0, 5, 7], prior: 0.04 },
  sus2: { id: "sus2", suffix: "sus2", intervals: [0, 2, 7], prior: 0.05 },
  five: { id: "five", suffix: "5", intervals: [0, 7], prior: 0.03 },
  note: { id: "note", suffix: "", intervals: [0], prior: 0.02 },
};

/** Vocabulaire du mode direct : large, avec note seule et quinte à vide. */
export const LIVE_QUALITIES = ["maj", "min", "dom7", "maj7", "min7", "dim", "aug", "sus4", "sus2", "five", "note"];
/** Vocabulaire de l'analyse de fichier : plus resserré, donc plus stable. */
export const FILE_QUALITIES = ["maj", "min", "dom7", "maj7", "min7", "dim", "sus4"];

export interface ChordDef {
  label: string;
  root: number;
  quality: string;
  /** Classes de hauteur qui composent l'accord, fondamentale en premier. */
  tones: number[];
  /** Gabarit de chroma normalisé (norme 1). */
  template: Float32Array;
  prior: number;
}

// Part d'énergie qu'une note envoie, par ses harmoniques, vers d'autres classes
// de hauteur : l'harmonique 3 tombe une quinte au-dessus, l'harmonique 5 une
// tierce majeure au-dessus. Sans cela, un simple Do ressemblerait à Do-Mi-Sol.
const HARMONIC_FIFTH = 0.25;
const HARMONIC_THIRD = 0.1;

export function buildChords(qualityIds: string[]): ChordDef[] {
  const defs: ChordDef[] = [];
  for (const id of qualityIds) {
    const q = QUALITIES[id];
    for (let root = 0; root < 12; root++) {
      const template = new Float32Array(12);
      const tones = q.intervals.map((iv) => (root + iv) % 12);
      for (const t of tones) {
        template[t] += 1;
        template[(t + 7) % 12] += HARMONIC_FIFTH;
        template[(t + 4) % 12] += HARMONIC_THIRD;
      }
      let norm = 0;
      for (let i = 0; i < 12; i++) norm += template[i] * template[i];
      norm = Math.sqrt(norm);
      for (let i = 0; i < 12; i++) template[i] /= norm;
      defs.push({ label: LETTER_NAMES[root] + q.suffix, root, quality: id, tones, template, prior: q.prior });
    }
  }
  return defs;
}

/**
 * Score de chaque accord pour un chroma donné :
 * similarité cosinus avec le gabarit, bonus si la basse joue la fondamentale,
 * moins la pénalité a priori. Écrit dans `out` (une valeur par accord).
 */
export function scoreChords(
  chroma: ArrayLike<number>,
  bass: ArrayLike<number>,
  chords: ChordDef[],
  out: Float32Array,
  bassWeight = 0.08,
  chromaOffset = 0,
  bassOffset = 0,
): void {
  let norm = 0;
  let bassMax = 0;
  for (let i = 0; i < 12; i++) {
    const v = chroma[chromaOffset + i];
    norm += v * v;
    if (bass[bassOffset + i] > bassMax) bassMax = bass[bassOffset + i];
  }
  norm = Math.sqrt(norm);
  for (let c = 0; c < chords.length; c++) {
    const def = chords[c];
    let dot = 0;
    if (norm > 0) {
      const t = def.template;
      for (let i = 0; i < 12; i++) dot += chroma[chromaOffset + i] * t[i];
      dot /= norm;
    }
    const bassBonus = bassMax > 0 ? (bassWeight * bass[bassOffset + def.root]) / bassMax : 0;
    out[c] = dot + bassBonus - def.prior;
  }
}

export function bestChord(scores: Float32Array): number {
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  return best;
}

const ROOT_RE = /^([A-G][♯♭]?)(.*)$/;

/** Classes de hauteur d'un accord à partir de son nom ("Am7" → [9, 0, 4, 7]). */
export function chordTones(label: string): number[] {
  const m = ROOT_RE.exec(label);
  if (!m) return [];
  const root = LETTER_NAMES.indexOf(m[1]);
  if (root < 0) return [];
  const q = Object.values(QUALITIES).find((x) => x.suffix === m[2] && x.id !== "note");
  return (q ? q.intervals : [0]).map((iv) => (root + iv) % 12);
}
