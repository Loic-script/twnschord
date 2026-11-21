/**
 * Les sons du générateur. Trois familles de synthèse :
 * - cordes frappées (piano, piano électrique, vibraphone) : partiels qui s'éteignent ;
 * - cordes pincées (guitares, basse) : algorithme de Karplus-Strong ;
 * - sons entretenus (orgue, saxophone, trompette, flûte, cordes) : table d'onde à formants.
 * Plus une batterie. Aucun échantillon enregistré : tout est calculé.
 */
import { midiToFreq } from "./notes";

/** Bruit déterministe (xorshift) : deux rendus identiques donnent exactement le même son. */
export class Noise {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }
  /** Valeur entre −1 et 1. */
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.state = x;
    return x / 2147483648 - 1;
  }
  /** Valeur entre 0 et 1. */
  unit(): number {
    return (this.next() + 1) / 2;
  }
}

export type InstrumentId =
  | "piano"
  | "epiano"
  | "organ"
  | "vibes"
  | "guitar"
  | "nylon"
  | "sax"
  | "trumpet"
  | "flute"
  | "strings";

export const INSTRUMENTS: { id: InstrumentId; name: string }[] = [
  { id: "piano", name: "Piano" },
  { id: "epiano", name: "Piano électrique" },
  { id: "organ", name: "Orgue" },
  { id: "vibes", name: "Vibraphone" },
  { id: "guitar", name: "Guitare acoustique" },
  { id: "nylon", name: "Guitare classique" },
  { id: "sax", name: "Saxophone" },
  { id: "trumpet", name: "Trompette" },
  { id: "flute", name: "Flûte" },
  { id: "strings", name: "Cordes (violons)" },
];

export interface Profile {
  engine: "struck" | "pluck" | "blown";
  /** Niveau d'une note, pour que tous les instruments sonnent à volume comparable. */
  level: number;
  /** Note la plus grave de la main gauche / de la basse de l'instrument. */
  low: number;
  /** Note la plus grave de l'accord. */
  chord: number;
  /** Nombre maximal de notes dans un accord. */
  voices: number;
  /** Décalage entre les cordes d'un accord gratté, en secondes (0 = notes simultanées). */
  strum: number;
}

export const PROFILES: Record<InstrumentId, Profile> = {
  piano: { engine: "struck", level: 0.16, low: 36, chord: 55, voices: 6, strum: 0 },
  epiano: { engine: "struck", level: 0.2, low: 36, chord: 55, voices: 6, strum: 0 },
  vibes: { engine: "struck", level: 0.2, low: 48, chord: 60, voices: 4, strum: 0 },
  guitar: { engine: "pluck", level: 0.2, low: 40, chord: 52, voices: 6, strum: 0.013 },
  nylon: { engine: "pluck", level: 0.24, low: 40, chord: 52, voices: 6, strum: 0.016 },
  organ: { engine: "blown", level: 0.085, low: 36, chord: 55, voices: 5, strum: 0 },
  sax: { engine: "blown", level: 0.15, low: 44, chord: 53, voices: 4, strum: 0 },
  trumpet: { engine: "blown", level: 0.12, low: 52, chord: 58, voices: 3, strum: 0 },
  flute: { engine: "blown", level: 0.2, low: 60, chord: 67, voices: 3, strum: 0 },
  strings: { engine: "blown", level: 0.12, low: 43, chord: 55, voices: 5, strum: 0 },
};

// ——— Cordes frappées ———

interface Overtone {
  ratio: number;
  amp: number;
  /** Vitesse d'extinction, en népers par seconde. */
  decay: number;
}

