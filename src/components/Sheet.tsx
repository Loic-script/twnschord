"use client";

import { Fragment, memo, useEffect, useMemo, useRef, type CSSProperties } from "react";
import type { Sheet as SheetModel, SheetBar, SheetToken } from "@/lib/audio/solfa";
import { ChordText, NoteText } from "./NoteText";

export type SheetView = "chords" | "solfa" | "both";

function Token({ token }: { token: SheetToken }) {
  if (token.kind === "rest") return <span className="tok"> </span>;
  if (token.kind === "hold") return <span className="tok tok-hold">–</span>;
  return (
    <span className="tok">
      <NoteText text={token.text} />
      {token.octave > 0 && <sup>{"'".repeat(token.octave)}</sup>}
      {token.octave < 0 && <sub>{",".repeat(-token.octave)}</sub>}
    </span>
  );
}

interface BarProps {
  bar: SheetBar;
  /** Index du temps en cours s'il est dans cette mesure, sinon −1. */
  active: number;
  onSeek: (time: number) => void;
}

const Bar = memo(function Bar({ bar, active, onSeek }: BarProps) {
  return (
    <div
      className="bar"
      style={{ "--beats": bar.beats.length } as CSSProperties}
      data-active={active >= 0 || undefined}
      data-pickup={bar.pickup || undefined}
    >
      {bar.beats.map((beat) => (
        <button
          key={beat.beat}
          type="button"
          className="beat"
          tabIndex={-1}
          data-active={beat.beat === active || undefined}
          onClick={() => onSeek(beat.time)}
        >
          <span className="beat-chord">{beat.chord && <ChordText label={beat.chord} />}</span>
          <span className="beat-notes">
            {beat.tokens.map((token, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="tok-dot">.</span>}
                <Token token={token} />
              </Fragment>
            ))}
          </span>
        </button>
      ))}
    </div>
  );
});

interface Props {
  sheet: SheetModel;
  view: SheetView;
  activeBeat: number;
  /** Faire défiler la partition pour garder la mesure en cours visible. */
  follow: boolean;
  onSeek: (time: number) => void;
}

export const Sheet = memo(function Sheet({ sheet, view, activeBeat, follow, onSeek }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const activeBar = useMemo(
    () => sheet.bars.findIndex((bar) => bar.beats.some((beat) => beat.beat === activeBeat)),
    [sheet, activeBeat],
  );

  useEffect(() => {
    const container = box.current;
    if (!follow || activeBar < 0 || !container) return;
    const bar = container.children[activeBar] as HTMLElement | undefined;
    if (!bar) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    container.scrollTo({
      top: bar.offsetTop - container.clientHeight / 2 + bar.clientHeight / 2,
      behavior: reduced ? "auto" : "smooth",
    });
  }, [activeBar, follow]);

  return (
    <div className="sheet" data-view={view} ref={box}>
      {sheet.bars.map((bar) => (
        <Bar key={bar.index} bar={bar} active={bar.index === activeBar ? activeBeat : -1} onSeek={onSeek} />
      ))}
    </div>
  );
});
