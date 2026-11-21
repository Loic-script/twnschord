"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LiveAnalyzer, type LiveChord, type LiveNote } from "@/lib/audio/live";
import { midiLabel, pcName, pitchClass, type NoteNaming } from "@/lib/audio/notes";
import { openMic } from "@/lib/mic";
import { Keyboard } from "./Keyboard";
import { ChordText, NoteText } from "./NoteText";

type Mode = "note" | "chord";

interface Shown {
  level: number;
  note: LiveNote | null;
  chord: LiveChord | null;
  chroma: number[];
  /** Le son s'est tu : on garde la dernière lecture à l'écran, estompée. */
  noteHeld: boolean;
  chordHeld: boolean;
}

const EMPTY: Shown = { level: 0, note: null, chord: null, chroma: new Array(12).fill(0), noteHeld: false, chordHeld: false };
const HOLD_MS = 1800;
const HISTORY = 24;

interface Session {
  ctx: AudioContext;
  stream: MediaStream;
  raf: number;
}

export default function LiveView({ naming }: { naming: NoteNaming }) {
  const [mode, setMode] = useState<Mode>("note");
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown>(EMPTY);
  const [noteLog, setNoteLog] = useState<number[]>([]);
  const [chordLog, setChordLog] = useState<string[]>([]);
  const session = useRef<Session | null>(null);

  const stop = useCallback(() => {
    const s = session.current;
    if (!s) return;
    session.current = null;
    cancelAnimationFrame(s.raf);
    s.stream.getTracks().forEach((track) => track.stop());
    void s.ctx.close();
    setListening(false);
    setShown(EMPTY);
  }, []);

  // Le micro est coupé dès qu'on quitte cet écran.
  useEffect(() => stop, [stop]);

  const start = async () => {
    setError(null);
    setStarting(true);
    try {
      const { ctx, analyser, stream } = await openMic();
      const live = new LiveAnalyzer(ctx.sampleRate, analyser.fftSize);
      const buffer = new Float32Array(analyser.fftSize);
      const s: Session = { ctx, stream, raf: 0 };
      session.current = s;
      stream.getAudioTracks()[0]?.addEventListener("ended", stop);

      let last = 0;
      let note: LiveNote | null = null;
      let noteAt = 0;
      let chord: LiveChord | null = null;
      let chordAt = 0;
      let loggedNote = -1;
      let loggedChord = "";

      const tick = (now: number) => {
        if (session.current !== s) return;
        s.raf = requestAnimationFrame(tick);
        if (now - last < 45) return;
        last = now;
        analyser.getFloatTimeDomainData(buffer);
        const result = live.process(buffer);

        if (result.silent) {
          // Après un silence, rejouer la même note compte comme une nouvelle note.
          loggedNote = -1;
          loggedChord = "";
        }
        if (result.note) {
          note = result.note;
          noteAt = now;
          if (note.midi !== loggedNote) {
            loggedNote = note.midi;
            const midi = note.midi;
            setNoteLog((log) => [...log, midi].slice(-HISTORY));
          }
        } else if (now - noteAt > HOLD_MS) {
          note = null;
        }
        if (result.chord) {
          chord = result.chord;
          chordAt = now;
          if (chord.label !== loggedChord) {
            loggedChord = chord.label;
            const label = chord.label;
            setChordLog((log) => [...log, label].slice(-HISTORY));
          }
        } else if (now - chordAt > HOLD_MS) {
          chord = null;
        }

        setShown({
          level: result.level,
          note,
          chord,
          chroma: Array.from(result.chroma),
          noteHeld: !result.note && note !== null,
          chordHeld: !result.chord && chord !== null,
        });
      };
      s.raf = requestAnimationFrame(tick);
      setListening(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le micro n'a pas pu démarrer. Réessayez.");
    } finally {
      setStarting(false);
    }
  };

  const { note, chord } = shown;
  const held = mode === "note" ? shown.noteHeld : shown.chordHeld;
  const active = mode === "note" ? (note ? [pitchClass(note.midi)] : []) : (chord?.tones ?? []);
  const tuned = note !== null && Math.abs(note.cents) <= 5;
  const log = mode === "note" ? noteLog.map((midi) => pcName(pitchClass(midi), naming)) : chordLog;

  let main = null;
  let sub = "";
  if (mode === "note" && note) {
    main = (
      <div className="readout-main">
        <NoteText text={pcName(pitchClass(note.midi), naming)} />
      </div>
    );
    sub = `${midiLabel(note.midi)} · ${note.freq.toFixed(1).replace(".", ",")} Hz`;
  } else if (mode === "chord" && chord) {
    main =
      chord.kind === "note" ? (
        <div className="readout-main">
          <NoteText text={pcName(chord.root, naming)} />
        </div>
      ) : (
        <div className="readout-main is-chord">
          <ChordText label={chord.label} />
        </div>
      );
    sub = chord.kind === "note" ? "une seule note" : chord.tones.map((pc) => pcName(pc, naming)).join(" · ");
  }

  const idle = !listening
    ? mode === "note"
      ? "Activez le micro, puis jouez une note."
      : "Activez le micro, puis plaquez un accord."
    : mode === "note"
      ? "Jouez une note…"
      : "Plaquez un accord…";

  return (
    <>
      <section className="stage" data-held={held} aria-label="Reconnaissance en direct">
        <div className="stage-head">
          <div className="seg seg-dark" role="group" aria-label="Ce qu'il faut reconnaître">
            <button type="button" className={`seg-btn ${mode === "note" ? "is-on" : ""}`} aria-pressed={mode === "note"} onClick={() => setMode("note")}>
              Note
            </button>
            <button type="button" className={`seg-btn ${mode === "chord" ? "is-on" : ""}`} aria-pressed={mode === "chord"} onClick={() => setMode("chord")}>
              Accord
            </button>
          </div>
          <div className="level" role="img" aria-label="Niveau du micro">
            <i style={{ transform: `scaleX(${Math.min(1, Math.sqrt(shown.level * 6)).toFixed(2)})` }} />
          </div>
        </div>

        <div className="readout" aria-live="polite" aria-atomic="true">
          {main ?? <p className="readout-idle">{idle}</p>}
          <div className="readout-sub">{sub}</div>
        </div>

        {mode === "note" && (
          <div className="tuner" data-tuned={tuned}>
            <div className="tuner-scale">
              {note && <i className="tuner-needle" style={{ left: `${Math.max(0, Math.min(100, 50 + note.cents))}%` }} />}
            </div>
            <div className="tuner-labels">
              <span>trop bas</span>
              <span className="tuner-mid">
                {note ? (tuned ? "juste" : `${note.cents > 0 ? "+" : "−"}${Math.abs(note.cents)} cents`) : "juste"}
              </span>
              <span>trop haut</span>
            </div>
          </div>
        )}

        <Keyboard chroma={shown.chroma} active={active} naming={naming} />
      </section>

      <div className="actions">
        {listening ? (
          <button type="button" className="btn btn-lg btn-stop" onClick={stop}>
            Couper le micro
          </button>
        ) : (
          <button type="button" className="btn btn-lg btn-primary" onClick={start} disabled={starting}>
            {starting ? "Démarrage…" : "Activer le micro"}
          </button>
        )}
        <p className="note">Le son est analysé sur cet appareil. Rien n&apos;est enregistré ni envoyé.</p>
      </div>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {log.length > 0 && (
        <section className="heard">
          <div className="actions">
            <h2 className="label">{mode === "note" ? "Notes entendues" : "Accords entendus"}</h2>
            <button type="button" className="btn btn-quiet" onClick={() => (mode === "note" ? setNoteLog([]) : setChordLog([]))}>
              Effacer
            </button>
          </div>
          <ol className="chips">
            {log.map((label, i) => (
              <li key={i} className="chip">
                {label}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
