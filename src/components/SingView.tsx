"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { LiveAnalyzer } from "@/lib/audio/live";
import { freqToMidi, midiToFreq, pcName, pitchClass, type NoteNaming } from "@/lib/audio/notes";
import { LEVELS, LIVES, markHelped, newGame, pitchOffset, stepGame, TOLERANCE, type GameState, type Level } from "@/lib/audio/singGame";
import { openMic, type Mic } from "@/lib/mic";
import { NoteText } from "./NoteText";

/** Ce que le micro entend : la note chantée et son écart à la note demandée, en demi-tons. */
interface Heard {
  pc: number;
  offset: number;
}

interface Session {
  mic: Mic;
  raf: number;
  state: GameState;
  /** Tant que l'application joue elle-même une note, le micro n'est pas écouté. */
  muteUntil: number;
}

const bestKey = (level: Level) => `twinschord.chant.record.${level}`;

function readBest(level: Level): number {
  try {
    return Number(localStorage.getItem(bestKey(level))) || 0;
  } catch {
    return 0;
  }
}

export default function SingView({ naming }: { naming: NoteNaming }) {
  const [level, setLevel] = useState<Level>("easy");
  const [game, setGame] = useState<GameState | null>(null);
  const [heard, setHeard] = useState<Heard | null>(null);
  const [flash, setFlash] = useState<{ kind: "open" | "crash"; id: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [best, setBest] = useState(0);
  const session = useRef<Session | null>(null);

  useEffect(() => setBest(readBest(level)), [level]);

  const stop = useCallback(() => {
    const s = session.current;
    if (!s) return;
    session.current = null;
    cancelAnimationFrame(s.raf);
    s.mic.close();
    setHeard(null);
  }, []);

  // Le micro est coupé dès qu'on quitte cet écran.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop();
    };
  }, [stop]);

  const start = async () => {
    setError(null);
    setStarting(true);
    try {
      stop();
      const mic = await openMic();
      // Écran quitté pendant la demande d'autorisation : le micro qui vient de s'ouvrir est refermé aussitôt.
      if (!alive.current) {
        mic.close();
        return;
      }
      const pool = LEVELS.find((l) => l.id === level)?.notes ?? LEVELS[0].notes;
      const live = new LiveAnalyzer(mic.ctx.sampleRate, mic.analyser.fftSize);
      const buffer = new Float32Array(mic.analyser.fftSize);
      const s: Session = { mic, raf: 0, state: newGame(pool, Math.random), muteUntil: 0 };
      session.current = s;
      // Micro débranché ou retiré par le système en pleine partie : la partie s'arrête et le dit,
      // au lieu de rester figée sur une porte.
      mic.stream.getAudioTracks()[0]?.addEventListener("ended", () => {
        if (session.current !== s) return;
        stop();
        setGame(null);
        setFlash(null);
        setError("Le micro a été coupé. Relancez la partie.");
      });
      setGame(s.state);
      setFlash(null);

      let last = performance.now();
      let analysedAt = 0;
      let offset: number | null = null;
      const tick = (now: number) => {
        if (session.current !== s) return;
        s.raf = requestAnimationFrame(tick);
        const dt = (now - last) / 1000;
        last = now;

        if (now - analysedAt >= 45) {
          analysedAt = now;
          mic.analyser.getFloatTimeDomainData(buffer);
          const result = live.process(buffer);
          if (result.note && now >= s.muteUntil) {
            offset = pitchOffset(freqToMidi(result.note.freq), s.state.target);
            setHeard({ pc: pitchClass(result.note.midi), offset });
          } else {
            offset = null;
            setHeard(null);
          }
        }

        const previous = s.state;
        s.state = stepGame(previous, dt, offset, pool, Math.random);
        if (s.state === previous) return;
        setGame(s.state);
        if (s.state.event) {
          setFlash({ kind: s.state.event, id: s.state.door });
          // La note tenue valait pour l'ancienne porte : on attend la prochaine mesure.
          offset = null;
        }
        if (s.state.phase === "over") {
          const score = s.state.score;
          setBest((current) => {
            if (score <= current) return current;
            try {
              localStorage.setItem(bestKey(level), String(score));
            } catch {
              // Sans stockage, le record vaut pour cette visite seulement.
            }
            return score;
          });
          stop();
        }
      };
      s.raf = requestAnimationFrame(tick);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le micro n'a pas pu démarrer. Réessayez.");
    } finally {
      setStarting(false);
    }
  };

  /** Fait entendre une note ; le micro est ignoré pendant ce temps pour ne pas « s'écouter chanter ». */
  const playTone = (pc: number, isHint: boolean) => {
    const s = session.current;
    if (!s) return;
    const ctx = s.mic.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = midiToFreq(60 + pc);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.95);
    s.muteUntil = performance.now() + 1250;
    if (isHint) {
      s.state = markHelped(s.state);
      setGame(s.state);
    }
  };

  const quit = () => {
    stop();
    setGame(null);
    setFlash(null);
  };

  const playing = game?.phase === "playing";
  const over = game?.phase === "over";
  const targetName = game ? pcName(game.target, naming) : "";
  const onPitch = playing && heard !== null && Math.abs(heard.offset) <= TOLERANCE;

  let message = "";
  if (playing) {
    if (!heard) message = `Chantez « ${targetName} »`;
    else if (onPitch) message = "C'est ça, tenez la note";
    else {
      const steps = Math.round(Math.abs(heard.offset));
      const amount = steps < 1 ? "un peu" : `de ${steps} demi-ton${steps > 1 ? "s" : ""}`;
      message = `Vous chantez ${pcName(heard.pc, naming)} : ${heard.offset > 0 ? "descendez" : "montez"} ${amount}`;
    }
  }

  return (
    <>
      <section className="stage sing" aria-label="Jeu de chant">
        <div className="stage-head">
          <div className="hud">
            <span>
              Score <b>{game?.score ?? 0}</b>
            </span>
            <span>
              Série <b>{game?.streak ?? 0}</b>
            </span>
            <span>
              Record <b>{best}</b>
            </span>
          </div>
          <div className="lives" role="img" aria-label={`${game?.lives ?? LIVES} vie${(game?.lives ?? LIVES) > 1 ? "s" : ""} sur ${LIVES}`}>
            {Array.from({ length: LIVES }, (_, i) => (
              <i key={i} data-on={i < (game?.lives ?? LIVES) || undefined} />
            ))}
          </div>
        </div>

        <div className="lane">
          {flash && <i key={`${flash.kind}-${flash.id}`} className="lane-flash" data-kind={flash.kind} />}
          {!game && <p className="readout-idle">Une note arrive sur la porte. Chantez-la pour l&apos;ouvrir.</p>}
          {playing && game && (
            <>
              <div className="door door-next" aria-hidden="true">
                <NoteText text={pcName(game.next, naming)} />
              </div>
              <div
                key={game.door}
                className="door"
                data-hit={onPitch || undefined}
                style={{ "--s": (0.3 + 0.7 * Math.pow(game.progress, 1.5)).toFixed(3), "--hold": game.hold.toFixed(3) } as CSSProperties}
              >
                <i className="door-fill" />
                <span className="door-name">
                  <NoteText text={targetName} />
                </span>
              </div>
            </>
          )}
          {over && game && (
            <div className="lane-over" role="status">
              <p className="lane-over-title">Partie terminée</p>
              <p>
                {game.score} porte{game.score > 1 ? "s" : ""} ouverte{game.score > 1 ? "s" : ""} · meilleure série {game.bestStreak}
              </p>
              {game.score > 0 && game.score >= best && <p className="lane-over-record">Nouveau record</p>}
            </div>
          )}
        </div>

        <p className="sr-only" aria-live="polite">
          {playing ? `Note demandée : ${targetName}` : ""}
        </p>

        <div className="tuner" data-tuned={onPitch}>
          <div className="tuner-scale">
            {playing && heard && <i className="tuner-needle" style={{ left: `${Math.max(0, Math.min(100, 50 + (heard.offset / 6) * 50))}%` }} />}
          </div>
          <div className="tuner-labels">
            <span>trop bas</span>
            <span className="tuner-mid">{message}</span>
            <span>trop haut</span>
          </div>
        </div>
      </section>

      {playing ? (
        <div className="actions">
          <button type="button" className="btn" onClick={() => playTone(0, false)}>
            Écouter le {pcName(0, naming)} de repère
          </button>
          <button type="button" className="btn" onClick={() => game && playTone(game.target, true)}>
            Écouter la note (sans point)
          </button>
          <button type="button" className="btn btn-stop" onClick={quit}>
            Arrêter
          </button>
        </div>
      ) : (
        <>
          <div className="actions">
            <div className="seg seg-wrap" role="group" aria-label="Niveau">
              {LEVELS.map((l) => (
                <button key={l.id} type="button" className={`seg-btn ${level === l.id ? "is-on" : ""}`} aria-pressed={level === l.id} onClick={() => setLevel(l.id)}>
                  {l.name}
                </button>
              ))}
            </div>
          </div>
          <div className="actions">
            <button type="button" className="btn btn-lg btn-primary" onClick={start} disabled={starting}>
              {starting ? "Démarrage…" : over ? "Rejouer" : "Commencer"}
            </button>
            <p className="note">Le jeu écoute votre voix au micro. Rien n&apos;est enregistré ni envoyé.</p>
          </div>
        </>
      )}

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <p className="note">
        Chantez la note écrite sur la porte, dans l&apos;octave qui vous convient, et tenez-la une demi-seconde : la porte
        s&apos;ouvre. Le repère sous la porte montre la note que vous faites et s&apos;il faut monter ou descendre. Une porte
        qui arrive jusqu&apos;à vous coûte une vie ; à chaque porte ouverte, la suivante vient un peu plus vite.
      </p>
    </>
  );
}
