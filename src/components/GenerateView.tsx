"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME } from "@/lib/app";
import { LivePlayer } from "@/lib/audio/livePlayer";
import { StemRenderer } from "@/lib/audio/stemClient";
import { keyLabel, pcName, type NoteNaming } from "@/lib/audio/notes";
import {
  chordLengths,
  defaultStyle,
  encodeWav,
  heardChords,
  MAX_TRACKS,
  MAX_TRANSPOSE,
  MAX_VOICES,
  mixStems,
  parseProgression,
  stemsScale,
  stylesFor,
  withChordBeats,
  type MelodyMode,
  type MelodyOptions,
  type ParsedChord,
  type SongOptions,
  type SongStems,
  type Track,
  type TrackInstrument,
  type VoiceOptions,
} from "@/lib/audio/synth";
import { chordsKey, generateMelody, MELODY_BASE, melodyToText, parseMelody, solfaDoOf } from "@/lib/audio/tune";
import { INSTRUMENTS, type InstrumentId } from "@/lib/audio/voices";
import { beatsText, ChordChip, clock, MuteButton, OctaveStepper, Stepper, Volume } from "./GenerateParts";
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
  muted: boolean;
}

/** Une partie du morceau (couplet, refrain…) : ses accords et son nombre de passages. */
interface SectionState {
  id: number;
  text: string;
  repeat: number;
}

/** Une voix qui accompagne la mélodie (2ᵉ voix, 3ᵉ voix…). */
interface VoiceState extends VoiceOptions {
  id: number;
  muted: boolean;
}

const MAX_SECTIONS = 8;
const MAX_SECTION_REPEAT = 16;
const MAX_PLAYS = 99;

// Ordre dans lequel les instruments sont proposés quand on ajoute une piste.
const SUGGESTED: TrackInstrument[] = ["piano", "bass", "drums", "guitar", "strings"];
// Instruments proposés pour les voix suivantes, dans l'ordre.
const VOICE_INSTRUMENTS: InstrumentId[] = ["strings", "sax", "vibes", "trumpet", "epiano", "organ", "nylon", "piano", "guitar"];

const MELODY_MODES: [MelodyMode, string][] = [
  ["none", "Sans mélodie"],
  ["auto", "Selon les accords"],
  ["manual", "Écrite par vous"],
];

const typeLabel = (instrument: TrackInstrument) =>
  instrument === "drums" ? "Rythme" : instrument === "bass" ? "Ligne de basse" : "Type de jeu";

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

// ——— Mesure ———

/** Unité de temps : le chiffre du bas (2 = blanche, 4 = noire, 8 = croche). */
type BeatUnit = 2 | 4 | 8;
const UNITS: [BeatUnit, string][] = [
  [2, "Blanche"],
  [4, "Noire"],
  [8, "Croche"],
];
/** Mesures proposées d'un clic ; « Autre » ouvre le réglage libre. */
const METERS: [number, BeatUnit][] = [
  [2, 4],
  [3, 4],
  [4, 4],
  [6, 8],
  [12, 8],
];
const MAX_BAR = 12;

/** Durée commune des accords : une mesure, une demi-mesure ou deux mesures. */
type ChordSpan = "bar" | "half" | "double";

const ordinal = (n: number) => (n === 1 ? "1ʳᵉ" : `${n}ᵉ`);

/** Identifiant de la voie de lecture d'une piste ou d'une voix. */
const trackKey = (id: number) => `t${id}`;
const voiceKey = (id: number) => `v${id}`;
const MELODY_KEY = "m";

interface Recording {
  id: number;
  url: string;
  seconds: number;
}