function struckPartials(id: InstrumentId, midi: number): Overtone[] {
  // Les notes aiguës s'éteignent plus vite que les graves.
  const pitch = 0.9 + Math.max(0, midi - 48) * 0.035;
  if (id === "epiano") {
    return [
      { ratio: 1, amp: 1, decay: 0.8 * pitch },
      { ratio: 2, amp: 0.28, decay: 1.4 * pitch },
      { ratio: 3, amp: 0.08, decay: 2.2 * pitch },
      { ratio: 4, amp: 0.04, decay: 3 * pitch },
      { ratio: 7, amp: 0.12, decay: 10 }, // le « ting » de la lame, très bref
    ];
  }
  if (id === "vibes") {
    return [
      { ratio: 1, amp: 1, decay: 0.55 },
      { ratio: 4, amp: 0.3, decay: 1.6 },
      { ratio: 10.1, amp: 0.09, decay: 5 },
    ];
  }
  const partials: Overtone[] = [];
  for (let h = 1; h <= 8; h++) {
    // Légère inharmonicité, comme une vraie corde de piano.
    partials.push({ ratio: h * Math.sqrt(1 + 0.0002 * h * h), amp: Math.pow(h, -1.3), decay: (1 + 0.9 * (h - 1)) * pitch });
  }
  return partials;
}

function addStruck(out: Float32Array, sr: number, start: number, dur: number, midi: number, gain: number, id: InstrumentId): void {
  const i0 = Math.round(start * sr);
  if (i0 >= out.length || i0 < 0) return;
  const releaseRate = id === "vibes" ? 7 : id === "epiano" ? 22 : 28;
  const n = Math.min(out.length - i0, Math.round((dur + 4 / releaseRate) * sr));
  const hold = Math.round(dur * sr);
  const attack = Math.round(0.004 * sr);
  const env = new Float32Array(n);
  const releaseStep = Math.exp(-releaseRate / sr);
  let release = 1;
  for (let i = 0; i < n; i++) {
    let e = i < attack ? i / attack : 1;
    if (i >= hold) {
      release *= releaseStep;
      e *= release;
    }
    // Vibraphone : le moteur fait onduler le volume.
    if (id === "vibes") e *= 1 - 0.22 * (0.5 - 0.5 * Math.cos((2 * Math.PI * 4.5 * i) / sr));
    env[i] = e;
  }

  const f0 = midiToFreq(midi);
  for (const partial of struckPartials(id, midi)) {
    const freq = f0 * partial.ratio;
    if (freq > sr * 0.45) continue;
    // Oscillateur récursif : une multiplication par échantillon au lieu d'un sinus.
    const w = (2 * Math.PI * freq) / sr;
    const c = 2 * Math.cos(w);
    let y1 = 0;
    let y2 = -Math.sin(w);
    let amp = gain * partial.amp;
    const decay = Math.exp(-partial.decay / sr);
    for (let i = 0; i < n; i++) {
      const s = c * y1 - y2;
      y2 = y1;
      y1 = s;
      out[i0 + i] += amp * s * env[i];
      amp *= decay;
    }
  }
}

// ——— Cordes pincées ———

/**
 * Karplus-Strong : une salve de bruit tourne dans une ligne à retard de la
 * longueur d'une période ; un filtre dans la boucle l'adoucit à chaque tour.
 * Un passe-tout règle la justesse au centième d'échantillon près.
 */
export function addPluck(
  out: Float32Array,
  sr: number,
  start: number,
  dur: number,
  midi: number,
  gain: number,
  noise: Noise,
  brightness: number,
  sustain: number,
): void {
  const i0 = Math.round(start * sr);
  if (i0 >= out.length || i0 < 0) return;
  const freq = midiToFreq(midi);
  const period = sr / freq;
  let size = Math.floor(period - 0.5);
  let fraction = period - 0.5 - size;
  if (fraction < 0.1) {
    size -= 1;
    fraction += 1;
  }
  if (size < 2) return;
  const allpass = (1 - fraction) / (1 + fraction);

  const line = new Float32Array(size);
  let smooth = 0;
  let mean = 0;
  for (let i = 0; i < size; i++) {
    smooth += brightness * (noise.next() - smooth);
    line[i] = smooth;
    mean += smooth;
  }
  mean /= size;
  let peak = 1e-9;
  for (let i = 0; i < size; i++) {
    line[i] -= mean;
    peak = Math.max(peak, Math.abs(line[i]));
  }
  for (let i = 0; i < size; i++) line[i] /= peak;

  const loopGain = Math.pow(0.001, 1 / (freq * sustain));
  const n = Math.min(out.length - i0, Math.round((dur + 0.06) * sr));
  const hold = Math.round(dur * sr);
  const releaseStep = Math.exp(-60 / sr);
  let release = 1;
  let ptr = 0;
  let previous = 0;
  let apIn = 0;
  let apOut = 0;
  for (let i = 0; i < n; i++) {
    const x = line[ptr];
    const average = 0.5 * (x + previous);
    previous = x;
    const y = allpass * average + apIn - allpass * apOut;
    apIn = average;
    apOut = y;
    line[ptr] = y * loopGain;
    ptr = ptr + 1 === size ? 0 : ptr + 1;
    if (i >= hold) release *= releaseStep;
    out[i0 + i] += gain * x * release;
  }
}

