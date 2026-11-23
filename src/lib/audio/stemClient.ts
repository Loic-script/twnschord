/**
 * Calcul des pistes du générateur pour la lecture en direct.
 * - Chaque piste est calculée à part, par plusieurs travailleurs en parallèle : la page reste fluide.
 * - Une piste déjà calculée pour les mêmes réglages est reprise telle quelle : changer un instrument
 *   ne recalcule que sa piste.
 * Sans travailleur disponible (très vieux navigateur), le calcul se fait dans la page.
 */
import type { StemRequest, StemResponse } from "./generate.worker";
import { MAX_TRACKS, renderTrackStem, renderVoiceStem, songLayout, voiceNotes, voicesOf, type SongFrame, type SongOptions, type SongStems } from "./synth";

/** Empreinte courte d'un texte (FNV-1a), pour donner à chaque piste un aléa stable. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0 || 1;
}

// Une tâche : la demande faite au travailleur (piste ou voix), sans son numéro, avec sa clé de cache.
type Job = (Omit<Extract<StemRequest, { kind: "track" }>, "id"> | Omit<Extract<StemRequest, { kind: "voice" }>, "id">) & { key: string };

export class StemRenderer {
  private readonly cache = new Map<string, Float32Array>();
  private workers: Worker[] | null = null;
  private broken = false;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (samples: Float32Array) => void; reject: (error: Error) => void }>();
  private turn = 0;

  /** Toutes les pistes du morceau : reprises si déjà calculées, sinon calculées en parallèle. */
  async render(options: SongOptions, sampleRate: number): Promise<SongStems> {
    const frame: SongFrame = {
      chords: options.chords,
      tempo: options.tempo,
      beatsPerChord: options.beatsPerChord,
      beatsPerBar: options.beatsPerBar,
      transpose: options.transpose,
      sampleRate,
    };
    const frameKey = JSON.stringify([
      frame.chords.map((c) => [c.root, c.intervals, c.bass, c.beats ?? null]),
      frame.tempo,
      frame.beatsPerChord,
      frame.beatsPerBar ?? 4,
      frame.transpose ?? 0,
      sampleRate,
    ]);
    const jobs: Job[] = options.tracks.slice(0, MAX_TRACKS).map((track) => {
      const key = frameKey + JSON.stringify(["piste", track.instrument, track.style, track.octave]);
      return { key, kind: "track", frame, track: { ...track, volume: 1 }, seed: hash(key) };
    });
    const lists = voiceNotes(options);
    voicesOf(options).forEach((voice, k) => {
      const notes = lists[k]?.notes ?? [];
      const key = frameKey + JSON.stringify(["voix", voice.instrument, notes.map((n) => [n.at, n.dur, n.midi])]);
      jobs.push({ key, kind: "voice", frame, instrument: voice.instrument, notes, seed: hash(key) });
    });

    const stems = await Promise.all(jobs.map((job) => this.cache.get(job.key) ?? this.compute(job)));
    jobs.forEach((job, k) => this.cache.set(job.key, stems[k]));
    // Ne garder en mémoire que les pistes en cours et quelques versions récentes.
    const keep = new Set(jobs.map((job) => job.key));
    const spare = [...this.cache.keys()].filter((key) => !keep.has(key));
    for (const key of spare.slice(0, Math.max(0, spare.length - jobs.length))) this.cache.delete(key);

    const { length: _length, ...layout } = songLayout(frame);
    return { ...layout, stems };
  }

  dispose(): void {
    this.workers?.forEach((worker) => worker.terminate());
    this.workers = null;
    for (const { reject } of this.pending.values()) reject(new Error("Calcul interrompu"));
    this.pending.clear();
  }

  private async compute(job: Job): Promise<Float32Array> {
    const pool = this.pool();
    if (!pool) return this.inline(job);
    const id = this.nextId++;
    const worker = pool[this.turn++ % pool.length];
    const { key: _key, ...request } = job;
    try {
      return await new Promise<Float32Array>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        worker.postMessage({ ...request, id } as StemRequest);
      });
    } catch (err) {
      // Travailleur en panne : le calcul se fait dans la page (plus lent, mais le son est le même).
      console.warn("[générateur] calcul en arrière-plan indisponible, calcul dans la page :", err instanceof Error ? err.message : err);
      return this.inline(job);
    }
  }

  private inline(job: Job): Float32Array {
    return job.kind === "track" ? renderTrackStem(job.frame, job.track, job.seed) : renderVoiceStem(job.frame, job.instrument, job.notes, job.seed);
  }

  private pool(): Worker[] | null {
    if (this.broken || typeof Worker === "undefined") return null;
    if (this.workers) return this.workers;
    try {
      const size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
      this.workers = Array.from({ length: size }, () => {
        const worker = new Worker(new URL("./generate.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<StemResponse>) => {
          const waiting = this.pending.get(event.data.id);
          if (!waiting) return;
          this.pending.delete(event.data.id);
          if ("samples" in event.data) waiting.resolve(event.data.samples);
          else if (!("error" in event.data)) waiting.reject(new Error("réponse inattendue : " + JSON.stringify(event.data).slice(0, 200)));
          else waiting.reject(new Error(event.data.error));
        };
        worker.onerror = () => {
          // Un travailleur qui ne démarre pas : tout se calcule dans la page désormais.
          this.broken = true;
          for (const { reject } of this.pending.values()) reject(new Error("Travailleur indisponible"));
          this.pending.clear();
        };
        return worker;
      });
      return this.workers;
    } catch {
      this.broken = true;
      return null;
    }
  }
}
