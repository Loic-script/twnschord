/**
 * Règles du jeu de chant : des portes marquées d'une note avancent une à une ;
 * tenir la bonne note ouvre la porte, sinon elle arrive jusqu'au joueur et lui
 * coûte une vie. Module sans interface ni micro, pour pouvoir être testé seul.
 */

export type Level = "easy" | "scale" | "all";

/** Niveaux : les notes (0 = Do … 11 = Si) parmi lesquelles le jeu tire au hasard. */
export const LEVELS: { id: Level; name: string; notes: number[] }[] = [
  { id: "easy", name: "Do Mi Sol", notes: [0, 4, 7] },
  { id: "scale", name: "Gamme de Do", notes: [0, 2, 4, 5, 7, 9, 11] },
  { id: "all", name: "Les 12 notes", notes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
];

/** Durée pendant laquelle il faut tenir la note pour ouvrir la porte. */
export const HOLD_SECONDS = 0.5;
/** Écart toléré autour de la note juste, en demi-tons. */
export const TOLERANCE = 0.4;
export const START_DOOR_SECONDS = 8;
export const MIN_DOOR_SECONDS = 3.5;
export const LIVES = 3;

/**
 * Écart, en demi-tons, entre la note chantée et la note demandée, quelle que
 * soit l'octave : de −6 à +6, positif quand on chante trop haut.
 */
export function pitchOffset(sungMidi: number, targetPc: number): number {
  const up = (((sungMidi - targetPc) % 12) + 12) % 12;
  return up >= 6 ? up - 12 : up;
}

/** Tire une note au hasard dans `pool`, différente de `avoid` si possible. */
export function pickNote(pool: number[], avoid: number, random: () => number): number {
  const choices = pool.filter((note) => note !== avoid);
  const list = choices.length > 0 ? choices : pool;
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

export interface GameState {
  phase: "playing" | "over";
  /** Numéro de la porte en cours : change à chaque nouvelle porte. */
  door: number;
  /** Note de la porte en cours, et de la suivante. */
  target: number;
  next: number;
  /** Avancée de la porte : 0 au loin, 1 quand elle atteint le joueur. */
  progress: number;
  /** Tenue de la bonne note : 0 à 1, la porte s'ouvre à 1. */
  hold: number;
  score: number;
  streak: number;
  bestStreak: number;
  lives: number;
  /** Temps laissé pour la porte en cours, en secondes. */
  doorSeconds: number;
  /** L'aide « écouter la note » a servi sur cette porte : elle ne rapporte pas de point. */
  helped: boolean;
  /** Ce qui vient de se passer à cette étape, pour l'animation. */
  event: "open" | "crash" | null;
}

export function newGame(pool: number[], random: () => number): GameState {
  const target = pickNote(pool, -1, random);
  return {
    phase: "playing",
    door: 1,
    target,
    next: pickNote(pool, target, random),
    progress: 0,
    hold: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    lives: LIVES,
    doorSeconds: START_DOOR_SECONDS,
    helped: false,
    event: null,
  };
}

/** Le joueur a demandé à entendre la note : la porte en cours ne comptera pas. */
export function markHelped(state: GameState): GameState {
  return state.helped ? state : { ...state, helped: true };
}

/**
 * Fait avancer le jeu de `dt` secondes. `offset` est l'écart de la note chantée
 * (voir `pitchOffset`), ou null si l'on n'entend aucune note.
 */
export function stepGame(state: GameState, dt: number, offset: number | null, pool: number[], random: () => number): GameState {
  if (state.phase === "over") return state.event === null ? state : { ...state, event: null };
  // Un onglet resté en arrière-plan ne fait pas « sauter » la porte d'un coup.
  const step = Math.max(0, Math.min(0.1, dt));
  const onPitch = offset !== null && Math.abs(offset) <= TOLERANCE;
  const hold = onPitch ? state.hold + step / HOLD_SECONDS : Math.max(0, state.hold - step * 2);

  const nextDoor = (doorSeconds: number) => ({
    door: state.door + 1,
    target: state.next,
    next: pickNote(pool, state.next, random),
    progress: 0,
    hold: 0,
    helped: false,
    doorSeconds,
  });

  if (hold >= 1) {
    const streak = state.streak + 1;
    return {
      ...state,
      ...nextDoor(Math.max(MIN_DOOR_SECONDS, state.doorSeconds * 0.96)),
      score: state.score + (state.helped ? 0 : 1),
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      event: "open",
    };
  }

  const progress = state.progress + step / state.doorSeconds;
  if (progress >= 1) {
    const lives = state.lives - 1;
    if (lives <= 0) return { ...state, phase: "over", lives: 0, progress: 1, hold: 0, streak: 0, event: "crash" };
    // Après un choc, la porte suivante laisse un peu plus de temps.
    return { ...state, ...nextDoor(Math.min(START_DOOR_SECONDS, state.doorSeconds * 1.1)), lives, streak: 0, event: "crash" };
  }
  return { ...state, progress, hold, event: null };
}