// ——— Guitare basse ———

// Cordes à vide d'une basse quatre cordes : Mi, La, Ré, Sol.
const BASS_STRINGS = [28, 33, 38, 43];
// Positions le long de la corde à vide, en fraction de sa longueur depuis le chevalet.
const BASS_FINGER = 0.13; // là où le doigt attaque la corde
const BASS_NECK_PICKUP = 0.165; // micro double côté manche (type « Precision »)
const BASS_BRIDGE_PICKUP = 0.09; // micro simple côté chevalet (type « Jazz »)

const bell = (f: number, center: number, width: number) => Math.exp(-(((f - center) / width) ** 2));

/** Couleur de l'électronique et de l'ampli : assise grave, grain dans les médiums, aigus adoucis. */
function bassTone(f: number): number {
  const lowCut = (f * f) / (f * f + 35 * 35);
  const body = 1 + 0.4 * bell(f, 110, 60);
  const growl = 1 + 0.9 * bell(f, 900, 500);
  const pickup = (1 + 0.5 * bell(f, 2600, 700)) / Math.sqrt(1 + (f / 3200) ** 4);
  return lowCut * body * growl * pickup;
}

/**
 * Basse électrique à deux micros (manche + chevalet), par synthèse modale :
 * la note est la somme des modes de vibration de la corde. Ce qui fait le son
 * d'une basse plutôt que d'une corde quelconque :
 * - l'endroit où le doigt tire la corde supprime certains harmoniques ;
 * - chaque micro n'« entend » la corde qu'à sa position, d'où son timbre propre,
 *   et les deux se mélangent (rondeur du manche, mordant du chevalet) ;
 * - sur une case, la corde raccourcit : doigt et micros se retrouvent plus loin
 *   du chevalet en proportion, et le timbre change d'une note à l'autre ;
 * - les harmoniques aigus s'éteignent bien plus vite que le fondamental ;
 * - l'attaque du doigt ajoute un court claquement.
 * `velocity` (0…1) est la force de l'attaque : plus fort, plus brillant.
 */
