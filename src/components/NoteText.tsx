import { Fragment } from "react";

/** Affiche un nom de note ("Do♯", "Si♭") avec l'altération en exposant. */
export function NoteText({ text }: { text: string }) {
  return (
    <>
      {text.split(/([♯♭])/).map((part, i) =>
        part === "♯" || part === "♭" ? (
          <span key={i} className="acc">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

const CHORD_RE = /^([A-G])([♯♭]?)(.*)$/;

/** Affiche un accord ("F♯m7") : fondamentale en grand, altération en exposant, suffixe réduit. */
export function ChordText({ label }: { label: string }) {
  const match = CHORD_RE.exec(label);
  if (!match) return <>{label}</>;
  return (
    <>
      {match[1]}
      {match[2] && <span className="acc">{match[2]}</span>}
      {match[3] && <span className="suffix">{match[3]}</span>}
    </>
  );
}
