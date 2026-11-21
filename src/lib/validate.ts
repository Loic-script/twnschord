import type { Analysis } from "./audio/types";

const MAX_BEATS = 20000;

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  isNumber(v) && Number.isInteger(v) && v >= min && v <= max;

/**
 * Vérifie qu'une valeur reçue du réseau est bien une analyse, et la recopie
 * champ par champ : rien d'inattendu ne part en base.
 */
export function parseAnalysis(value: unknown): Analysis | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1) return null;
  if (!isNumber(v.duration) || v.duration <= 0 || v.duration > 3600) return null;
  if (!isNumber(v.tempo) || v.tempo <= 0 || v.tempo > 400) return null;
  if (!isInt(v.beatsPerBar, 2, 12)) return null;
  if (!isInt(v.downbeat, 0, 11)) return null;
  if (!isInt(v.slotsPerBeat, 1, 4)) return null;
  if (!isNumber(v.tuningCents) || Math.abs(v.tuningCents) > 50) return null;

  const key = v.key as Record<string, unknown> | null;
  if (typeof key !== "object" || key === null) return null;
  if (!isInt(key.tonic, 0, 11) || (key.mode !== "major" && key.mode !== "minor")) return null;

  const { beats, beatChords, melody, attacks } = v;
  if (!Array.isArray(beats) || beats.length === 0 || beats.length > MAX_BEATS) return null;
  if (!beats.every((t) => isNumber(t) && t >= 0)) return null;
  if (!Array.isArray(beatChords) || beatChords.length !== beats.length) return null;
  if (!beatChords.every((c) => typeof c === "string" && c.length > 0 && c.length <= 8)) return null;

  const slots = beats.length * v.slotsPerBeat;
  if (!Array.isArray(melody) || melody.length !== slots) return null;
  if (!melody.every((m) => m === null || isInt(m, 0, 127))) return null;
  if (!Array.isArray(attacks) || attacks.length !== slots) return null;
  if (!attacks.every((a) => a === 0 || a === 1)) return null;

  return {
    version: 1,
    duration: v.duration,
    tempo: v.tempo,
    beats: beats as number[],
    beatsPerBar: v.beatsPerBar,
    downbeat: v.downbeat,
    key: { tonic: key.tonic, mode: key.mode },
    tuningCents: v.tuningCents,
    beatChords: beatChords as string[],
    slotsPerBeat: v.slotsPerBeat,
    melody: melody as (number | null)[],
    attacks: attacks as number[],
  };
}
