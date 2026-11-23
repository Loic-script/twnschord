/**
 * Lecture en direct du générateur.
 * - Chaque piste (instrument, voix) joue sur sa propre voie : son volume et son « muet » changent
 *   aussitôt, sans recalcul.
 * - Le morceau peut être recalculé pendant la lecture (nouvelle piste, autre instrument, autres
 *   notes…) : le nouveau rendu prend le relais au même temps de la mesure, sans recommencer.
 * - La lecture tourne en boucle, ou s'arrête après un nombre de passages donné.
 * - Le son de sortie — exactement ce que l'on entend — peut être enregistré.
 */
import { foldTail, stemsScale, type SongStems } from "./synth";

interface Layer {
  sources: AudioBufferSourceNode[];
  /** Voie de chaque piste, dans l'ordre des pistes du rendu. */
  gains: GainNode[];
  ids: string[];
  /** Fondu entre deux rendus. */
  bus: GainNode;
}

/** Enchaînement entre l'ancien et le nouveau rendu, en secondes : assez court pour être inaudible. */
const CROSSFADE = 0.04;

// Processeur d'enregistrement : il recopie le son qui le traverse et l'envoie par paquets.
const TAP_SOURCE = `
class TwinsChordTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(16384);
    this.filled = 0;
    this.port.onmessage = (event) => {
      if (event.data !== "flush") return;
      if (this.filled > 0) this.port.postMessage(this.buffer.slice(0, this.filled));
      this.filled = 0;
      this.port.postMessage("done");
    };
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    const frames = channel ? channel.length : 128;
    for (let i = 0; i < frames; i++) {
      this.buffer[this.filled++] = channel ? channel[i] : 0;
      if (this.filled === this.buffer.length) {
        this.port.postMessage(this.buffer.slice());
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor("twinschord-tap", TwinsChordTap);
`;

interface Recorder {
  node: AudioNode;
  chunks: Float32Array[];
  /** Vide ce qui reste dans le processeur, puis rend la main. */
  flush: () => Promise<void>;
}

