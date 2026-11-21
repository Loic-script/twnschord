import { describe, expect, it } from "vitest";
import { HOLD_SECONDS, LEVELS, LIVES, markHelped, MIN_DOOR_SECONDS, newGame, pickNote, pitchOffset, START_DOOR_SECONDS, stepGame, type GameState } from "./singGame";

/** Hasard déterministe pour les tests. */
function randomFrom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ALL = LEVELS[2].notes;

/** Fait tourner le jeu `seconds` secondes avec un écart de justesse constant. */
function run(state: GameState, seconds: number, offset: number | null, pool = ALL, random = randomFrom(7)): GameState {
  for (let t = 0; t < seconds; t += 0.02) state = stepGame(state, 0.02, offset, pool, random);
  return state;
}

/** Chante avec l'écart donné jusqu'à ce que la porte s'ouvre (ou une seconde au plus). */
function singUntilOpen(state: GameState, offset: number, pool = ALL, random = randomFrom(7)): GameState {
  const door = state.door;
  for (let t = 0; t < 1 && state.door === door; t += 0.02) state = stepGame(state, 0.02, offset, pool, random);
  return state;
}

describe("écart entre la note chantée et la note demandée", () => {
  it("vaut zéro sur la bonne note, à n'importe quelle octave", () => {
    for (const midi of [36, 48, 60, 72, 84]) expect(pitchOffset(midi, 0)).toBe(0);
    expect(pitchOffset(69, 9)).toBe(0);
  });

  it("est positif trop haut, négatif trop bas", () => {
    expect(pitchOffset(62, 0)).toBe(2); // Ré chanté pour un Do : deux demi-tons trop haut
    expect(pitchOffset(59, 0)).toBe(-1); // Si : un demi-ton trop bas
    expect(pitchOffset(60.3, 0)).toBeCloseTo(0.3, 6);
    expect(pitchOffset(59.8, 0)).toBeCloseTo(-0.2, 6);
  });

  it("prend le plus court chemin autour du cercle des notes", () => {
    expect(pitchOffset(71, 0)).toBe(-1); // Si → Do : monter d'un demi-ton, pas descendre de onze
    expect(pitchOffset(65, 0)).toBe(5);
    expect(pitchOffset(67, 0)).toBe(-5);
    expect(Math.abs(pitchOffset(66, 0))).toBe(6);
  });
});

describe("tirage des notes", () => {
  it("reste dans le niveau choisi et ne répète pas la note précédente", () => {
    const random = randomFrom(3);
    for (const level of LEVELS) {
      let previous = -1;
      for (let i = 0; i < 200; i++) {
        const note = pickNote(level.notes, previous, random);
        expect(level.notes).toContain(note);
        expect(note).not.toBe(previous);
        previous = note;
      }
    }
  });

  it("tire toutes les notes du niveau", () => {
    const random = randomFrom(11);
    const seen = new Set<number>();
    let previous = -1;
    for (let i = 0; i < 300; i++) seen.add((previous = pickNote(ALL, previous, random)));
    expect(seen.size).toBe(12);
  });

  it("accepte un niveau d'une seule note", () => {
    expect(pickNote([5], 5, randomFrom(1))).toBe(5);
  });
});

describe("déroulement d'une partie", () => {
  it("commence avec trois vies, une porte au loin et la suivante prête", () => {
    const game = newGame(LEVELS[0].notes, randomFrom(1));
    expect(game).toMatchObject({ phase: "playing", door: 1, progress: 0, hold: 0, score: 0, lives: LIVES, doorSeconds: START_DOOR_SECONDS });
    expect(game.next).not.toBe(game.target);
  });

  it("ouvre la porte quand la bonne note est tenue assez longtemps", () => {
    const start = newGame(ALL, randomFrom(1));
    const almost = run(start, HOLD_SECONDS - 0.1, 0);
    expect(almost.door).toBe(1);
    expect(almost.hold).toBeGreaterThan(0.6);
    const opened = singUntilOpen(almost, 0);
    expect(opened).toMatchObject({ door: 2, score: 1, streak: 1, target: start.next, hold: 0, progress: 0, lives: LIVES, event: "open" });
    expect(opened.doorSeconds).toBeLessThan(START_DOOR_SECONDS);
  });

  it("signale l'ouverture une seule fois", () => {
    let game = newGame(ALL, randomFrom(1));
    const events: string[] = [];
    const random = randomFrom(5);
    // On tient la note juste assez pour une porte, puis on se tait.
    for (let t = 0; t < 1.5; t += 0.02) {
      game = stepGame(game, 0.02, game.door === 1 ? 0 : null, ALL, random);
      if (game.event) events.push(game.event);
    }
    expect(events).toEqual(["open"]);
  });

  it("tolère une note un peu fausse, pas une note voisine", () => {
    expect(singUntilOpen(newGame(ALL, randomFrom(1)), 0.35).score).toBe(1);
    expect(singUntilOpen(newGame(ALL, randomFrom(1)), -0.35).score).toBe(1);
    expect(singUntilOpen(newGame(ALL, randomFrom(1)), 1).score).toBe(0);
    expect(singUntilOpen(newGame(ALL, randomFrom(1)), -0.6).score).toBe(0);
  });

  it("la tenue retombe si l'on quitte la note", () => {
    const held = run(newGame(ALL, randomFrom(1)), 0.3, 0);
    expect(held.hold).toBeGreaterThan(0.5);
    expect(run(held, 0.4, 3).hold).toBe(0);
    expect(run(held, 0.4, null).hold).toBe(0);
  });

  it("une porte qui arrive jusqu'au joueur coûte une vie et remet la série à zéro", () => {
    const afterOne = singUntilOpen(newGame(ALL, randomFrom(1)), 0);
    expect(afterOne.streak).toBe(1);
    const crashed = run(afterOne, afterOne.doorSeconds + 0.1, null);
    expect(crashed).toMatchObject({ phase: "playing", lives: LIVES - 1, streak: 0, score: 1, bestStreak: 1 });
    expect(crashed.door).toBe(afterOne.door + 1);
  });

  it("la partie s'arrête à la troisième porte manquée, et ne bouge plus ensuite", () => {
    const over = run(newGame(ALL, randomFrom(1)), 40, null);
    expect(over).toMatchObject({ phase: "over", lives: 0 });
    const later = run(over, 5, 0);
    expect(later.score).toBe(over.score);
    expect(later.phase).toBe("over");
    expect(later.event).toBeNull();
  });

  it("les portes vont de plus en plus vite, jusqu'à une limite", () => {
    let game = newGame(ALL, randomFrom(1));
    const random = randomFrom(9);
    for (let i = 0; i < 60; i++) game = singUntilOpen(game, 0, ALL, random);
    expect(game.score).toBe(60);
    expect(game.doorSeconds).toBe(MIN_DOOR_SECONDS);
    expect(game.bestStreak).toBe(game.streak);
  });

  it("une porte ouverte avec l'aide ne rapporte pas de point", () => {
    const helped = singUntilOpen(markHelped(newGame(ALL, randomFrom(1))), 0);
    expect(helped).toMatchObject({ door: 2, score: 0, helped: false });
    expect(singUntilOpen(helped, 0).score).toBe(1);
  });

  it("un long arrêt (onglet en arrière-plan) ne fait pas perdre de vie d'un coup", () => {
    const game = stepGame(newGame(ALL, randomFrom(1)), 60, null, ALL, randomFrom(2));
    expect(game.lives).toBe(LIVES);
    expect(game.progress).toBeLessThan(0.05);
  });
});
