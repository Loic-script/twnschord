"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { nameChord } from "@/lib/audio/chords";
import { pcName, type NoteNaming } from "@/lib/audio/notes";
import { INSTRUMENTS, PROFILES, renderNoteSample, type InstrumentId } from "@/lib/audio/voices";
import { ChordText, NoteText } from "./NoteText";
import { Select } from "./Select";

const WHITE = [0, 2, 4, 5, 7, 9, 11];
// [demi-ton dans l'octave, rang de la touche blanche à droite de laquelle elle se place]
const BLACK: [number, number][] = [
  [1, 1],
  [3, 2],
  [6, 4],
  [8, 5],
  [10, 6],
];

// Touches de l'ordinateur, repérées par leur position (identique en AZERTY et en QWERTY) :
// la rangée du milieu pour les touches blanches, celle du dessus pour les noires.
const KEY_CODES = ["KeyA", "KeyW", "KeyS", "KeyE", "KeyD", "KeyF", "KeyT", "KeyG", "KeyY", "KeyH", "KeyU", "KeyJ", "KeyK"];

const INSTRUMENT_OPTIONS = INSTRUMENTS.map(({ id, name }) => ({ value: id, label: name }));

const MIN_OCTAVE = 1;
const MAX_OCTAVE = 6;
const SAMPLE_RATE = 44100;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export default function PianoView({ naming }: { naming: NoteNaming }) {
  const [instrument, setInstrument] = useState<InstrumentId>("piano");
  /** Numéro de l'octave la plus grave affichée (3 → le clavier commence à Do 3). */
  const [octave, setOctave] = useState(3);
  const [pedal, setPedal] = useState(false);
  const [wide, setWide] = useState(true);
  const [held, setHeld] = useState<number[]>([]);
  /** Le son est ouvert (il ne peut l'être qu'après un premier geste de l'utilisateur). */
  const [ready, setReady] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const outRef = useRef<AudioNode | null>(null);
  const buffers = useRef(new Map<string, AudioBuffer>());
  const voices = useRef(new Map<number, Voice>());
  const pointers = useRef(new Map<number, number>());
  const pedalRef = useRef(pedal);
  const instrumentRef = useRef(instrument);

  // Deux octaves sur un écran large, une seule sur téléphone pour garder des touches jouables.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 620px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const octaves = wide ? 2 : 1;
  const first = 12 * (octave + 1);
  const sustained = PROFILES[instrument].engine === "blown";

  const audio = useCallback(() => {
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      // Un compresseur évite la saturation quand plusieurs notes sonnent ensemble.
      const compressor = ctx.createDynamicsCompressor();
      const master = ctx.createGain();
      master.gain.value = 0.7;
      compressor.connect(master).connect(ctx.destination);
      ctxRef.current = ctx;
      outRef.current = compressor;
      setReady(true);
    }
    void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const bufferFor = useCallback((ctx: AudioContext, id: InstrumentId, midi: number) => {
    const key = `${id}:${midi}`;
    let buffer = buffers.current.get(key);
    if (!buffer) {
      const samples = renderNoteSample(id, midi, SAMPLE_RATE);
      buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
      buffer.getChannelData(0).set(samples);
      buffers.current.set(key, buffer);
    }
    return buffer;
  }, []);

  const silence = useCallback((midi: number, fade: number) => {
    const voice = voices.current.get(midi);
    if (!voice || !ctxRef.current) return;
    voices.current.delete(midi);
    const t = ctxRef.current.currentTime;
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
    voice.gain.gain.linearRampToValueAtTime(0, t + fade);
    voice.source.stop(t + fade + 0.02);
  }, []);

  const noteOn = useCallback(
    (midi: number) => {
      const ctx = audio();
      silence(midi, 0.02);
      const source = ctx.createBufferSource();
      source.buffer = bufferFor(ctx, instrumentRef.current, midi);
      const gain = ctx.createGain();
      source.connect(gain).connect(outRef.current ?? ctx.destination);
      source.start();
      const voice = { source, gain };
      source.onended = () => {
        if (voices.current.get(midi) === voice) voices.current.delete(midi);
      };
      voices.current.set(midi, voice);
      setHeld((list) => (list.includes(midi) ? list : [...list, midi]));
    },
    [audio, bufferFor, silence],
  );

  const noteOff = useCallback(
    (midi: number) => {
      setHeld((list) => list.filter((m) => m !== midi));
      // Pédale enfoncée : la note continue de résonner après le relâchement de la touche.
      if (!pedalRef.current) silence(midi, 0.14);
    },
    [silence],
  );

  useEffect(() => {
    pedalRef.current = pedal;
    // Pédale relâchée : tout ce qui ne correspond plus à une touche enfoncée s'éteint.
    if (!pedal) for (const midi of [...voices.current.keys()]) if (!held.includes(midi)) silence(midi, 0.2);
  }, [pedal, held, silence]);

  useEffect(() => {
    instrumentRef.current = instrument;
  }, [instrument]);

  // Les notes visibles sont préparées en arrière-plan, pour qu'aucune ne tarde au premier appui.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    let midi = first;
    let timer = 0;
    const prepare = () => {
      bufferFor(ctx, instrument, midi);
      if (++midi <= first + 12 * octaves) timer = window.setTimeout(prepare, 15);
    };
    timer = window.setTimeout(prepare, 60);
    return () => window.clearTimeout(timer);
  }, [ready, instrument, first, octaves, bufferFor]);

  // Clavier de l'ordinateur.
  useEffect(() => {
    const noteFor = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return -1;
      if (event.ctrlKey || event.metaKey || event.altKey) return -1;
      const index = KEY_CODES.indexOf(event.code);
      return index < 0 ? -1 : first + index;
    };
    const down = (event: KeyboardEvent) => {
      const midi = noteFor(event);
      if (midi < 0) return;
      event.preventDefault();
      if (!event.repeat) noteOn(midi);
    };
    const up = (event: KeyboardEvent) => {
      const midi = noteFor(event);
      if (midi >= 0) noteOff(midi);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [first, noteOn, noteOff]);

  // En quittant l'écran, tout s'arrête.
  useEffect(
    () => () => {
      void ctxRef.current?.close();
      ctxRef.current = null;
    },
    [],
  );

  // — Doigt ou souris : plusieurs doigts à la fois, et glissé d'une touche à l'autre.
  const keyAt = (x: number, y: number) => {
    const key = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-midi]");
    return key ? Number(key.dataset.midi) : -1;
  };
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const midi = keyAt(event.clientX, event.clientY);
    pointers.current.set(event.pointerId, midi);
    if (midi >= 0) noteOn(midi);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = pointers.current.get(event.pointerId);
    if (current === undefined) return;
    const midi = keyAt(event.clientX, event.clientY);
    if (midi === current) return;
    if (current >= 0) noteOff(current);
    if (midi >= 0) noteOn(midi);
    pointers.current.set(event.pointerId, midi);
  };
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    if (current !== undefined && current >= 0) noteOff(current);
  };

  const sorted = useMemo(() => [...held].sort((a, b) => a - b), [held]);
  const chord = useMemo(() => nameChord(sorted), [sorted]);
  const last = first + 12 * octaves - 1;
  const rangeText = `${pcName(0, naming)} ${octave} – ${pcName(11, naming)} ${octave + octaves - 1}`;

  return (
    <>
      <section className="stage" aria-label="Piano">
        <div className="stage-head piano-head">
          <Select<InstrumentId> value={instrument} label="Instrument" options={INSTRUMENT_OPTIONS} onChange={setInstrument} />
          <div className="stepper stepper-dark" role="group" aria-label="Octave du clavier">
            <button type="button" onClick={() => setOctave((o) => o - 1)} disabled={octave <= MIN_OCTAVE} aria-label="Octave plus grave">
              ◂
            </button>
            <output>{rangeText}</output>
            <button type="button" onClick={() => setOctave((o) => o + 1)} disabled={octave + octaves - 1 >= MAX_OCTAVE} aria-label="Octave plus aiguë">
              ▸
            </button>
          </div>
          <label className="check check-dark">
            <input type="checkbox" checked={pedal} onChange={(e) => setPedal(e.target.checked)} />
            Pédale
          </label>
        </div>

        <div className="readout piano-readout" aria-live="off">
          {sorted.length === 0 ? (
            <p className="readout-idle">Jouez : le nom des notes et de l&apos;accord s&apos;affiche ici.</p>
          ) : (
            <>
              <div className={`readout-main ${chord ? "is-chord" : ""}`}>{chord ? <ChordText label={chord} /> : <NoteText text={pcName(sorted[sorted.length - 1], naming)} />}</div>
              <div className="readout-sub">{sorted.map((m) => pcName(m, naming)).join(" · ")}</div>
            </>
          )}
        </div>

        <div
          className="piano-keys"
          role="group"
          aria-label={`Clavier de piano, de ${pcName(0, naming)} ${octave} à ${pcName(last, naming)} ${octave + octaves - 1}`}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          {Array.from({ length: octaves }, (_, o) => {
            const base = first + 12 * o;
            return (
              <div key={o} className="piano-octave">
                {WHITE.map((pc) => (
                  <div key={pc} className="pkey pkey-white" data-midi={base + pc} data-on={held.includes(base + pc) || undefined}>
                    <span>
                      <NoteText text={pcName(pc, naming)} />
                      {pc === 0 && <b>{octave + o}</b>}
                    </span>
                  </div>
                ))}
                {BLACK.map(([pc, slot]) => (
                  <div key={pc} className="pkey pkey-black" style={{ left: `${(slot / 7) * 100}%` }} data-midi={base + pc} data-on={held.includes(base + pc) || undefined} />
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <p className="note">
        Jouez au doigt (plusieurs à la fois), à la souris, ou au clavier de l&apos;ordinateur : <code>Q S D F G H J K</code>{" "}
        pour les touches blanches et <code>Z E T Y U</code> pour les noires (sur un clavier QWERTY, les mêmes emplacements :{" "}
        <code>A S D F G H J K</code> et <code>W E T Y U</code>).{" "}
        {sustained
          ? "Cet instrument tient la note tant que la touche est enfoncée."
          : "La pédale laisse résonner les notes après le relâchement des touches."}
      </p>
    </>
  );
}