export class LivePlayer {
  readonly ctx: AudioContext;
  /** Niveau commun : amène le mélange de toutes les pistes à la hauteur habituelle. */
  private readonly master: GainNode;
  /** Coupe le son à la fin du dernier passage (lecture « n fois »). */
  private readonly gate: GainNode;
  /** Empêche toute saturation quand on monte les volumes. */
  private readonly limiter: DynamicsCompressorNode;
  private layer: Layer | null = null;
  private song: SongStems | null = null;
  private duration = 0;
  /** Instant, sur l'horloge audio, où le morceau a commencé (ou aurait commencé) son premier passage. */
  private anchor = 0;
  private repeat: number | null = null;
  private endTimer = 0;
  private readonly volumes = new Map<string, number>();
  private recorder: Recorder | null = null;
  /**
   * Son prêt à jouer de chaque piste calculée : une piste inchangée d'un rendu à l'autre (même
   * tableau, gardé par stemClient.ts) n'est ni repliée ni recopiée de nouveau.
   */
  private readonly buffers = new WeakMap<Float32Array, AudioBuffer>();
  /** Niveau commun déjà calculé pour un ensemble de pistes. */
  private levelOf: { stems: Float32Array[]; level: number } | null = null;
  /** Le processeur d'enregistrement n'est chargé qu'une fois par contexte audio. */
  private tapModule: Promise<void> | null = null;
  /** Appelé quand la lecture s'arrête d'elle-même (dernier passage terminé). */
  onEnded: (() => void) | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.gate = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.master.connect(this.gate).connect(this.limiter).connect(ctx.destination);
  }

  get playing(): boolean {
    return this.layer !== null;
  }

  /** Démarre la lecture depuis le début. `volumes` : volume de chaque piste (0 = muette). */
  play(song: SongStems, ids: string[], volumes: Record<string, number>, repeat: number | null): void {
    this.halt();
    this.setVolumes(volumes);
    this.repeat = repeat;
    this.song = song;
    this.duration = song.loopLength / song.sampleRate;
    const when = this.ctx.currentTime + 0.06;
    this.anchor = when;
    this.setLevel(song, when, false);
    this.gate.gain.cancelScheduledValues(0);
    this.gate.gain.setValueAtTime(1, this.ctx.currentTime);
    this.layer = this.makeLayer(song, ids, 0, when, false);
    this.scheduleEnd();
  }

  /**
   * Nouveau rendu pendant la lecture : il prend le relais au même temps de la mesure. Si le tempo ou
   * la longueur du morceau changent, la position est gardée en temps (et non en secondes).
   */
  update(song: SongStems, ids: string[]): void {
    const current = this.layer;
    const previous = this.song;
    if (!current || !previous) return;
    const now = this.ctx.currentTime + 0.03;
    const elapsed = Math.max(0, now - this.anchor);
    const passes = Math.floor(elapsed / this.duration);
    const beatPosition = (elapsed - passes * this.duration) / previous.beatSeconds;
    const duration = song.loopLength / song.sampleRate;
    const offset = (beatPosition * song.beatSeconds) % duration;
    this.anchor = now - passes * duration - offset;
    this.duration = duration;
    this.song = song;
    this.setLevel(song, now, true);
    this.layer = this.makeLayer(song, ids, offset, now, true);
    // L'ancien rendu s'efface pendant que le nouveau monte.
    current.bus.gain.cancelScheduledValues(now);
    current.bus.gain.setValueAtTime(1, now);
    current.bus.gain.linearRampToValueAtTime(0, now + CROSSFADE);
    for (const source of current.sources) {
      try {
        source.stop(now + CROSSFADE + 0.02);
      } catch {
        // Source déjà arrêtée.
      }
    }
    setTimeout(() => current.bus.disconnect(), (CROSSFADE + 0.3) * 1000);
    this.scheduleEnd();
  }

  /** Volume de chaque piste (0 = muette), appliqué aussitôt, en douceur. */
  setVolumes(volumes: Record<string, number>): void {
    for (const [id, value] of Object.entries(volumes)) this.volumes.set(id, value);
    const layer = this.layer;
    if (!layer) return;
    const now = this.ctx.currentTime;
    layer.ids.forEach((id, k) => {
      const target = this.volumes.get(id) ?? 1;
      const gain = layer.gains[k].gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(target, now + 0.03);
    });
  }

  /** Nombre de passages (null = en boucle), modifiable pendant la lecture. */
  setRepeat(repeat: number | null): void {
    this.repeat = repeat;
    if (this.layer) this.scheduleEnd();
  }

  /** Position dans le morceau : secondes depuis le début du passage en cours, et numéro du passage. */
  position(): { offset: number; pass: number } | null {
    if (!this.layer || this.duration <= 0) return null;
    const elapsed = this.ctx.currentTime - this.anchor;
    if (elapsed < 0) return { offset: 0, pass: 0 };
    const pass = Math.floor(elapsed / this.duration);
    // Dernier passage terminé, arrêt imminent : on reste sur la fin, sans revenir au début.
    if (this.repeat !== null && pass >= this.repeat) return { offset: this.duration - 1e-6, pass: this.repeat - 1 };
    return { offset: elapsed - pass * this.duration, pass };
  }

  /** Début de chaque accord, en secondes, dans le rendu en cours. */
  get chordStarts(): number[] {
    return this.song?.chordStarts ?? [];
  }

  stop(): void {
    this.halt();
  }

  // ——— Enregistrement ———

  get recording(): boolean {
    return this.recorder !== null;
  }

  /** Commence à enregistrer le son de sortie. */
  async startRecording(): Promise<void> {
    if (this.recorder) return;
    const chunks: Float32Array[] = [];
    let node: AudioNode;
    let flush: () => Promise<void>;
    if (this.ctx.audioWorklet) {
      this.tapModule ??= (async () => {
        const url = URL.createObjectURL(new Blob([TAP_SOURCE], { type: "application/javascript" }));
        try {
          await this.ctx.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }
      })();
      try {
        await this.tapModule;
      } catch (err) {
        this.tapModule = null;
        throw err;
      }
      const tap = new AudioWorkletNode(this.ctx, "twinschord-tap", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: "explicit" });
      let done: (() => void) | null = null;
      tap.port.onmessage = (event: MessageEvent) => {
        if (event.data === "done") done?.();
        else chunks.push(event.data as Float32Array);
      };
      node = tap;
      flush = () =>
        new Promise<void>((resolve) => {
          done = resolve;
          tap.port.postMessage("flush");
          setTimeout(resolve, 500);
        });
    } else {
      // Navigateurs plus anciens, sans AudioWorklet.
      const processor = this.ctx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => chunks.push(event.inputBuffer.getChannelData(0).slice());
      node = processor;
      flush = () => Promise.resolve();
    }
    // Le processeur n'avance que s'il est relié à la sortie : il y est relié à volume nul.
    const silent = this.ctx.createGain();
    silent.gain.value = 0;
    this.limiter.connect(node);
    node.connect(silent).connect(this.ctx.destination);
    this.recorder = { node, chunks, flush };
  }

  /** Arrête l'enregistrement et rend le son enregistré. */
  async stopRecording(): Promise<{ samples: Float32Array; sampleRate: number } | null> {
    const recorder = this.recorder;
    if (!recorder) return null;
    this.recorder = null;
    await recorder.flush();
    try {
      this.limiter.disconnect(recorder.node);
    } catch {
      // Déjà débranché.
    }
    recorder.node.disconnect();
    const length = recorder.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const samples = new Float32Array(length);
    let at = 0;
    for (const chunk of recorder.chunks) {
      samples.set(chunk, at);
      at += chunk.length;
    }
    return { samples, sampleRate: this.ctx.sampleRate };
  }

  // ——— Interne ———

  private makeLayer(song: SongStems, ids: string[], offset: number, when: number, fadeIn: boolean): Layer {
    const bus = this.ctx.createGain();
    bus.connect(this.master);
    if (fadeIn) {
      bus.gain.setValueAtTime(0, when);
      bus.gain.linearRampToValueAtTime(1, when + CROSSFADE);
    }
    const sources: AudioBufferSourceNode[] = [];
    const gains: GainNode[] = [];
    const loopSeconds = song.loopLength / song.sampleRate;
    song.stems.forEach((stem, k) => {
      let buffer = this.buffers.get(stem);
      if (!buffer) {
        const loop = foldTail(stem, song.loopLength);
        buffer = this.ctx.createBuffer(1, Math.max(1, loop.length), song.sampleRate);
        buffer.getChannelData(0).set(loop);
        this.buffers.set(stem, buffer);
      }
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = this.volumes.get(ids[k]) ?? 1;
      source.connect(gain).connect(bus);
      source.start(when, Math.min(offset, Math.max(0, loopSeconds - 1e-3)));
      sources.push(source);
      gains.push(gain);
    });
    return { sources, gains, ids, bus };
  }

  /** Niveau commun du rendu, sans saut audible quand il change. */
  private setLevel(song: SongStems, when: number, smooth: boolean): void {
    const same = this.levelOf && this.levelOf.stems.length === song.stems.length && this.levelOf.stems.every((stem, k) => stem === song.stems[k]);
    const level = same && this.levelOf ? this.levelOf.level : stemsScale(song.stems);
    this.levelOf = { stems: song.stems, level };
    const gain = this.master.gain;
    gain.cancelScheduledValues(when);
    if (smooth) {
      gain.setValueAtTime(gain.value, when);
      gain.linearRampToValueAtTime(level, when + CROSSFADE);
    } else {
      gain.setValueAtTime(level, when);
    }
  }

  /** Programme la fin de la lecture après le dernier passage demandé. */
  private scheduleEnd(): void {
    clearTimeout(this.endTimer);
    const now = this.ctx.currentTime;
    const gain = this.gate.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(1, now);
    if (this.repeat === null || this.duration <= 0) return;
    const end = this.anchor + this.repeat * this.duration;
    if (end <= now + 0.02) {
      this.finish();
      return;
    }
    gain.setValueAtTime(1, Math.max(now, end - 0.015));
    gain.linearRampToValueAtTime(0, end);
    this.endTimer = window.setTimeout(() => this.finish(), (end - now) * 1000 + 30);
  }

  private finish(): void {
    this.halt();
    this.onEnded?.();
  }

  private halt(): void {
    clearTimeout(this.endTimer);
    const layer = this.layer;
    this.layer = null;
    if (!layer) return;
    for (const source of layer.sources) {
      try {
        source.stop();
      } catch {
        // Source déjà arrêtée.
      }
      source.disconnect();
    }
    layer.bus.disconnect();
  }
}
