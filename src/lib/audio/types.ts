export type KeyMode = "major" | "minor";

/**
 * Résultat complet de l'analyse d'un morceau.
 * Volontairement compact : c'est ce qui est enregistré en base (jsonb).
 */
export interface Analysis {
  version: 1;
  /** Durée en secondes. */
  duration: number;
  /** Tempo moyen en battements par minute. */
  tempo: number;
  /** Instant de chaque temps, en secondes. */
  beats: number[];
  /** Nombre de temps par mesure (3 ou 4). */
  beatsPerBar: number;
  /** Index (dans `beats`) du premier temps fort. */
  downbeat: number;
  /** Tonalité estimée : tonique (0 = Do … 11 = Si) et mode. */
  key: { tonic: number; mode: KeyMode };
  /** Écart d'accordage du morceau par rapport à La = 440 Hz, en cents. */
  tuningCents: number;
  /** Accord de chaque temps ("N" = pas d'accord). Même longueur que `beats`. */
  beatChords: string[];
  /** Subdivisions de la mélodie par temps. */
  slotsPerBeat: number;
  /** Note MIDI de la mélodie par subdivision (null = silence). */
  melody: (number | null)[];
  /** 1 si la subdivision commence une nouvelle note, 0 si elle prolonge la précédente. */
  attacks: number[];
}

export type ProgressFn = (fraction: number, stage: string) => void;
