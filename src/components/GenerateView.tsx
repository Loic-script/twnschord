"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME } from "@/lib/app";
import { keyLabel, pcName, type NoteNaming } from "@/lib/audio/notes";
import {
  defaultStyle,
  encodeWav,
  foldTail,
  heardChords,
  MAX_TRACKS,
  MAX_TRANSPOSE,
  parseProgression,
  renderSong,
  stylesFor,
  type MelodyMode,
  type MelodyOptions,
  type SongOptions,
  type Track,
  type TrackInstrument,
} from "@/lib/audio/synth";
import { chordsKey, generateMelody, MELODY_BASE, melodyToText, parseMelody, solfaDoOf } from "@/lib/audio/tune";
import { INSTRUMENTS, type InstrumentId } from "@/lib/audio/voices";
import { Keyboard } from "./Keyboard";
import { ChordText } from "./NoteText";
import { Select, type SelectGroup, type SelectOption } from "./Select";

const PRESETS: [string, string][] = [
  ["Pop", "C G Am F"],
  ["Ballade", "Am F C G"],
  ["Jazz", "Dm7 G7 Cmaj7 A7"],
  ["Gospel", "C C7 F Fm C/G G7 C G7"],
  ["Blues en La", "A7 D7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7"],
];

interface TrackState extends Track {
  id: number;
}

// Ordre dans lequel les instruments sont proposés quand on ajoute une piste.
const SUGGESTED: TrackInstrument[] = ["piano", "bass", "drums", "guitar", "strings"];

const MELODY_MODES: [MelodyMode, string][] = [
  ["none", "Sans mélodie"],
  ["auto", "Selon les accords"],
  ["manual", "Écrite par vous"],
];

const typeLabel = (instrument: TrackInstrument) =>
  instrument === "drums" ? "Rythme" : instrument === "bass" ? "Ligne de basse" : "Type de jeu";

function Stepper({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= -2} aria-label="Descendre d'une octave">
        −
      </button>
      <output>{value === 0 ? "Octave normale" : `Octave ${value > 0 ? "+" : "−"}${Math.abs(value)}`}</output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= 2} aria-label="Monter d'une octave">
        +
      </button>
    </div>
  );
}

function Volume({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <label className="vol">
      <span className="label">Volume · {Math.round(value * 100)} %</span>
      <input className="seek" type="range" min={0} max={150} step={5} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} aria-label={label} />
    </label>
  );
}

const INSTRUMENT_OPTIONS: SelectOption<InstrumentId>[] = INSTRUMENTS.map(({ id, name }) => ({ value: id, label: name }));

// Choix d'une piste : les instruments, puis la section rythmique.
const TRACK_INSTRUMENTS: SelectGroup<TrackInstrument>[] = [
  { group: "Instruments", options: INSTRUMENT_OPTIONS },
  {
    group: "Rythmique",
    options: [
      { value: "bass", label: "Guitare basse" },
      { value: "drums", label: "Batterie" },
    ],
  },
];

interface Session {
  source: AudioBufferSourceNode;
  raf: number;
}

