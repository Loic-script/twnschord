import { LETTER_NAMES } from "./notes";
import type { Analysis } from "./types";

const ROOT_RE = /^([A-G][♯♭]?)(.*)$/;

/** Nom d'accord monté de `semitones` demi-tons : "Am7" + 2 → "Bm7". "N" (pas d'accord) reste tel quel. */
export function transposeLabel(label: string, semitones: number): string {
  const match = ROOT_RE.exec(label);
  if (!match) return label;
  const pc = LETTER_NAMES.indexOf(match[1]);
  if (pc < 0) return label;
  return LETTER_NAMES[(((pc + semitones) % 12) + 12) % 12] + match[2];
}

/**
 * La même analyse, lue dans une autre tonalité : accords renommés, tonalité et
 * mélodie décalées. Les temps et le rythme ne changent pas.
 */
export function transposeAnalysis(analysis: Analysis, semitones: number): Analysis {
  if (semitones === 0) return analysis;
  return {
    ...analysis,
    key: { tonic: (((analysis.key.tonic + semitones) % 12) + 12) % 12, mode: analysis.key.mode },
    beatChords: analysis.beatChords.map((label) => transposeLabel(label, semitones)),
    melody: analysis.melody.map((midi) => (midi === null ? null : midi + semitones)),
  };
}
