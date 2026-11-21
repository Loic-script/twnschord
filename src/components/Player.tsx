"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type User } from "@/lib/api";
import { decodeForPlayback, runPitchShift } from "@/lib/audio/analyzeClient";
import { keyLabel, pcName, type NoteNaming } from "@/lib/audio/notes";
import { buildSheet, type Meter, type Notation } from "@/lib/audio/solfa";
import { encodeWav } from "@/lib/audio/synth";
import { transposeAnalysis } from "@/lib/audio/transpose";
import type { Track } from "./App";
import { ChordText } from "./NoteText";
import { Sheet, type SheetView } from "./Sheet";

interface Props {
  track: Track;
  naming: NoteNaming;
  user: User | null;
  online: boolean;
  onChange: (track: Track) => void;
  onClose: () => void;
  onGoAccount: () => void;
}

/** Index du dernier temps commencé à l'instant `time`, ou −1 avant le premier. */
function findBeat(beats: number[], time: number): number {
  let lo = 0;
  let hi = beats.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= time + 0.02) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const RATES = [0.5, 0.75, 1];
// Au-delà d'une quarte augmentée, le son transposé se dégrade nettement.
const MAX_TRANSPOSE = 6;

const semitonesText = (n: number) => `${n > 0 ? "+" : "−"}${Math.abs(n)} demi-ton${Math.abs(n) > 1 ? "s" : ""}`;