export default function GenerateView({ naming }: { naming: NoteNaming }) {
  const [text, setText] = useState("C G Am F");
  const [tempo, setTempo] = useState(100);
  const [beatsPerChord, setBeatsPerChord] = useState<2 | 4>(4);
  const [transpose, setTranspose] = useState(0);
  const [tracks, setTracks] = useState<TrackState[]>([{ id: 1, instrument: "piano", style: "pop", octave: 0, volume: 1 }]);
  const [melody, setMelody] = useState<MelodyOptions>({ mode: "none", text: "", seed: 1, instrument: "flute", octave: 0, volume: 1 });
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(2);

  const parsed = useMemo(() => parseProgression(text), [text]);
  const options = useMemo<SongOptions>(
    () => ({ chords: parsed.chords, tempo, beatsPerChord, transpose, tracks, melody }),
    [parsed.chords, tempo, beatsPerChord, transpose, tracks, melody],
  );
  // Les accords tels qu'on les entend, une fois la tonalité changée.
  const heard = useMemo(() => heardChords(parsed.chords, transpose), [parsed.chords, transpose]);
  const key = useMemo(() => (heard.length > 0 ? chordsKey(heard) : null), [heard]);
  const optionsRef = useRef(options);
  const ctxRef = useRef<AudioContext | null>(null);
  const session = useRef<Session | null>(null);
  const audible = tracks.some((t) => t.volume > 0) || (melody.mode !== "none" && melody.volume > 0);
  const ready = parsed.chords.length > 0 && audible;

  // — Mélodie
  const totalBeats = parsed.chords.length * beatsPerChord;
  const melodyBase = MELODY_BASE + 12 * melody.octave;
  const generatedText = useMemo(
    () => (melody.mode === "auto" ? melodyToText(generateMelody(parsed.chords, beatsPerChord, melody.seed, melodyBase), totalBeats, naming, melodyBase) : ""),
    [melody.mode, melody.seed, parsed.chords, beatsPerChord, totalBeats, naming, melodyBase],
  );
  const doPc = useMemo(() => solfaDoOf(parsed.chords), [parsed.chords]);
  const melodyErrors = useMemo(
    () => (melody.mode === "manual" ? parseMelody(melody.text, doPc, melodyBase).errors : []),
    [melody.mode, melody.text, doPc, melodyBase],
  );
  const patchMelody = (patch: Partial<MelodyOptions>) => setMelody((m) => ({ ...m, ...patch }));

  // — Pistes
  const patchTrack = (id: number, patch: Partial<Track>) => setTracks((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const addTrack = () => {
    setTracks((list) => {
      if (list.length >= MAX_TRACKS) return list;
      const instrument = SUGGESTED.find((s) => !list.some((t) => t.instrument === s)) ?? "piano";
      return [...list, { id: nextId.current++, instrument, style: defaultStyle(instrument), octave: 0, volume: 1 }];
    });
  };

  // — Lecture
  /** Numéro de la dernière demande : une préparation devenue caduque (arrêt, nouvelle demande) s'abandonne. */
  const runs = useRef(0);

  /** Coupe le son en cours. */
  const halt = useCallback(() => {
    const s = session.current;
    session.current = null;
    if (s) {
      cancelAnimationFrame(s.raf);
      try {
        s.source.stop();
      } catch {
        // Source déjà arrêtée.
      }
      s.source.disconnect();
    }
  }, []);

  const stop = useCallback(() => {
    runs.current++;
    halt();
    setPlaying(false);
    setActive(-1);
  }, [halt]);

  const start = useCallback(async () => {
    const opts = optionsRef.current;
    if (opts.chords.length === 0) {
      stop();
      return;
    }
    const run = ++runs.current;
    setError(null);
    try {
      // Le contexte audio doit être ouvert pendant le clic, avant tout calcul.
      const ctx = (ctxRef.current ??= new AudioContext());
      void ctx.resume();
      setBusy(true);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const song = renderSong(opts);
      // « Arrêter » a été pressé, l'écran quitté ou une autre demande lancée pendant la préparation.
      if (runs.current !== run) return;
      const loop = foldTail(song.samples, song.loopLength);
      const buffer = ctx.createBuffer(1, loop.length, song.sampleRate);
      buffer.getChannelData(0).set(loop);

      halt();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(ctx.destination);
      const startAt = ctx.currentTime + 0.06;
      source.start(startAt);
      const s: Session = { source, raf: 0 };
      session.current = s;
      const duration = loop.length / song.sampleRate;
      const tick = () => {
        if (session.current !== s) return;
        const elapsed = ctx.currentTime - startAt;
        setActive(elapsed < 0 ? 0 : Math.floor((elapsed % duration) / song.chordDuration));
        s.raf = requestAnimationFrame(tick);
      };
      s.raf = requestAnimationFrame(tick);
      setPlaying(true);
    } catch {
      stop();
      setError("Le son n'a pas pu démarrer sur cet appareil. Réessayez.");
    } finally {
      setBusy(false);
    }
  }, [stop]);

  // Un réglage change pendant la lecture : on régénère et on repart, sans appuyer de nouveau.
  useEffect(() => {
    optionsRef.current = options;
    if (!session.current) return;
    const timer = setTimeout(() => {
      // Seulement si la lecture est toujours en cours : un arrêt entre-temps ne doit pas la relancer.
      if (session.current) void start();
    }, 300);
    return () => clearTimeout(timer);
  }, [options, start]);

  useEffect(
    () => () => {
      stop();
      void ctxRef.current?.close();
      ctxRef.current = null;
    },
    [stop],
  );

  const download = () => {
    const song = renderSong(options);
    const url = URL.createObjectURL(new Blob([encodeWav(song.samples, song.sampleRate)], { type: "audio/wav" }));
    const name = options.chords
      .slice(0, 6)
      .map((c) => c.label.replace("♯", "#").replace("♭", "b").replace("/", "-"))
      .join("-");
    const link = document.createElement("a");
    link.href = url;
    link.download = `${APP_NAME.toLowerCase()}-${name}.wav`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const current = playing && active >= 0 ? (heard[active] ?? null) : null;
  const tones = current ? current.intervals.map((iv) => (current.root + iv) % 12) : [];
  const glow = new Array<number>(12).fill(0);
  for (const pc of tones) glow[pc] = 1;

  return (
    <>
      <section className="stage" aria-label="Accord en cours">
        <div className="readout" aria-live="off">
          {current ? (
            <div className="readout-main is-chord">
              <ChordText label={current.label} />
            </div>
          ) : (
            <p className="readout-idle">Écrivez vos accords, composez votre groupe, puis écoutez.</p>
          )}
          <div className="readout-sub">{tones.map((pc) => pcName(pc, naming)).join(" · ")}</div>
        </div>
        <Keyboard chroma={glow} active={tones} naming={naming} />
      </section>

      {/* « transport » : sur téléphone, cette barre reste sous l'en-tête pendant qu'on règle les pistes plus bas. */}
      <div className="actions transport">
        {playing ? (
          <button type="button" className="btn btn-lg btn-stop" onClick={stop}>
            Arrêter
          </button>
        ) : (
          <button type="button" className="btn btn-lg btn-primary" onClick={() => void start()} disabled={!ready || busy}>
            {busy ? "Préparation…" : "Écouter"}
          </button>
        )}
        <button type="button" className="btn" onClick={download} disabled={!ready}>
          Télécharger le son (WAV)
        </button>
        {parsed.chords.length > 0 && !audible && <p className="note">Ajoutez une piste ou une mélodie pour entendre quelque chose.</p>}
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <section className="panel">
        <h2 className="panel-sub">Accords</h2>
        <label className="field">
          <span className="sr-only">Vos accords</span>
          <input
            className="input input-chords"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="C G Am F"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
          />
        </label>
        <p className="note">
          Séparez les accords par un espace : <code>C G Am F</code> ou <code>Do Sol Lam Fa</code>. Dièse <code>#</code>, bémol{" "}
          <code>b</code>, et <code>%</code> pour répéter l&apos;accord précédent.
        </p>
        <div className="chips">
          {PRESETS.map(([name, value]) => (
            <button key={name} type="button" className="chip chip-btn" onClick={() => setText(value)}>
              {name}
            </button>
          ))}
        </div>

        {parsed.errors.length > 0 && (
          <p className="alert" role="alert">
            {parsed.errors.length === 1 ? "Accord non reconnu" : "Accords non reconnus"} : {parsed.errors.join(", ")}. Ils
            sont laissés de côté.
          </p>
        )}

        {parsed.chords.length > 0 && (
          <ol className="prog" aria-label="Suite d'accords">
            {heard.map((chord, i) => (
              <li key={i} className="prog-chord" data-active={(playing && i === active) || undefined}>
                <ChordText label={chord.label} />
              </li>
            ))}
          </ol>
        )}

        <div className="options">
          <div className="option">
            <span className="label">Tonalité</span>
            <div className="option-row">
              <div className="stepper" role="group" aria-label="Tonalité">
                <button type="button" onClick={() => setTranspose((t) => t - 1)} disabled={transpose <= -MAX_TRANSPOSE} aria-label="Descendre d'un demi-ton">
                  −
                </button>
                <output>{key ? keyLabel(key.tonic, key.mode, naming) : "—"}</output>
                <button type="button" onClick={() => setTranspose((t) => t + 1)} disabled={transpose >= MAX_TRANSPOSE} aria-label="Monter d'un demi-ton">
                  +
                </button>
              </div>
              {transpose !== 0 && (
                <>
                  <span className="note">
                    {transpose > 0 ? "+" : "−"}
                    {Math.abs(transpose)} demi-ton{Math.abs(transpose) > 1 ? "s" : ""}
                  </span>
                  <button type="button" className="btn btn-quiet" onClick={() => setTranspose(0)}>
                    Revenir à la tonalité d&apos;origine
                  </button>
                </>
              )}
            </div>
          </div>
          <label className="option">
            <span className="label">Tempo · {tempo} bpm</span>
            <input className="seek" type="range" min={50} max={180} step={1} value={tempo} onChange={(e) => setTempo(Number(e.target.value))} />
          </label>
          <div className="option">
            <span className="label">Durée d&apos;un accord</span>
            <div className="seg" role="group" aria-label="Durée d'un accord">
              <button type="button" className={`seg-btn ${beatsPerChord === 4 ? "is-on" : ""}`} aria-pressed={beatsPerChord === 4} onClick={() => setBeatsPerChord(4)}>
                Une mesure
              </button>
              <button type="button" className={`seg-btn ${beatsPerChord === 2 ? "is-on" : ""}`} aria-pressed={beatsPerChord === 2} onClick={() => setBeatsPerChord(2)}>
                Deux temps
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-sub">Accompagnement</h2>
          <span className="note">
            {tracks.length} piste{tracks.length > 1 ? "s" : ""} sur {MAX_TRACKS}
          </span>
        </div>

        {tracks.length === 0 && <p className="note">Aucune piste. Ajoutez un piano, une guitare, une basse, une batterie…</p>}

        <ol className="tracks">
          {tracks.map((t, index) => {
            const n = index + 1;
            const styles = stylesFor(t.instrument);
            return (
              <li key={t.id} className="track">
                <div className="track-head">
                  <span className="track-num" aria-hidden="true">
                    {n}
                  </span>
                  <Select<TrackInstrument>
                    value={t.instrument}
                    label={`Instrument de la piste ${n}`}
                    options={TRACK_INSTRUMENTS}
                    onChange={(instrument) => {
                      // On garde le type choisi s'il existe aussi pour le nouvel instrument.
                      const keep = stylesFor(instrument) === styles && instrument !== "drums" && instrument !== "bass";
                      patchTrack(t.id, { instrument, style: keep ? t.style : defaultStyle(instrument) });
                    }}
                  />
                  <Select
                    value={t.style}
                    label={`${typeLabel(t.instrument)} de la piste ${n}`}
                    options={styles.map((style) => ({ value: style.id, label: style.name }))}
                    onChange={(style) => patchTrack(t.id, { style })}
                  />
                  <button type="button" className="btn btn-quiet" onClick={() => setTracks((list) => list.filter((x) => x.id !== t.id))} aria-label={`Retirer la piste ${n}`}>
                    Retirer
                  </button>
                </div>
                <div className="track-controls">
                  {t.instrument !== "drums" && <Stepper value={t.octave} onChange={(octave) => patchTrack(t.id, { octave })} label={`Octave de la piste ${n}`} />}
                  <Volume value={t.volume} onChange={(volume) => patchTrack(t.id, { volume })} label={`Volume de la piste ${n}`} />
                </div>
              </li>
            );
          })}
        </ol>

        <div className="actions">
          <button type="button" className="btn" onClick={addTrack} disabled={tracks.length >= MAX_TRACKS}>
            Ajouter une piste
          </button>
          {tracks.length >= MAX_TRACKS && <p className="note">Cinq pistes au maximum.</p>}
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-sub">Mélodie</h2>
        <div className="seg seg-wrap" role="group" aria-label="Mélodie">
          {MELODY_MODES.map(([mode, name]) => (
            <button key={mode} type="button" className={`seg-btn ${melody.mode === mode ? "is-on" : ""}`} aria-pressed={melody.mode === mode} onClick={() => patchMelody({ mode })}>
              {name}
            </button>
          ))}
        </div>

        {melody.mode === "auto" && (
          <>
            <p className="melody-text" aria-label="Mélodie générée">
              {generatedText || "Écrivez d'abord des accords."}
            </p>
            <div className="actions">
              <button type="button" className="btn" onClick={() => patchMelody({ seed: melody.seed + 1 })} disabled={!generatedText}>
                Autre mélodie
              </button>
              <button type="button" className="btn" onClick={() => patchMelody({ mode: "manual", text: generatedText })} disabled={!generatedText}>
                Modifier cette mélodie
              </button>
            </div>
          </>
        )}

        {melody.mode === "manual" && (
          <>
            <label className="field">
              <span>Vos notes</span>
              <textarea
                className="input input-chords"
                rows={3}
                value={melody.text}
                onChange={(e) => patchMelody({ text: e.target.value })}
                placeholder="mi sol la.sol mi | do - ré -"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>
            {melodyErrors.length > 0 && (
              <p className="alert" role="alert">
                {melodyErrors.length === 1 ? "Note non reconnue" : "Notes non reconnues"} : {melodyErrors.join(", ")}.
              </p>
            )}
            <p className="note">
              Un mot par temps : <code>do ré mi fa sol la si</code>, ou <code>C D E</code>, ou le solfa <code>d r m f s l t</code>{" "}
              (ici, do = {pcName(doPc, naming)}). <code>-</code> prolonge la note, <code>_</code> est un silence,{" "}
              <code>do.ré</code> met deux notes dans un temps, <code>&apos;</code> monte d&apos;une octave et <code>,</code>{" "}
              descend. Une mélodie plus courte que les accords se répète.
            </p>
          </>
        )}

        {melody.mode !== "none" && transpose !== 0 && (
          <p className="note">
            La mélodie reste écrite dans la tonalité d&apos;origine : à l&apos;écoute, elle est décalée de {transpose > 0 ? "+" : "−"}
            {Math.abs(transpose)} demi-ton{Math.abs(transpose) > 1 ? "s" : ""}, comme les accords.
          </p>
        )}

        {melody.mode !== "none" && (
          <div className="track-controls">
            <Select<InstrumentId> value={melody.instrument} label="Instrument de la mélodie" options={INSTRUMENT_OPTIONS} onChange={(instrument) => patchMelody({ instrument })} />
            <Stepper value={melody.octave} onChange={(octave) => patchMelody({ octave })} label="Octave de la mélodie" />
            <Volume value={melody.volume} onChange={(volume) => patchMelody({ volume })} label="Volume de la mélodie" />
          </div>
        )}
      </section>

      <p className="note">
        Les instruments sont imités par calcul sur cet appareil : ils donnent la couleur d&apos;un piano, d&apos;une guitare
        ou d&apos;un saxophone, sans être des enregistrements de vrais instruments. La lecture tourne en boucle, et tout
        changement s&apos;entend aussitôt.
      </p>
    </>
  );
}
