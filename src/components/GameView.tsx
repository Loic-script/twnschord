"use client";

import { useState } from "react";
import type { NoteNaming } from "@/lib/audio/notes";
import PianoView from "./PianoView";
import SingView from "./SingView";

type Game = "sing" | "piano";

const GAMES: [Game, string][] = [
  ["sing", "Chant"],
  ["piano", "Piano"],
];

/** L'onglet « Jeu » : chanter les notes demandées, ou jouer librement du piano. */
export default function GameView({ naming }: { naming: NoteNaming }) {
  const [game, setGame] = useState<Game>("sing");
  return (
    <>
      <div className="seg seg-wrap" role="group" aria-label="Choix du jeu">
        {GAMES.map(([id, name]) => (
          <button key={id} type="button" className={`seg-btn ${game === id ? "is-on" : ""}`} aria-pressed={game === id} onClick={() => setGame(id)}>
            {name}
          </button>
        ))}
      </div>
      {game === "sing" ? <SingView naming={naming} /> : <PianoView naming={naming} />}
    </>
  );
}
