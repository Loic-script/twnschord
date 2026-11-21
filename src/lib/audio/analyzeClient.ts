import { analyzeAudio } from "./analyze";
import type { WorkerRequest, WorkerResponse } from "./analyze.worker";
import { pitchShift } from "./pitchShift";
import type { Analysis, ProgressFn } from "./types";

const TARGET_RATE = 22050;
const PLAYBACK_RATE = 44100;
const MAX_MINUTES = 20;
const MAX_BYTES = 400 * 1024 * 1024;

export interface DecodedAudio {
  samples: Float32Array;
  sampleRate: number;
  duration: number;
}

function mixToMono(decoded: AudioBuffer): Float32Array {
  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const channel = decoded.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += channel[i];
  }
  if (decoded.numberOfChannels > 1) {
    for (let i = 0; i < mono.length; i++) mono[i] /= decoded.numberOfChannels;
  }
  return mono;
}

/**
 * Extrait le son d'un fichier — audio, ou vidéo dont seule la piste son est lue —
 * en signal mono à ~22 kHz, entièrement dans le navigateur.
 * Le décodeur rééchantillonne lui-même à la cadence du contexte ; si le navigateur
 * refuse 22 050 Hz, on décode à 44 100 Hz puis on divise la cadence par deux.
 */
export async function decodeToMono(file: Blob): Promise<DecodedAudio> {
  if (file.size > MAX_BYTES) {
    throw new Error("Fichier trop lourd : 400 Mo au maximum. Pour une longue vidéo, exportez-en d'abord le son.");
  }
  const data = await file.arrayBuffer();
  let ctx: OfflineAudioContext;
  try {
    ctx = new OfflineAudioContext(1, 1, TARGET_RATE);
  } catch {
    ctx = new OfflineAudioContext(1, 1, 44100);
  }

  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(data);
  } catch {
    throw new Error(
      "Aucun son lisible dans ce fichier. Formats sûrs : MP3, WAV, M4A, OGG, ou une vidéo MP4, MOV ou WebM avec une piste son.",
    );
  }
  if (decoded.duration > MAX_MINUTES * 60) {
    throw new Error(`Morceau trop long : ${MAX_MINUTES} minutes au maximum.`);
  }

  const mono = mixToMono(decoded);
  const factor = Math.floor(decoded.sampleRate / TARGET_RATE);
  if (factor <= 1) return { samples: mono, sampleRate: decoded.sampleRate, duration: decoded.duration };

  // Décimation par moyenne de blocs (filtre passe-bas rudimentaire mais suffisant ici).
  const outLength = Math.floor(mono.length / factor);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += mono[i * factor + j];
    out[i] = sum / factor;
  }
  return { samples: out, sampleRate: decoded.sampleRate / factor, duration: decoded.duration };
}

/** Le son d'un morceau déjà ouvert, en pleine qualité (mono, 44,1 kHz), pour le transposer. */
export async function decodeForPlayback(url: string): Promise<{ samples: Float32Array; sampleRate: number }> {
  const data = await (await fetch(url)).arrayBuffer();
  const decoded = await new OfflineAudioContext(1, 1, PLAYBACK_RATE).decodeAudioData(data);
  return { samples: mixToMono(decoded), sampleRate: decoded.sampleRate };
}

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;

function dropWorker(): void {
  workerBroken = true;
  worker?.terminate();
  worker = null;
}

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./analyze.worker.ts", import.meta.url), { type: "module" });
      // Script introuvable (hors ligne, jamais mis en cache) ou erreur au chargement :
      // on renonce au worker, le calcul se fera sur le fil principal.
      worker.addEventListener("error", dropWorker);
    } catch {
      workerBroken = true;
      return null;
    }
  }
  return worker;
}

/**
 * Charge le worker dès l'ouverture de l'application : son script est ainsi mis
 * en cache et les calculs restent disponibles une fois hors ligne.
 */
export function prewarmAnalysis(): void {
  getWorker();
}

type Job = { kind: "analyze"; samples: Float32Array; sampleRate: number } | { kind: "shift"; samples: Float32Array; semitones: number };

/**
 * Confie un calcul au Web Worker ; s'il ne démarre pas ou ne répond plus,
 * le même calcul est refait sur le fil principal (`fallback`).
 */
function callWorker<T>(job: Job, pick: (message: WorkerResponse) => T | undefined, fallback: () => Promise<T>, onProgress?: ProgressFn): Promise<T> {
  const w = getWorker();
  if (!w) return fallback();

  return new Promise<T>((resolve, reject) => {
    const id = nextId++;
    let settled = false;
    const cleanup = () => {
      settled = true;
      clearTimeout(watchdog);
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };
    const onError = () => {
      if (settled) return;
      cleanup();
      dropWorker();
      fallback().then(resolve, reject);
    };
    // Un worker qui ne donne aucun signe de vie en 8 s est considéré comme perdu.
    let watchdog = setTimeout(onError, 8000);
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.id !== id) return;
      clearTimeout(watchdog);
      if (message.type === "progress") {
        watchdog = setTimeout(onError, 30000);
        onProgress?.(message.fraction, message.stage);
      } else if (message.type === "error") {
        cleanup();
        reject(new Error(message.message));
      } else {
        const result = pick(message);
        cleanup();
        if (result === undefined) reject(new Error("Réponse inattendue du calcul."));
        else resolve(result);
      }
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    const request: WorkerRequest = { id, ...job };
    w.postMessage(request);
  });
}

/** Analyse un morceau (tempo, accords, mélodie). */
export function runAnalysis(samples: Float32Array, sampleRate: number, onProgress?: ProgressFn): Promise<Analysis> {
  return callWorker(
    { kind: "analyze", samples, sampleRate },
    (message) => (message.type === "done" ? message.analysis : undefined),
    () => analyzeAudio(samples, sampleRate, onProgress),
    onProgress,
  );
}

/** Monte ou descend un son de `semitones` demi-tons, sans changer sa durée. */
export function runPitchShift(samples: Float32Array, semitones: number, onProgress?: (fraction: number) => void): Promise<Float32Array> {
  return callWorker(
    { kind: "shift", samples, semitones },
    (message) => (message.type === "shifted" ? message.samples : undefined),
    () => pitchShift(samples, semitones, onProgress),
    onProgress ? (fraction) => onProgress(fraction) : undefined,
  );
}
