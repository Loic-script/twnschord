"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChordText } from "./NoteText";

// Éléments de l'onglet Générer : réglages en pas à pas, volume, bouton muet, accord de la suite.

export const beatsText = (n: number) => `${n} temps`;

export function Stepper({
  value,
  onChange,
  label,
  min,
  max,
  format,
  lessLabel,
  moreLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min: number;
  max: number;
  format: (value: number) => string;
  lessLabel: string;
  moreLabel: string;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={lessLabel}>
        −
      </button>
      <output>{format(value)}</output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={moreLabel}>
        +
      </button>
    </div>
  );
}

export function OctaveStepper({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <Stepper
      value={value}
      onChange={onChange}
      label={label}
      min={-2}
      max={2}
      format={(v) => (v === 0 ? "Octave normale" : `Octave ${v > 0 ? "+" : "−"}${Math.abs(v)}`)}
      lessLabel="Descendre d'une octave"
      moreLabel="Monter d'une octave"
    />
  );
}

export function Volume({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <label className="vol">
      <span className="label">Volume · {Math.round(value * 100)} %</span>
      <input className="seek" type="range" min={0} max={150} step={5} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} aria-label={label} />
    </label>
  );
}

/** Coupe ou rétablit le son d'une piste, sans toucher à son volume. */
export function MuteButton({ muted, onToggle, name }: { muted: boolean; onToggle: () => void; name: string }) {
  return (
    <button type="button" className="mute-btn" aria-pressed={muted} aria-label={muted ? `Rétablir le son : ${name}` : `Couper le son : ${name}`} title={muted ? "Rétablir le son" : "Couper le son"} onClick={onToggle}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
        {muted ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />}
      </svg>
      <span>{muted ? "Muet" : "Son"}</span>
    </button>
  );
}

// Durées proposées pour un accord en particulier.
const CHORD_BEATS = [1, 2, 3, 4];

/**
 * Un accord de la suite : son nom, sa durée en points (un par temps), et un menu pour changer cette
 * durée. Le choix s'écrit dans le texte des accords (« Am:2 »).
 */
export function ChordChip({
  label,
  beats,
  custom,
  common,
  active,
  onBeats,
}: {
  label: string;
  beats: number;
  /** L'accord a une durée propre (sinon il suit la durée commune). */
  custom: boolean;
  common: number;
  active: boolean;
  onBeats: (beats: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  // Près du bord droit de l'écran, le menu s'aligne sur la droite de l'accord pour ne pas en sortir.
  const [alignEnd, setAlignEnd] = useState(false);
  const root = useRef<HTMLLIElement>(null);
  const menuId = useId();
  const choices = [...new Set([...CHORD_BEATS, ...(custom && !CHORD_BEATS.includes(beats) ? [beats] : [])])].sort((a, b) => a - b);

  useEffect(() => {
    if (!open) return;
    // Le menu s'ouvre sur le choix en cours ; un clic ailleurs ou Échap le referme.
    root.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      root.current?.querySelector<HTMLElement>(".prog-btn")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const pick = (value: number | null) => {
    onBeats(value);
    setOpen(false);
    root.current?.querySelector<HTMLElement>(".prog-btn")?.focus();
  };

  // Flèches haut / bas pour parcourir le menu.
  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <li ref={root} className="prog-chord" data-active={active || undefined} data-custom={custom || undefined} data-open={open || undefined}>
      <button
        type="button"
        className="prog-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${label}, ${beatsText(beats)}. Modifier la durée`}
        onClick={() => {
          const rect = root.current?.getBoundingClientRect();
          if (rect) setAlignEnd(rect.left + 250 > window.innerWidth && rect.right > 250);
          setOpen((o) => !o);
        }}
      >
        <span className="prog-name">
          <ChordText label={label} />
        </span>
        <span className="prog-beats" aria-hidden="true">
          {beats <= 8 ? Array.from({ length: beats }, (_, i) => <i key={i} />) : <b>{beats}</b>}
        </span>
        <svg className="prog-edit" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5z" />
        </svg>
      </button>
      {open && (
        <div id={menuId} className="prog-menu" role="menu" aria-label={`Durée de ${label}`} data-align={alignEnd ? "end" : undefined} onKeyDown={onMenuKey}>
          <p className="prog-menu-title">Durée de {label}</p>
          {choices.map((n) => (
            <button key={n} type="button" role="menuitemradio" aria-checked={custom && beats === n} className="prog-option" onClick={() => pick(n)}>
              <span className="prog-beats" aria-hidden="true">
                {Array.from({ length: Math.min(n, 8) }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
              {beatsText(n)}
            </button>
          ))}
          <button type="button" role="menuitemradio" aria-checked={!custom} className="prog-option prog-option-common" onClick={() => pick(null)}>
            Durée commune · {beatsText(common)}
          </button>
        </div>
      )}
    </li>
  );
}

/** Durée en minutes et secondes : « 1:05 ». */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