export default function GenerateView({ naming }: { naming: NoteNaming }) {
  // — Accords : une ou plusieurs parties, chacune répétée
  const [sections, setSections] = useState<SectionState[]>([{ id: 1, text: "C G Am F", repeat: 1 }]);
  const [selected, setSelected] = useState(1);
  const [tempo, setTempo] = useState(100);
  // Mesure : temps par mesure (chiffre du haut) et unité (chiffre du bas).
  const [bar, setBar] = useState(4);
  const [unit, setUnit] = useState<BeatUnit>(4);
  const [customMeter, setCustomMeter] = useState(false);
  const [chordSpan, setChordSpan] = useState<ChordSpan>("bar");
  // La demi-mesure n'existe que pour un nombre pair de temps.
  const span: ChordSpan = chordSpan === "half" && bar % 2 !== 0 ? "bar" : chordSpan;
  const beatsPerChord = span === "half" ? bar / 2 : span === "double" ? bar * 2 : bar;
  const [transpose, setTranspose] = useState(0);
  // Lecture en boucle, ou un nombre de fois.
  const [loop, setLoop] = useState(true);
  const [plays, setPlays] = useState(2);
  const repeat = loop ? null : plays;

  // — Pistes et voix
  const [tracks, setTracks] = useState<TrackState[]>([{ id: 1, instrument: "piano", style: "pop", octave: 0, volume: 1, muted: false }]);
  const [melody, setMelody] = useState<MelodyOptions>({ mode: "none", text: "", seed: 1, instrument: "flute", octave: 0, volume: 1 });
  const [melodyMuted, setMelodyMuted] = useState(false);
  const [voices, setVoices] = useState<VoiceState[]>([]);

  // — Lecture et enregistrement
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const [pass, setPass] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const nextId = useRef(100);

  // Accords de chaque partie, puis du morceau entier (chaque partie répétée).
  const parsedSections = useMemo(() => sections.map((s) => parseProgression(s.text)), [sections]);
  const { chords, slots } = useMemo(() => {
    const all: ParsedChord[] = [];
    const where: { section: number; chord: number; pass: number }[] = [];
    parsedSections.forEach((parsed, section) => {
      for (let p = 0; p < sections[section].repeat; p++) {
        parsed.chords.forEach((chord, index) => {
          all.push(chord);
          where.push({ section, chord: index, pass: p });
        });
      }
    });
    return { chords: all, slots: where };
  }, [parsedSections, sections]);

  // Durée de chaque accord, en temps.
  const lengths = useMemo(() => chordLengths(chords, beatsPerChord), [chords, beatsPerChord]);
  const totalBeats = lengths.reduce((sum, n) => sum + n, 0);
  // Les accords tels qu'on les entend, une fois la tonalité changée.
  const heard = useMemo(() => heardChords(chords, transpose), [chords, transpose]);
  const key = useMemo(() => (heard.length > 0 ? chordsKey(heard) : null), [heard]);

  // Ce qui change le son lui-même. Volumes et « muet » n'en font pas partie : ils s'appliquent au
  // mélange, sans recalcul. Chaque piste est donc rendue au volume 1.
  const options = useMemo<SongOptions>(
    () => ({
      chords,
      tempo,
      beatsPerChord,
      beatsPerBar: bar,
      transpose,
      tracks: tracks.map(({ instrument, style, octave }) => ({ instrument, style, octave, volume: 1 })),
      melody: { ...melody, volume: 1 },
      voices: voices.map(({ mode, text, instrument, octave }) => ({ mode, text, instrument, octave, volume: 1 })),
    }),
    [chords, tempo, beatsPerChord, bar, transpose, tracks, melody, voices],
  );
  // Voie de chaque piste rendue, dans l'ordre de renderStems, et son volume (0 = muette).
  const ids = useMemo(
    () => [...tracks.map((t) => trackKey(t.id)), ...(melody.mode !== "none" ? [MELODY_KEY] : []), ...voices.map((v) => voiceKey(v.id))],
    [tracks, melody.mode, voices],
  );
  const volumes = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of tracks) map[trackKey(t.id)] = t.muted ? 0 : t.volume;
    map[MELODY_KEY] = melodyMuted ? 0 : melody.volume;
    for (const v of voices) map[voiceKey(v.id)] = v.muted ? 0 : v.volume;
    return map;
  }, [tracks, melody.volume, melodyMuted, voices]);

  const audible = tracks.length > 0 || melody.mode !== "none" || voices.length > 0;
  const ready = chords.length > 0 && audible;

  // — Mélodie
  const melodyBase = MELODY_BASE + 12 * melody.octave;
  const generatedText = useMemo(
    () => (melody.mode === "auto" ? melodyToText(generateMelody(chords, lengths, melody.seed, melodyBase), totalBeats, naming, melodyBase, bar) : ""),
    [melody.mode, melody.seed, chords, lengths, totalBeats, naming, melodyBase, bar],
  );
  const doPc = useMemo(() => solfaDoOf(chords), [chords]);
  const melodyErrors = useMemo(
    () => (melody.mode === "manual" ? parseMelody(melody.text, doPc, melodyBase).errors : []),
    [melody.mode, melody.text, doPc, melodyBase],
  );
  const patchMelody = (patch: Partial<MelodyOptions>) => setMelody((m) => ({ ...m, ...patch }));

  // — Parties
  const patchSection = (id: number, patch: Partial<SectionState>) => setSections((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const addSection = () => {
    const id = nextId.current++;
    setSections((list) => (list.length >= MAX_SECTIONS ? list : [...list, { id, text: "", repeat: 1 }]));
    setSelected(id);
  };
  const removeSection = (id: number) => {
    setSections((list) => {
      const rest = list.filter((s) => s.id !== id);
      if (selected === id && rest.length > 0) setSelected(rest[0].id);
      return rest;
    });
  };
  const selectedIndex = Math.max(0, sections.findIndex((s) => s.id === selected));

  // — Pistes
  const patchTrack = (id: number, patch: Partial<TrackState>) => setTracks((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const addTrack = () => {
    setTracks((list) => {
      if (list.length >= MAX_TRACKS) return list;
      const instrument = SUGGESTED.find((s) => !list.some((t) => t.instrument === s)) ?? "piano";
      return [...list, { id: nextId.current++, instrument, style: defaultStyle(instrument), octave: 0, volume: 1, muted: false }];
    });
  };

  // — Voix
  const patchVoice = (id: number, patch: Partial<VoiceState>) => setVoices((list) => list.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const addVoice = () => {
    setVoices((list) => {
      if (list.length >= MAX_VOICES - 1) return list;
      const instrument = VOICE_INSTRUMENTS.find((i) => i !== melody.instrument && !list.some((v) => v.instrument === i)) ?? "strings";
      return [...list, { id: nextId.current++, mode: "harmony", text: "", instrument, octave: 0, volume: 0.8, muted: false }];
    });
  };

  // — Lecture
  const ctxRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<LivePlayer | null>(null);
  const rafRef = useRef(0);
  // Dernier rendu, et les réglages dont il vient : un réglage de son modifié pendant la lecture
  // relance le calcul, puis le nouveau rendu prend le relais sans recommencer le morceau.
  const stemsRef = useRef<{ stems: SongStems; options: SongOptions } | null>(null);
  const live = useRef({ options, ids, volumes, repeat });
  live.current = { options, ids, volumes, repeat };
  /** Réglages du rendu en cours de lecture : rien à recalculer s'ils n'ont pas changé. */
  const playedRef = useRef<SongOptions | null>(null);

  // Calcul des pistes hors de la page, en parallèle ; une piste inchangée n'est pas recalculée.
  const rendererRef = useRef<StemRenderer | null>(null);
  const render = useCallback(async (opts: SongOptions) => {
    const cached = stemsRef.current;
    if (cached && cached.options === opts) return cached.stems;
    const renderer = (rendererRef.current ??= new StemRenderer());
    const stems = await renderer.render(opts, ctxRef.current?.sampleRate ?? 44100);
    stemsRef.current = { stems, options: opts };
    return stems;
  }, []);
  /** Numéro de la dernière demande de calcul pendant la lecture : un résultat dépassé est ignoré. */
  const updates = useRef(0);

  const finishRecording = useCallback(async () => {
    const player = playerRef.current;
    if (!player?.recording) return;
    setRecordingSince(null);
    const result = await player.stopRecording();
    if (!result || result.samples.length === 0) return;
    const url = URL.createObjectURL(new Blob([encodeWav(result.samples, result.sampleRate)], { type: "audio/wav" }));
    const id = nextId.current++;
    setRecordings((list) => [...list, { id, url, seconds: result.samples.length / result.sampleRate }]);
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    playerRef.current?.stop();
    void finishRecording();
    setPlaying(false);
    setActive(-1);
    setPass(0);
  }, [finishRecording]);

  const start = useCallback(async () => {
    const { options: opts } = live.current;
    if (opts.chords.length === 0) return;
    setError(null);
    try {
      // Le contexte audio doit être ouvert pendant le clic, avant tout calcul.
      const ctx = (ctxRef.current ??= new AudioContext());
      void ctx.resume();
      const player = (playerRef.current ??= new LivePlayer(ctx));
      player.onEnded = () => {
        cancelAnimationFrame(rafRef.current);
        void finishRecording();
        setPlaying(false);
        setActive(-1);
        setPass(0);
      };
      setBusy(true);
      const lanesAtStart = live.current.ids;
      const stems = await render(opts);
      // Les réglages ont changé pendant le calcul : on part sur ce rendu, la mise à jour suivra.
      const { volumes: levels, repeat: times } = live.current;
      const lanes = lanesAtStart;
      player.play(stems, lanes, levels, times);
      playedRef.current = opts;
      setPlaying(true);
      const tick = () => {
        const position = player.position();
        if (!position) return;
        // Accord en cours : le dernier dont le début est passé (les accords n'ont pas tous la même durée).
        const starts = player.chordStarts;
        let index = 0;
        while (index + 1 < starts.length && starts[index + 1] <= position.offset) index++;
        setActive(index);
        setPass(position.pass);
        rafRef.current = requestAnimationFrame(tick);
      };
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      stop();
      setError("Le son n'a pas pu démarrer sur cet appareil. Réessayez.");
    } finally {
      setBusy(false);
    }
  }, [finishRecording, render, stop]);

  // Un réglage du son change pendant la lecture : nouveau calcul, puis relais au même temps de la
  // mesure — la musique continue, elle ne recommence pas.
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(async () => {
      const player = playerRef.current;
      if (!player?.playing) return;
      const { options: opts, ids: lanes } = live.current;
      if (opts.chords.length === 0 || opts === playedRef.current) return;
      const ticket = ++updates.current;
      try {
        const stems = await render(opts);
        // Une demande plus récente est partie entre-temps, ou la lecture s'est arrêtée.
        if (ticket !== updates.current || !player.playing) return;
        player.update(stems, lanes);
        playedRef.current = opts;
      } catch {
        // Calcul interrompu (écran quitté) : rien à faire.
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [options, playing, render]);

  // Volume et « muet » : appliqués aussitôt.
  useEffect(() => {
    playerRef.current?.setVolumes(volumes);
  }, [volumes]);

  useEffect(() => {
    playerRef.current?.setRepeat(repeat);
  }, [repeat]);

  // Chronomètre de l'enregistrement.
  useEffect(() => {
    if (recordingSince === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [recordingSince]);

  // En quittant l'écran : tout s'arrête, les enregistrements non téléchargés sont libérés.
  const recordingsRef = useRef(recordings);
  recordingsRef.current = recordings;
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      playerRef.current?.stop();
      void ctxRef.current?.close();
      ctxRef.current = null;
      playerRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      for (const r of recordingsRef.current) URL.revokeObjectURL(r.url);
    },
    [],
  );

  const record = async () => {
    setError(null);
    try {
      if (!playerRef.current?.playing) await start();
      const player = playerRef.current;
      if (!player?.playing) return;
      await player.startRecording();
      setRecordingSince(Date.now());
    } catch {
      setError("L'enregistrement n'a pas pu démarrer sur cet appareil.");
    }
  };

  const fileName = (suffix: string) => {
    const name = chords
      .slice(0, 6)
      .map((c) => c.label.replace("♯", "#").replace("♭", "b").replace("/", "-"))
      .join("-");
    return `${APP_NAME.toLowerCase()}-${name || "morceau"}${suffix}.wav`;
  };

  const save = (url: string, name: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
  };

  // Le morceau tel qu'on l'entend (volumes, pistes muettes), une fois — ou autant de fois que demandé.
  const download = async () => {
    const stems = await render(live.current.options);
    const gains = live.current.ids.map((id) => live.current.volumes[id] ?? 1);
    const once = mixStems(stems.stems, gains, stemsScale(stems.stems));
    const times = repeat ?? 1;
    const out = new Float32Array(stems.loopLength * (times - 1) + once.length);
    for (let k = 0; k < times; k++) {
      const at = k * stems.loopLength;
      for (let i = 0; i < once.length; i++) out[at + i] += once[i];
    }
    const url = URL.createObjectURL(new Blob([encodeWav(out, stems.sampleRate)], { type: "audio/wav" }));
    save(url, fileName(""));
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const removeRecording = (id: number) => {
    setRecordings((list) => {
      const gone = list.find((r) => r.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return list.filter((r) => r.id !== id);
    });
  };

  const slot = playing && active >= 0 ? slots[active] : undefined;
  const current = slot ? (heard[active] ?? null) : null;
  const tones = current ? current.intervals.map((iv) => (current.root + iv) % 12) : [];
  const glow = new Array<number>(12).fill(0);
  for (const pc of tones) glow[pc] = 1;
  const recordingFor = recordingSince === null ? 0 : (now - recordingSince) / 1000;

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
          {playing && (sections.length > 1 || repeat !== null) && (
            <div className="readout-where">
              {sections.length > 1 && slot && <span>Partie {slot.section + 1}</span>}
              {repeat !== null && (
                <span>
                  Passage {Math.min(pass + 1, repeat)} / {repeat}
                </span>
              )}
            </div>
          )}
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
        {recordingSince === null ? (
          <button type="button" className="btn btn-rec" onClick={() => void record()} disabled={!ready || busy}>
            <i className="rec-dot" aria-hidden="true" />
            Enregistrer
          </button>
        ) : (
          <button type="button" className="btn btn-rec is-on" onClick={() => void finishRecording()}>
            <i className="rec-dot" aria-hidden="true" />
            Arrêter l&apos;enregistrement · <span className="rec-time">{clock(recordingFor)}</span>
          </button>
        )}
        <button type="button" className="btn" onClick={() => void download()} disabled={!ready}>
          Télécharger le son (WAV)
        </button>
        {chords.length > 0 && !audible && <p className="note">Ajoutez une piste ou une mélodie pour entendre quelque chose.</p>}
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {recordings.length > 0 && (
        <section className="panel" aria-label="Enregistrements">
          <div className="panel-head">
            <h2 className="panel-sub">Enregistrements</h2>
            <span className="note">Gardés jusqu&apos;à la fermeture de la page : téléchargez ceux à conserver.</span>
          </div>
          <ol className="recordings">
            {recordings.map((r, index) => (
              <li key={r.id} className="recording">
                <span className="recording-name">
                  Enregistrement {index + 1} <small>· {clock(r.seconds)}</small>
                </span>
                <audio controls preload="metadata" src={r.url} />
                <div className="actions">
                  <button type="button" className="btn" onClick={() => save(r.url, fileName(`-enregistrement-${index + 1}`))}>
                    Télécharger (WAV)
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={() => removeRecording(r.id)} aria-label={`Supprimer l'enregistrement ${index + 1}`}>
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="panel">
        <h2 className="panel-sub">Accords</h2>
        <ol className="sections">
          {sections.map((section, index) => {
            const parsed = parsedSections[index];
            const sectionHeard = heardChords(parsed.chords, transpose);
            const sectionLengths = chordLengths(parsed.chords, beatsPerChord);
            const name = `Partie ${index + 1}`;
            return (
              <li key={section.id} className="section" data-selected={(sections.length > 1 && section.id === selected) || undefined} data-playing={(slot && slot.section === index) || undefined}>
                {sections.length > 1 && (
                  <div className="section-head">
                    <span className="section-name">{name}</span>
                    <Stepper
                      value={section.repeat}
                      onChange={(value) => patchSection(section.id, { repeat: value })}
                      label={`Passages de la ${name.toLowerCase()}`}
                      min={1}
                      max={MAX_SECTION_REPEAT}
                      format={(v) => `× ${v}`}
                      lessLabel={`Une fois de moins : ${name}`}
                      moreLabel={`Une fois de plus : ${name}`}
                    />
                    <button type="button" className="btn btn-quiet" onClick={() => removeSection(section.id)} aria-label={`Retirer la ${name.toLowerCase()}`}>
                      Retirer
                    </button>
                  </div>
                )}
                <label className="field">
                  <span className="sr-only">{sections.length > 1 ? `Accords de la ${name.toLowerCase()}` : "Vos accords"}</span>
                  <input
                    className="input input-chords"
                    value={section.text}
                    onChange={(e) => patchSection(section.id, { text: e.target.value })}
                    onFocus={() => setSelected(section.id)}
                    placeholder={index === 0 ? "C G Am F" : "Am Dm G C"}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    autoComplete="off"
                  />
                </label>
                {parsed.errors.length > 0 && (
                  <p className="alert" role="alert">
                    {parsed.errors.length === 1 ? "Accord non reconnu" : "Accords non reconnus"} : {parsed.errors.join(", ")}. Ils
                    sont laissés de côté.
                  </p>
                )}
                {parsed.chords.length > 0 && (
                  <ol className="prog" aria-label={sections.length > 1 ? `Accords de la ${name.toLowerCase()}` : "Suite d'accords"}>
                    {sectionHeard.map((chord, i) => (
                      <ChordChip
                        key={i}
                        label={chord.label}
                        beats={sectionLengths[i]}
                        custom={chord.beats !== undefined}
                        common={beatsPerChord}
                        active={Boolean(slot && slot.section === index && slot.chord === i)}
                        onBeats={(beats) =>
                          setSections((list) => list.map((s) => (s.id === section.id ? { ...s, text: withChordBeats(s.text, parseProgression(s.text).spans[i], beats) } : s)))
                        }
                      />
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ol>
        <p className="note">
          Séparez les accords par un espace : <code>C G Am F</code> ou <code>Do Sol Lam Fa</code>. Dièse <code>#</code>, bémol{" "}
          <code>b</code>, <code>%</code> pour répéter l&apos;accord précédent, et <code>:2</code> après un accord pour lui
          donner 2 temps (<code>G:2</code>) — ou touchez un accord.
        </p>
        <div className="chips" role="group" aria-label={sections.length > 1 ? `Exemples pour la partie ${selectedIndex + 1}` : "Exemples"}>
          {PRESETS.map(([name, value]) => (
            <button key={name} type="button" className="chip chip-btn" onClick={() => patchSection(sections[selectedIndex].id, { text: value })}>
              {name}
            </button>
          ))}
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={addSection} disabled={sections.length >= MAX_SECTIONS}>
            Ajouter une partie
          </button>
          <span className="note">
            {sections.length > 1
              ? `Le morceau enchaîne les ${sections.length} parties, chacune autant de fois que demandé.`
              : "Une 2ᵉ partie (refrain, pont…) a ses propres accords et son nombre de passages."}
          </span>
        </div>

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
            <span className="label" id="meter-label">
              Mesure<span className="sr-only"> : {beatsText(bar)} par mesure</span>
            </span>
            <div className="option-row">
              {/* La mesure en cours, écrite comme sur une partition : le nombre de temps sur l'unité. */}
              <span className="meter-sign" aria-hidden="true">
                <b>{bar}</b>
                <b>{unit}</b>
              </span>
              <div className="seg seg-wrap" role="group" aria-labelledby="meter-label">
                {METERS.map(([b, u]) => {
                  const on = !customMeter && bar === b && unit === u;
                  return (
                    <button
                      key={`${b}/${u}`}
                      type="button"
                      className={`seg-btn ${on ? "is-on" : ""}`}
                      aria-pressed={on}
                      onClick={() => {
                        setBar(b);
                        setUnit(u);
                        setCustomMeter(false);
                      }}
                    >
                      {b}/{u}
                    </button>
                  );
                })}
                <button type="button" className={`seg-btn ${customMeter ? "is-on" : ""}`} aria-pressed={customMeter} onClick={() => setCustomMeter(true)}>
                  Autre
                </button>
              </div>
            </div>
            {customMeter && (
              <div className="option-row meter-custom">
                <Stepper value={bar} onChange={setBar} label="Temps par mesure" min={1} max={MAX_BAR} format={beatsText} lessLabel="Un temps de moins" moreLabel="Un temps de plus" />
                <div className="seg" role="group" aria-label="Unité de temps">
                  {UNITS.map(([u, name]) => (
                    <button key={u} type="button" className={`seg-btn ${unit === u ? "is-on" : ""}`} aria-pressed={unit === u} onClick={() => setUnit(u)} title={name}>
                      {name} <small>/{u}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="option">
            <span className="label">Durée commune d&apos;un accord</span>
            <div className="seg seg-wrap" role="group" aria-label="Durée commune d'un accord">
              {(
                [
                  ["bar", `Une mesure · ${beatsText(bar)}`],
                  ...(bar % 2 === 0 && bar > 1 ? ([["half", `Demi-mesure · ${beatsText(bar / 2)}`]] as const) : []),
                  ["double", `Deux mesures · ${beatsText(bar * 2)}`],
                ] as [ChordSpan, string][]
              ).map(([value, name]) => (
                <button key={value} type="button" className={`seg-btn ${span === value ? "is-on" : ""}`} aria-pressed={span === value} onClick={() => setChordSpan(value)}>
                  {name}
                </button>
              ))}
            </div>
            <p className="note">Un accord touché dans la suite ci-dessus peut avoir sa propre durée.</p>
          </div>
          <div className="option">
            <span className="label">Lecture</span>
            <div className="option-row">
              <div className="seg" role="group" aria-label="Lecture">
                <button type="button" className={`seg-btn ${loop ? "is-on" : ""}`} aria-pressed={loop} onClick={() => setLoop(true)}>
                  En boucle
                </button>
                <button type="button" className={`seg-btn ${!loop ? "is-on" : ""}`} aria-pressed={!loop} onClick={() => setLoop(false)}>
                  Nombre de fois
                </button>
              </div>
              {!loop && (
                <Stepper
                  value={plays}
                  onChange={setPlays}
                  label="Nombre de passages du morceau"
                  min={1}
                  max={MAX_PLAYS}
                  format={(v) => `${v} fois`}
                  lessLabel="Une fois de moins"
                  moreLabel="Une fois de plus"
                />
              )}
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
              <li key={t.id} className="track" data-muted={t.muted || undefined}>
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
                  <MuteButton muted={t.muted} onToggle={() => patchTrack(t.id, { muted: !t.muted })} name={`piste ${n}`} />
                  <button type="button" className="btn btn-quiet" onClick={() => setTracks((list) => list.filter((x) => x.id !== t.id))} aria-label={`Retirer la piste ${n}`}>
                    Retirer
                  </button>
                </div>
                <div className="track-controls">
                  {t.instrument !== "drums" && <OctaveStepper value={t.octave} onChange={(octave) => patchTrack(t.id, { octave })} label={`Octave de la piste ${n}`} />}
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
              ou <code>do re mi fa so la ti</code> (ici, do = {pcName(doPc, naming)} ; dièses <code>di ri fi si li</code>, bémols{" "}
              <code>ra me se le te</code>). <code>-</code> prolonge la note, <code>_</code> est un silence,{" "}
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
          <>
            <div className="track-controls" data-muted={melodyMuted || undefined}>
              <Select<InstrumentId> value={melody.instrument} label="Instrument de la mélodie" options={INSTRUMENT_OPTIONS} onChange={(instrument) => patchMelody({ instrument })} />
              <OctaveStepper value={melody.octave} onChange={(octave) => patchMelody({ octave })} label="Octave de la mélodie" />
              <Volume value={melody.volume} onChange={(volume) => patchMelody({ volume })} label="Volume de la mélodie" />
              <MuteButton muted={melodyMuted} onToggle={() => setMelodyMuted((m) => !m)} name="mélodie" />
            </div>

            <h3 className="panel-sub voices-title">Voix d&apos;accompagnement</h3>
            {voices.length === 0 && (
              <p className="note">
                Ajoutez une 2ᵉ voix, une 3ᵉ voix… (jusqu&apos;à {MAX_VOICES} voix en tout) : en harmonie sous la voix précédente,
                comme une chorale, ou écrites par vous.
              </p>
            )}
            <ol className="tracks">
              {voices.map((v, index) => {
                const n = index + 2;
                const name = `${ordinal(n)} voix`;
                // Même écriture que la mélodie : les notes non reconnues sont signalées.
                const voiceErrors = v.mode === "manual" ? parseMelody(v.text, doPc, MELODY_BASE + 12 * v.octave).errors : [];
                return (
                  <li key={v.id} className="track" data-muted={v.muted || undefined}>
                    <div className="track-head">
                      <span className="track-num" aria-hidden="true">
                        {n}
                      </span>
                      <span className="voice-name">{name}</span>
                      <div className="seg" role="group" aria-label={`Notes de la ${name}`}>
                        <button type="button" className={`seg-btn ${v.mode === "harmony" ? "is-on" : ""}`} aria-pressed={v.mode === "harmony"} onClick={() => patchVoice(v.id, { mode: "harmony" })}>
                          En harmonie
                        </button>
                        <button type="button" className={`seg-btn ${v.mode === "manual" ? "is-on" : ""}`} aria-pressed={v.mode === "manual"} onClick={() => patchVoice(v.id, { mode: "manual" })}>
                          Écrite
                        </button>
                      </div>
                      <MuteButton muted={v.muted} onToggle={() => patchVoice(v.id, { muted: !v.muted })} name={name} />
                      <button type="button" className="btn btn-quiet" onClick={() => setVoices((list) => list.filter((x) => x.id !== v.id))} aria-label={`Retirer la ${name}`}>
                        Retirer
                      </button>
                    </div>
                    {v.mode === "harmony" ? (
                      <p className="note">Sous chaque note de la {ordinal(n - 1)} voix, une note de l&apos;accord, d&apos;une tierce à une sixte plus bas.</p>
                    ) : (
                      <label className="field">
                        <span className="sr-only">Notes de la {name}</span>
                        <textarea
                          className="input input-chords"
                          rows={2}
                          value={v.text}
                          onChange={(e) => patchVoice(v.id, { text: e.target.value })}
                          placeholder="do - mi - | sol - - -"
                          spellCheck={false}
                          autoCapitalize="off"
                          autoCorrect="off"
                        />
                      </label>
                    )}
                    {voiceErrors.length > 0 && (
                      <p className="alert" role="alert">
                        {voiceErrors.length === 1 ? "Note non reconnue" : "Notes non reconnues"} : {voiceErrors.join(", ")}.
                      </p>
                    )}
                    {v.mode === "manual" && <p className="note">Même écriture que la mélodie, avec le même do ({pcName(doPc, naming)}).</p>}
                    <div className="track-controls">
                      <Select<InstrumentId> value={v.instrument} label={`Instrument de la ${name}`} options={INSTRUMENT_OPTIONS} onChange={(instrument) => patchVoice(v.id, { instrument })} />
                      <OctaveStepper value={v.octave} onChange={(octave) => patchVoice(v.id, { octave })} label={`Octave de la ${name}`} />
                      <Volume value={v.volume} onChange={(volume) => patchVoice(v.id, { volume })} label={`Volume de la ${name}`} />
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="actions">
              <button type="button" className="btn" onClick={addVoice} disabled={voices.length >= MAX_VOICES - 1}>
                Ajouter une voix
              </button>
              {voices.length >= MAX_VOICES - 1 && <p className="note">{MAX_VOICES} voix au maximum.</p>}
            </div>
          </>
        )}
      </section>

      <p className="note">
        Les instruments sont imités par calcul sur cet appareil : ils donnent la couleur d&apos;un piano, d&apos;une guitare
        ou d&apos;un saxophone, sans être des enregistrements de vrais instruments. Pendant l&apos;écoute, tout changement
        s&apos;entend aussitôt, sans que le morceau recommence.
      </p>
    </>
  );
}