export default function Player({ track, naming, user, online, onChange, onClose, onGoAccount }: Props) {
  const { analysis } = track;
  const hasAudio = track.audioUrl !== null;
  const audioRef = useRef<HTMLAudioElement>(null);
  // Sans fichier audio, une horloge interne fait avancer la partition.
  const clock = useRef({ base: 0, started: 0, running: false, rate: 1 });

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [view, setView] = useState<SheetView>("both");
  const [notation, setNotation] = useState<Notation>("solfa");
  const [meter, setMeter] = useState<Meter>({ beatsPerBar: analysis.beatsPerBar, downbeat: analysis.downbeat });
  const [title, setTitle] = useState(track.title);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // — Tonalité : la partition est relue dans la tonalité choisie, et le son est transposé à part.
  const [transpose, setTranspose] = useState(0);
  // La tonalité peut ne changer que les notes écrites, ou les notes et le son.
  const [shiftSound, setShiftSound] = useState(true);
  const [shifted, setShifted] = useState<{ semitones: number; url: string } | null>(null);
  const [shiftProgress, setShiftProgress] = useState<number | null>(null);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const shiftedRef = useRef(shifted);
  const decoded = useRef<Promise<{ samples: Float32Array; sampleRate: number }> | null>(null);
  // Position et état de lecture à retrouver quand le fichier son est remplacé.
  const swap = useRef<{ time: number; resume: boolean } | null>(null);

  const shown = useMemo(() => transposeAnalysis(analysis, transpose), [analysis, transpose]);
  const sheet = useMemo(() => buildSheet(shown, notation, meter), [shown, notation, meter]);
  const activeBeat = useMemo(() => findBeat(analysis.beats, time), [analysis.beats, time]);
  const audioSrc = shiftSound && transpose !== 0 && shifted ? shifted.url : track.audioUrl;

  const rememberPlayback = () => {
    const audio = audioRef.current;
    if (audio) swap.current = { time: audio.currentTime, resume: !audio.paused };
  };

  const changeKey = (next: number) => {
    const value = Math.max(-MAX_TRANSPOSE, Math.min(MAX_TRANSPOSE, next));
    if (value === 0 && shifted) {
      // Retour au fichier d'origine : immédiat. (En « notes seulement », c'est déjà lui qui joue.)
      if (shiftSound) rememberPlayback();
      URL.revokeObjectURL(shifted.url);
      shiftedRef.current = null;
      setShifted(null);
    }
    setTranspose(value);
  };

  const changeShiftSound = (next: boolean) => {
    if (next === shiftSound) return;
    if (shifted) {
      if (!next || shifted.semitones === transpose) {
        // Le fichier lu change tout de suite (retour à l'original, ou version transposée déjà prête).
        rememberPlayback();
      } else {
        // La version gardée en mémoire est dans une autre tonalité : on l'oublie, le son d'origine
        // continue le temps de calculer la bonne.
        URL.revokeObjectURL(shifted.url);
        shiftedRef.current = null;
        setShifted(null);
      }
    }
    setShiftSound(next);
  };

  useEffect(() => {
    const url = track.audioUrl;
    if (!url || transpose === 0 || !shiftSound) {
      setShiftProgress(null);
      setShiftError(null);
      return;
    }
    if (shiftedRef.current?.semitones === transpose) return;
    let cancelled = false;
    // Petit délai : plusieurs appuis rapprochés ne lancent qu'un seul calcul.
    const timer = setTimeout(async () => {
      setShiftProgress(0);
      setShiftError(null);
      try {
        decoded.current ??= decodeForPlayback(url);
        const audio = await decoded.current;
        const samples = await runPitchShift(audio.samples, transpose, (fraction) => {
          if (!cancelled) setShiftProgress(fraction);
        });
        if (cancelled) return;
        const next = { semitones: transpose, url: URL.createObjectURL(new Blob([encodeWav(samples, audio.sampleRate)], { type: "audio/wav" })) };
        const previous = shiftedRef.current;
        rememberPlayback();
        shiftedRef.current = next;
        setShifted(next);
        if (previous) URL.revokeObjectURL(previous.url);
      } catch {
        decoded.current = null;
        if (!cancelled) setShiftError("Le son n'a pas pu être transposé sur cet appareil. La partition, elle, est bien dans la nouvelle tonalité.");
      } finally {
        if (!cancelled) setShiftProgress(null);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [transpose, shiftSound, track.audioUrl]);

  useEffect(
    () => () => {
      if (shiftedRef.current) URL.revokeObjectURL(shiftedRef.current.url);
    },
    [],
  );

  const readTime = useCallback(() => {
    // Pendant qu'un nouveau fichier son se charge, on reste sur la position mémorisée.
    if (hasAudio && swap.current) return swap.current.time;
    if (hasAudio) return audioRef.current?.currentTime ?? 0;
    const c = clock.current;
    if (!c.running) return c.base;
    return Math.min(analysis.duration, c.base + ((performance.now() - c.started) / 1000) * c.rate);
  }, [hasAudio, analysis.duration]);

  // Un fichier audio vient d'être associé (ou retiré) : on repart à l'arrêt.
  useEffect(() => {
    clock.current.running = false;
    setPlaying(false);
  }, [track.audioUrl]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let lastBeat = -2;
    let lastQuarter = -1;
    const loop = () => {
      const t = readTime();
      const beat = findBeat(analysis.beats, t);
      const quarter = Math.floor(t * 4);
      if (beat !== lastBeat || quarter !== lastQuarter) {
        lastBeat = beat;
        lastQuarter = quarter;
        setTime(t);
      }
      if (!hasAudio && t >= analysis.duration) {
        clock.current.base = analysis.duration;
        clock.current.running = false;
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, hasAudio, analysis, readTime]);

  const toggle = () => {
    const audio = audioRef.current;
    if (hasAudio && audio) {
      if (audio.paused) void audio.play().catch(() => setPlaying(false));
      else audio.pause();
      return;
    }
    const c = clock.current;
    if (c.running) {
      c.base = readTime();
      c.running = false;
      setPlaying(false);
    } else {
      if (c.base >= analysis.duration - 0.05) c.base = 0;
      c.started = performance.now();
      c.running = true;
      setPlaying(true);
    }
  };

  const seek = useCallback(
    (t: number) => {
      const audio = audioRef.current;
      if (hasAudio && audio) audio.currentTime = t;
      else {
        clock.current.base = t;
        clock.current.started = performance.now();
      }
      setTime(t);
    },
    [hasAudio],
  );

  const changeRate = (next: number) => {
    const c = clock.current;
    c.base = readTime();
    c.started = performance.now();
    c.rate = next;
    if (audioRef.current) audioRef.current.playbackRate = next;
    setRate(next);
  };

  const attachAudio = (file: File | undefined) => {
    if (file) onChange({ ...track, audioUrl: URL.createObjectURL(file) });
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await api.saveAnalysis(title.trim() || "Sans titre", { ...analysis, ...meter });
      onChange({ ...track, title: saved.title, savedId: saved.id });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "L'enregistrement a échoué.");
    } finally {
      setSaving(false);
    }
  };

  const nowChord = activeBeat >= 0 ? shown.beatChords[activeBeat] : "N";
  const next = useMemo(() => {
    const current = activeBeat >= 0 ? shown.beatChords[activeBeat] : "N";
    for (let i = Math.max(0, activeBeat + 1); i < shown.beatChords.length; i++) {
      const label = shown.beatChords[i];
      if (label !== "N" && label !== current) return { label, inBeats: i - activeBeat };
    }
    return null;
  }, [shown.beatChords, activeBeat]);

  const doName = pcName(sheet.doPc, naming);
  const tuning = analysis.tuningCents;

  return (
    <article className="player">
      <header className="player-head">
        <h1 className="player-title">{track.title}</h1>
        <dl className="facts">
          <div>
            <dt className="label">Tonalité</dt>
            <dd>{keyLabel(shown.key.tonic, shown.key.mode, naming)}</dd>
          </div>
          <div>
            <dt className="label">Tempo</dt>
            <dd>{Math.round(analysis.tempo)} bpm</dd>
          </div>
          <div>
            <dt className="label">Mesure</dt>
            <dd>{meter.beatsPerBar} temps</dd>
          </div>
          <div>
            <dt className="label">Accordage</dt>
            <dd>{Math.abs(tuning) <= 3 ? "La 440" : `${tuning > 0 ? "+" : "−"}${Math.abs(tuning)} cents`}</dd>
          </div>
        </dl>
      </header>

      <div className="now" aria-live="off">
        <div className="now-chord">
          <span className="label">Maintenant</span>
          <b>{nowChord === "N" ? "—" : <ChordText label={nowChord} />}</b>
        </div>
        <div className="now-next">
          <span className="label">{next ? `Dans ${next.inBeats} temps` : "Ensuite"}</span>
          <b>{next ? <ChordText label={next.label} /> : "—"}</b>
        </div>
      </div>

      <div className="transport">
        <button type="button" className="play" onClick={toggle} aria-label={playing ? "Mettre en pause" : "Lire"}>
          {playing ? (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="5" y="4" width="5" height="16" rx="1" />
              <rect x="14" y="4" width="5" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
            </svg>
          )}
        </button>
        <span className="time">{clockText(time)}</span>
        <input
          className="seek"
          type="range"
          min={0}
          max={analysis.duration}
          step={0.1}
          value={Math.min(time, analysis.duration)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Position dans le morceau"
        />
        <span className="time">{clockText(analysis.duration)}</span>
      </div>

      <div className="toolbar">
        <div className="stepper" role="group" aria-label="Tonalité">
          <button type="button" onClick={() => changeKey(transpose - 1)} disabled={transpose <= -MAX_TRANSPOSE} aria-label="Descendre d'un demi-ton">
            −
          </button>
          <output>{keyLabel(shown.key.tonic, shown.key.mode, naming)}</output>
          <button type="button" onClick={() => changeKey(transpose + 1)} disabled={transpose >= MAX_TRANSPOSE} aria-label="Monter d'un demi-ton">
            +
          </button>
        </div>
        {hasAudio && (
          <div className="seg" role="group" aria-label="Ce que la tonalité change">
            <button type="button" className={`seg-btn ${shiftSound ? "is-on" : ""}`} aria-pressed={shiftSound} onClick={() => changeShiftSound(true)}>
              Notes et son
            </button>
            <button type="button" className={`seg-btn ${!shiftSound ? "is-on" : ""}`} aria-pressed={!shiftSound} onClick={() => changeShiftSound(false)}>
              Notes seulement
            </button>
          </div>
        )}
        {transpose !== 0 && (
          <>
            <span className="note">{semitonesText(transpose)}</span>
            <button type="button" className="btn btn-quiet" onClick={() => changeKey(0)}>
              Revenir à la tonalité d&apos;origine
            </button>
          </>
        )}
        {shiftProgress !== null && (
          <span className="note" role="status">
            Le son change de tonalité… {Math.round(shiftProgress * 100)} %
          </span>
        )}
        {transpose !== 0 && !hasAudio && <span className="note">Sans fichier audio, seule la partition change.</span>}
        {transpose !== 0 && hasAudio && !shiftSound && <span className="note">Le son reste dans sa tonalité d&apos;origine.</span>}
      </div>
      {shiftError && (
        <p className="alert" role="alert">
          {shiftError}
        </p>
      )}

      {hasAudio ? (
        <audio
          ref={audioRef}
          src={audioSrc ?? undefined}
          preload="auto"
          onLoadedMetadata={(e) => {
            const audio = e.currentTarget;
            audio.playbackRate = rate;
            const pending = swap.current;
            swap.current = null;
            const position = pending ? pending.time : time;
            if (position > 0) audio.currentTime = Math.min(position, audio.duration || position);
            if (pending?.resume) void audio.play().catch(() => setPlaying(false));
          }}
          onError={() => {
            swap.current = null;
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onSeeked={(e) => setTime(e.currentTarget.currentTime)}
        />
      ) : (
        <p className="note">
          Ce morceau est ouvert sans son : la partition défile au tempo.{" "}
          <label className="btn" style={{ marginLeft: 6 }}>
            Associer le fichier audio
            <input type="file" accept="audio/*,video/*" className="sr-only" onChange={(e) => attachAudio(e.target.files?.[0])} />
          </label>
        </p>
      )}

      <div className="toolbar">
        <div className="seg" role="group" aria-label="Ce qu'il faut suivre">
          {(
            [
              ["chords", "Accords"],
              ["solfa", "Solfa"],
              ["both", "Les deux"],
            ] as [SheetView, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" className={`seg-btn ${view === id ? "is-on" : ""}`} aria-pressed={view === id} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
        {view !== "chords" && (
          <select className="select" value={notation} onChange={(e) => setNotation(e.target.value as Notation)} aria-label="Écriture de la mélodie">
            <option value="solfa">Solfa (d r m) — do = {doName}</option>
            <option value="latin">Do Ré Mi</option>
            <option value="letter">C D E</option>
          </select>
        )}
        <div className="seg" role="group" aria-label="Temps par mesure">
          {[3, 4].map((n) => (
            <button
              key={n}
              type="button"
              className={`seg-btn ${meter.beatsPerBar === n ? "is-on" : ""}`}
              aria-pressed={meter.beatsPerBar === n}
              onClick={() => setMeter((m) => ({ beatsPerBar: n, downbeat: m.downbeat % n }))}
            >
              {n} temps
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => setMeter((m) => ({ ...m, downbeat: (m.downbeat + 1) % m.beatsPerBar }))}
          title="Si les barres de mesure tombent à côté du temps fort"
        >
          Décaler le 1er temps
        </button>
        <select className="select" value={rate} onChange={(e) => changeRate(Number(e.target.value))} aria-label="Vitesse de lecture">
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r === 1 ? "Vitesse normale" : `Vitesse ${Math.round(r * 100)} %`}
            </option>
          ))}
        </select>
      </div>

      <Sheet sheet={sheet} view={view} activeBeat={activeBeat} follow={playing} onSeek={seek} />

      <p className="note">
        Accords, tempo et mélodie sont estimés par calcul sur cet appareil. Sur un enregistrement chargé (voix, batterie,
        plusieurs instruments), la mélodie reste approximative.
      </p>

      <div className="save">
        {track.savedId ? (
          <p className="note">Enregistré dans votre bibliothèque.</p>
        ) : user ? (
          <>
            <input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} aria-label="Titre du morceau" />
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !online}>
              {saving ? "Enregistrement…" : "Enregistrer dans ma bibliothèque"}
            </button>
            {!online && <p className="note">Hors ligne : reconnectez-vous à Internet pour enregistrer.</p>}
            {transpose !== 0 && <p className="note">Le morceau est enregistré dans sa tonalité d&apos;origine.</p>}
          </>
        ) : (
          <>
            <p className="note">Sans compte, cette analyse disparaît à la fermeture.</p>
            <button type="button" className="btn" onClick={onGoAccount}>
              Se connecter pour l&apos;enregistrer
            </button>
          </>
        )}
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          Analyser un autre morceau
        </button>
      </div>
      {saveError && (
        <p className="alert" role="alert">
          {saveError}
        </p>
      )}
    </article>
  );
}