export function addBass(out: Float32Array, sr: number, start: number, dur: number, midi: number, velocity: number, noise: Noise): void {
  const i0 = Math.round(start * sr);
  if (i0 >= out.length || i0 < 0) return;
  const n = Math.min(out.length - i0, Math.round((dur + 0.09) * sr));
  const hold = Math.round(dur * sr);
  const attack = Math.max(1, Math.round(0.0025 * sr));
  const env = new Float32Array(n);
  // Au relâchement, le doigt étouffe la corde.
  const releaseStep = Math.exp(-55 / sr);
  let release = 1;
  for (let i = 0; i < n; i++) {
    let e = i < attack ? i / attack : 1;
    if (i >= hold) {
      release *= releaseStep;
      e *= release;
    }
    env[i] = e;
  }

  // Corde la plus aiguë qui peut jouer la note : on reste près du sillet, comme un bassiste.
  let open = BASS_STRINGS[0];
  for (const string of BASS_STRINGS) if (string <= midi) open = string;
  const shorten = Math.pow(2, Math.max(0, midi - open) / 12);
  const finger = Math.min(0.45, BASS_FINGER * shorten);
  const neck = Math.min(0.48, BASS_NECK_PICKUP * shorten);
  const bridge = Math.min(0.45, BASS_BRIDGE_PICKUP * shorten);

  const f0 = midiToFreq(midi);
  const count = Math.max(1, Math.min(48, Math.floor(Math.min(5000, sr * 0.45) / f0)));
  const softness = (1 - Math.max(0, Math.min(1, velocity))) * 0.06;
  const modes: { freq: number; amp: number; decay: number }[] = [];
  let power = 0;
  for (let h = 1; h <= count; h++) {
    // Corde filée épaisse : les modes sont très légèrement plus hauts que les harmoniques exacts.
    const freq = f0 * h * Math.sqrt(1 + 0.00012 * h * h);
    const heard = 0.62 * Math.sin(h * Math.PI * neck) + 0.38 * Math.sin(h * Math.PI * bridge);
    const amp = (Math.sin(h * Math.PI * finger) / h) * heard * bassTone(freq) * Math.exp(-softness * h);
    modes.push({ freq, amp, decay: 0.35 + 0.011 * h * h + freq * 0.0006 });
    power += amp * amp;
  }
  // Niveau calé pour que le préampli (mixBass) ne sature que sur les attaques.
  const scale = (0.5 * velocity) / Math.sqrt(power || 1);

  for (const mode of modes) {
    let amp = mode.amp * scale;
    if (Math.abs(amp) < 1e-5) continue;
    // Inutile de calculer un mode une fois devenu inaudible.
    const length = Math.min(n, Math.ceil((sr * 9.2) / mode.decay));
    const w = (2 * Math.PI * mode.freq) / sr;
    const c = 2 * Math.cos(w);
    let y1 = 0;
    let y2 = -Math.sin(w);
    const decay = Math.exp(-mode.decay / sr);
    for (let i = 0; i < length; i++) {
      const s = c * y1 - y2;
      y2 = y1;
      y1 = s;
      out[i0 + i] += amp * s * env[i];
      amp *= decay;
    }
  }

  // Claquement du doigt sur la corde.
  const click = Math.min(n, Math.round(0.012 * sr));
  let smooth = 0;
  for (let i = 0; i < click; i++) {
    smooth += 0.2 * (noise.next() - smooth);
    out[i0 + i] += 0.25 * velocity * velocity * smooth * Math.exp(-i / sr / 0.003);
  }
}

/**
 * Passe la piste de basse dans un préampli : une saturation douce qui tasse les
 * attaques et ajoute le grain, puis la mélange au reste.
 */
export function mixBass(out: Float32Array, bus: Float32Array, level: number): void {
  const drive = 0.8;
  for (let i = 0; i < out.length; i++) {
    const x = bus[i];
    if (x !== 0) out[i] += (level * Math.tanh(drive * x)) / drive;
  }
}

// ——— Sons entretenus ———

interface Blown {
  attack: number;
  /** Vitesse d'extinction au relâchement, en népers par seconde. */
  release: number;
  vibratoRate: number;
  vibratoDepth: number;
  vibratoDelay: number;
  /** Part de souffle mêlée au son. */
  breath: number;
  /** Désaccord de chaque voix, en cents : plusieurs voix font un pupitre. */
  detune: number[];
}

const BLOWN: Record<"organ" | "sax" | "trumpet" | "flute" | "strings", Blown> = {
  organ: { attack: 0.012, release: 30, vibratoRate: 6.2, vibratoDepth: 0.0015, vibratoDelay: 0, breath: 0, detune: [0] },
  sax: { attack: 0.05, release: 45, vibratoRate: 5.3, vibratoDepth: 0.0045, vibratoDelay: 0.18, breath: 0.05, detune: [0] },
  trumpet: { attack: 0.035, release: 50, vibratoRate: 5.5, vibratoDepth: 0.004, vibratoDelay: 0.25, breath: 0.02, detune: [0] },
  flute: { attack: 0.07, release: 35, vibratoRate: 5, vibratoDepth: 0.005, vibratoDelay: 0.2, breath: 0.12, detune: [0] },
  strings: { attack: 0.14, release: 9, vibratoRate: 5.6, vibratoDepth: 0.003, vibratoDelay: 0.1, breath: 0, detune: [-8, 0, 8] },
};

