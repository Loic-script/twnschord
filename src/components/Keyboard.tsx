import type { CSSProperties } from "react";
import { pcName, type NoteNaming } from "@/lib/audio/notes";
import { NoteText } from "./NoteText";

const WHITE = [0, 2, 4, 5, 7, 9, 11];
// [classe de hauteur, rang de la touche blanche à droite de laquelle elle se place]
const BLACK: [number, number][] = [
  [1, 1],
  [3, 2],
  [6, 4],
  [8, 5],
  [10, 6],
];

interface Props {
  /** Énergie entendue par classe de hauteur, de 0 à 1. */
  chroma: ArrayLike<number>;
  /** Classes de hauteur de la note ou de l'accord reconnu. */
  active: number[];
  naming: NoteNaming;
}

/** Une octave de clavier : la lueur d'une touche suit l'énergie entendue sur sa note. */
export function Keyboard({ chroma, active, naming }: Props) {
  const glow = (pc: number) => ({ "--v": Math.max(0, Math.min(1, chroma[pc] ?? 0)).toFixed(2) }) as CSSProperties;
  return (
    <div className="keys" aria-hidden="true">
      {WHITE.map((pc) => (
        <div key={pc} className="key key-white" style={glow(pc)} data-on={active.includes(pc) || undefined}>
          <NoteText text={pcName(pc, naming)} />
        </div>
      ))}
      {BLACK.map(([pc, slot]) => (
        <div
          key={pc}
          className="key key-black"
          style={{ ...glow(pc), left: `${(slot / 7) * 100}%` }}
          data-on={active.includes(pc) || undefined}
        />
      ))}
    </div>
  );
}
