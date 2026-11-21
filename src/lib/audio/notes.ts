/** Noms des 12 classes de hauteur, notation anglo-saxonne (celle des accords). */
export const LETTER_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

/** Noms des 12 classes de hauteur, notation latine (do ré mi). */
export const LATIN_NAMES = ["Do", "Do♯", "Ré", "Mi♭", "Mi", "Fa", "Fa♯", "Sol", "La♭", "La", "Si♭", "Si"];

export type NoteNaming = "latin" | "letter";

export function freqToMidi(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}

export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

export function pcName(pc: number, naming: NoteNaming): string {
  const i = ((pc % 12) + 12) % 12;
  return naming === "latin" ? LATIN_NAMES[i] : LETTER_NAMES[i];
}

/** Nom scientifique avec octave : 69 → "A4", 60 → "C4". */
export function midiLabel(midi: number): string {
  const m = Math.round(midi);
  return `${LETTER_NAMES[pitchClass(m)]}${Math.floor(m / 12) - 1}`;
}

export function keyLabel(tonic: number, mode: "major" | "minor", naming: NoteNaming): string {
  if (naming === "latin") return `${pcName(tonic, "latin")} ${mode === "major" ? "majeur" : "mineur"}`;
  return `${pcName(tonic, "letter")}${mode === "major" ? "" : "m"}`;
}