const ORGAN_DRAWBARS: Record<number, number> = { 1: 1, 2: 0.8, 3: 0.55, 4: 0.4, 6: 0.22, 8: 0.16 };
const FLUTE_HARMONICS = [1, 0.45, 0.14, 0.06, 0.025];

/** Force de l'harmonique `h` (de fréquence `f`) dans le timbre de l'instrument. */
function harmonicAmp(id: InstrumentId, h: number, f: number): number {
  switch (id) {
    case "organ":
      return ORGAN_DRAWBARS[h] ?? 0;
    case "flute":
      return FLUTE_HARMONICS[h - 1] ?? 0;
    case "trumpet":
      return Math.pow(h, -0.55) * (1 + 2.4 * bell(f, 1350, 650)) * (f > 3200 ? (3200 / f) ** 2 : 1);
    case "strings":
      return (1 / h) * (f > 2800 ? 2800 / f : 1);
    default:
      return Math.pow(h, -0.9) * (1 + 2.2 * bell(f, 1100, 600) + 0.9 * bell(f, 2600, 800));
  }
}

const TABLE = 2048;
const tables = new Map<string, Float32Array>();

/** Une période du timbre pour une note donnée. */
function waveTable(id: InstrumentId, midi: number, sr: number): Float32Array {
  const key = `${id}:${midi}@${sr}`;
  const cached = tables.get(key);
  if (cached) return cached;
  const table = new Float32Array(TABLE);
  const f0 = midiToFreq(midi);
  const harmonics = Math.max(1, Math.min(24, Math.floor((sr * 0.45) / f0)));
  for (let h = 1; h <= harmonics; h++) {
    const amp = harmonicAmp(id, h, f0 * h);
    if (amp <= 0) continue;
    const phase = id === "organ" || id === "flute" ? 0 : 0.7 * h * h;
    for (let i = 0; i < TABLE; i++) table[i] += amp * Math.sin((2 * Math.PI * h * i) / TABLE + phase);
  }
  let peak = 1e-9;
  for (let i = 0; i < TABLE; i++) peak = Math.max(peak, Math.abs(table[i]));
  for (let i = 0; i < TABLE; i++) table[i] /= peak;
  tables.set(key, table);
  return table;
}

function addBlown(
  out: Float32Array,
  sr: number,
  start: number,
  dur: number,
  midi: number,
  gain: number,
  id: InstrumentId,
  noise: Noise,
): void {
  const i0 = Math.round(start * sr);
  if (i0 >= out.length || i0 < 0) return;
  const p = BLOWN[id as keyof typeof BLOWN] ?? BLOWN.sax;
  const table = waveTable(id, midi, sr);
  const n = Math.min(out.length - i0, Math.round((Math.max(dur, 0.03) + 4 / p.release) * sr));
  const hold = Math.round(Math.max(dur, 0.03) * sr);
  const attack = Math.max(1, Math.round(Math.min(p.attack, dur * 0.5) * sr));
  const base = (midiToFreq(midi) * TABLE) / sr;
  const steps = p.detune.map((cents) => base * Math.pow(2, cents / 1200));
  const phases = steps.map((_, v) => (v * TABLE) / 3.3);
  const voiceGain = gain / Math.pow(steps.length, 0.7);
  const releaseStep = Math.exp(-p.release / sr);
  let release = 1;
  let breath = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const depth = t < p.vibratoDelay ? 0 : Math.min(1, (t - p.vibratoDelay) / 0.25) * p.vibratoDepth;
    const bend = 1 + depth * Math.sin(2 * Math.PI * p.vibratoRate * t);
    let sample = 0;
    for (let v = 0; v < steps.length; v++) {
      let phase = phases[v] + steps[v] * bend;
      if (phase >= TABLE) phase -= TABLE;
      phases[v] = phase;
      const index = Math.floor(phase);
      const a = table[index];
      sample += a + (table[(index + 1) & (TABLE - 1)] - a) * (phase - index);
    }
    let env = i < attack ? 0.5 - 0.5 * Math.cos((Math.PI * i) / attack) : 1;
    if (i >= hold) {
      release *= releaseStep;
      env *= release;
    }
    if (p.breath > 0) {
      breath += 0.25 * (noise.next() - breath);
      sample += p.breath * breath * steps.length;
    }
    out[i0 + i] += voiceGain * env * sample;
  }
}

/** Joue une note de l'instrument demandé. `start` et `dur` sont en secondes. */
export function playNote(
  out: Float32Array,
  sr: number,
  id: InstrumentId,
  start: number,
  dur: number,
  midi: number,
  gain: number,
  noise: Noise,
): void {
  const profile = PROFILES[id];
  const level = gain * profile.level;
  if (level <= 0) return;
  if (profile.engine === "struck") addStruck(out, sr, start, dur, midi, level, id);
  else if (profile.engine === "pluck") {
    if (id === "nylon") addPluck(out, sr, start, dur, midi, level, noise, 0.3, 2.6);
    else addPluck(out, sr, start, dur, midi, level, noise, 0.55, 3.5);
  } else addBlown(out, sr, start, dur, midi, level, id, noise);
}

// ——— Batterie ———

/** k : grosse caisse, s : caisse claire, h : charleston fermé, o : charleston ouvert, r : cymbale ride, x : cercle. */
export type DrumSound = "k" | "s" | "h" | "o" | "r" | "x";

export function playDrum(out: Float32Array, sr: number, sound: DrumSound, start: number, gain: number, noise: Noise): void {
  const i0 = Math.round(start * sr);
  if (i0 >= out.length || i0 < 0 || gain <= 0) return;
  const room = out.length - i0;

  if (sound === "k") {
    // Un sinus dont la hauteur chute très vite.
    const n = Math.min(room, Math.round(0.3 * sr));
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      phase += (2 * Math.PI * (45 + 110 * Math.exp(-t / 0.03))) / sr;
      out[i0 + i] += gain * Math.sin(phase) * Math.exp(-t / 0.09);
    }
  } else if (sound === "s") {
    // Bruit filtré vers l'aigu, plus une courte note de peau.
    const n = Math.min(room, Math.round(0.22 * sr));
    let low = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const white = noise.next();
      low += 0.15 * (white - low);
      out[i0 + i] += gain * ((white - low) * Math.exp(-t / 0.055) + 0.5 * Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t / 0.03));
    }
  } else if (sound === "x") {
    // Coup sur le cercle : un clic sec et boisé.
    const n = Math.min(room, Math.round(0.06 * sr));
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const click = t < 0.002 ? noise.next() * 0.6 : 0;
      out[i0 + i] += gain * (Math.sin(2 * Math.PI * 820 * t) * Math.exp(-t / 0.012) + click);
    }
  } else {
    // Cymbales : bruit très aigu, plus ou moins long.
    const length = sound === "h" ? 0.06 : sound === "o" ? 0.3 : 0.6;
    const fade = sound === "h" ? 0.012 : sound === "o" ? 0.09 : 0.2;
    const n = Math.min(room, Math.round(length * sr));
    let x1 = 0;
    let y1 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const white = noise.next();
      const high = white - x1;
      x1 = white;
      const higher = high - y1;
      y1 = high;
      // La ride ajoute un tintement métallique à l'attaque.
      const ping = sound === "r" ? 0.25 * (Math.sin(2 * Math.PI * 3100 * t) + Math.sin(2 * Math.PI * 4750 * t)) * Math.exp(-t / 0.08) : 0;
      out[i0 + i] += gain * (0.5 * higher * Math.exp(-t / fade) + ping);
    }
  }
}
