import { describe, expect, it } from "vitest";
import { analyzeAudio } from "./analyze";
import { LiveAnalyzer } from "./live";
import { midiToFreq, pitchClass } from "./notes";
import { PitchDetector } from "./pitch";
import { buildSheet } from "./solfa";
import type { Analysis } from "./types";

/** Note façon piano : harmoniques en 1/h, attaque brève, décroissance exponentielle. */
function addTone(out: Float32Array, sampleRate: number, midi: number, start: number, dur: number, gain = 0.2) {
  const freq = midiToFreq(midi);
  const i0 = Math.floor(start * sampleRate);
  const n = Math.min(out.length - i0, Math.floor(dur * sampleRate));
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t / 0.005) * Math.exp(-2.5 * t) * Math.min(1, (n - i) / (0.01 * sampleRate));
    let s = 0;
    for (let h = 1; h <= 6; h++) {
      if (freq * h > sampleRate / 2.2) break;
      s += Math.sin(2 * Math.PI * freq * h * t) / h;
    }
    out[i0 + i] += gain * env * s;
  }
}

function sustained(sampleRate: number, midis: number[], seconds: number): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sampleRate));
  for (const m of midis) addTone(out, sampleRate, m, 0, seconds, 0.15);
  return out;
}

/** Fait défiler le signal dans l'analyseur comme le ferait le micro. */
function listen(sampleRate: number, signal: Float32Array) {
  const live = new LiveAnalyzer(sampleRate);
  let last = live.process(signal.subarray(0, live.bufferSize));
  for (let off = 2048; off + live.bufferSize <= signal.length; off += 2048) {
    last = live.process(signal.subarray(off, off + live.bufferSize));
  }
  return last;
}

describe("détection de hauteur (YIN)", () => {
  const cases: [string, number, number][] = [
    ["La 440 à 48 kHz", 48000, 440],
    ["Mi grave 82,4 Hz à 44,1 kHz", 44100, 82.41],
    ["Do aigu 1046,5 Hz à 48 kHz", 48000, 1046.5],
    ["Do central 261,6 Hz à 22 kHz", 22050, 261.63],
  ];
  for (const [name, rate, freq] of cases) {
    it(name, () => {
      const buf = new Float32Array(4096);
      for (let i = 0; i < buf.length; i++) {
        const t = i / rate;
        buf[i] = 0.4 * Math.sin(2 * Math.PI * freq * t) + 0.2 * Math.sin(4 * Math.PI * freq * t);
      }
      const result = new PitchDetector(rate, 4096).detect(buf);
      expect(result).not.toBeNull();
      expect(Math.abs(result!.freq - freq) / freq).toBeLessThan(0.005);
    });
  }

  it("ne renvoie rien sur du silence", () => {
    expect(new PitchDetector(48000, 4096).detect(new Float32Array(4096))).toBeNull();
  });
});

describe("reconnaissance en direct", () => {
  const rate = 48000;
  const chords: [string, number[]][] = [
    ["C", [60, 64, 67]],
    ["Am", [57, 60, 64]],
    ["G7", [55, 59, 62, 65]],
    ["Fmaj7", [53, 57, 60, 64]],
    ["Dm7", [50, 53, 57, 60]],
    ["E♭", [51, 55, 58]],
    ["F♯m", [54, 57, 61]],
    ["Bdim", [59, 62, 65]],
    ["Csus4", [60, 65, 67]],
    ["D", [50, 57, 62, 66]],
  ];
  for (const [label, midis] of chords) {
    it(`reconnaît ${label}`, () => {
      const result = listen(rate, sustained(rate, midis, 1));
      expect(result.chord?.label).toBe(label);
      expect(result.chord?.kind).toBe("chord");
    });
  }

  it("distingue une note seule d'un accord", () => {
    const result = listen(rate, sustained(rate, [60], 1));
    expect(result.chord?.kind).toBe("note");
    expect(result.chord?.label).toBe("C");
    expect(result.note?.midi).toBe(60);
    expect(Math.abs(result.note!.cents)).toBeLessThan(5);
  });

  it("nomme la note jouée sur toute l'étendue du clavier", () => {
    for (const midi of [36, 45, 57, 69, 76, 88]) {
      const result = listen(rate, sustained(rate, [midi], 1));
      expect(result.note?.midi).toBe(midi);
    }
  });

  it("reste muet sur du silence", () => {
    const result = listen(rate, new Float32Array(rate));
    expect(result.silent).toBe(true);
    expect(result.chord).toBeNull();
    expect(result.note).toBeNull();
  });
});

describe("analyse d'un morceau", () => {
  const rate = 22050;
  const bpm = 100;
  const beat = 60 / bpm;
  // Do – Sol – La mineur – Fa, une mesure de 4 temps chacun, répété 4 fois.
  const progression: [string, number[]][] = [
    ["C", [48, 55, 60, 64]],
    ["G", [43, 55, 59, 62]],
    ["Am", [45, 57, 60, 64]],
    ["F", [41, 53, 57, 60]],
  ];
  // Mélodie en noires, deux octaves au-dessus de la basse.
  const tune = [72, 76, 79, 76, 74, 79, 83, 79, 72, 76, 81, 76, 77, 81, 84, 81];
  const bars = 16;
  const intro = 0.3;

  let analysis: Analysis;
  it("s'exécute sur un morceau synthétique", async () => {
    const out = new Float32Array(Math.floor((intro + bars * 4 * beat + 1) * rate));
    for (let bar = 0; bar < bars; bar++) {
      const [, midis] = progression[bar % 4];
      for (let b = 0; b < 4; b++) {
        const t = intro + (bar * 4 + b) * beat;
        for (const m of midis) addTone(out, rate, m, t, beat, 0.12);
        addTone(out, rate, tune[(bar % 4) * 4 + b], t, beat, 0.3);
      }
    }
    analysis = await analyzeAudio(out, rate);
    expect(analysis.beats.length).toBeGreaterThan(bars * 4 - 4);
  }, 60000);

  it("trouve le tempo", () => {
    expect(Math.abs(analysis.tempo - bpm)).toBeLessThan(2);
  });

  it("place les temps sur les attaques", () => {
    const errors = analysis.beats
      .filter((t) => t > intro && t < intro + bars * 4 * beat)
      .map((t) => {
        const phase = (t - intro) / beat;
        return Math.abs(phase - Math.round(phase)) * beat;
      });
    const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
    expect(mean).toBeLessThan(0.04);
  });

  it("retrouve la grille d'accords", () => {
    let right = 0;
    let total = 0;
    analysis.beats.forEach((t, i) => {
      const mid = t + beat / 2 - intro;
      if (mid < 0 || mid >= bars * 4 * beat) return;
      const expected = progression[Math.floor(mid / (4 * beat)) % 4][0];
      total++;
      if (analysis.beatChords[i] === expected) right++;
    });
    expect(right / total).toBeGreaterThan(0.85);
  });

  it("trouve la tonalité et la mesure", () => {
    expect(analysis.key).toEqual({ tonic: 0, mode: "major" });
    expect(analysis.beatsPerBar).toBe(4);
  });

  it("retrouve la mélodie", () => {
    let right = 0;
    let total = 0;
    analysis.beats.forEach((t, i) => {
      const mid = t + beat / 4 - intro;
      if (mid < 0 || mid >= bars * 4 * beat) return;
      const index = Math.floor(mid / beat);
      const expected = tune[index % 16];
      const got = analysis.melody[i * analysis.slotsPerBeat];
      total++;
      if (got !== null && pitchClass(got) === pitchClass(expected)) right++;
    });
    expect(right / total).toBeGreaterThan(0.8);
  });
});

describe("analyse d'une valse désaccordée et bruitée", () => {
  const rate = 22050;
  const bpm = 132;
  const beat = 60 / bpm;
  const detune = 0.25; // piano un quart de demi-ton trop haut
  const progression: [string, number, number[]][] = [
    ["Am", 45, [57, 60, 64]],
    ["Dm", 38, [57, 62, 65]],
    ["E", 40, [56, 59, 64]],
    ["Am", 45, [57, 60, 64]],
  ];
  const bars = 24;

  let analysis: Analysis;
  it("s'exécute", async () => {
    const out = new Float32Array(Math.floor((bars * 3 * beat + 1) * rate));
    for (let bar = 0; bar < bars; bar++) {
      const [, bass, midis] = progression[bar % 4];
      const t = bar * 3 * beat;
      addTone(out, rate, bass + detune, t, beat * 3, 0.3);
      for (const b of [1, 2]) for (const m of midis) addTone(out, rate, m + detune, t + b * beat, beat, 0.14);
    }
    // Bruit de fond déterministe.
    let seed = 12345;
    for (let i = 0; i < out.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      out[i] += (seed / 4294967296 - 0.5) * 0.02;
    }
    analysis = await analyzeAudio(out, rate);
  }, 60000);

  it("mesure l'accordage et le tempo", () => {
    expect(Math.abs(analysis.tuningCents - 25)).toBeLessThan(8);
    expect(Math.abs(analysis.tempo - bpm)).toBeLessThan(3);
  });

  it("reconnaît une mesure à trois temps en La mineur", () => {
    expect(analysis.beatsPerBar).toBe(3);
    expect(analysis.key).toEqual({ tonic: 9, mode: "minor" });
  });

  it("retrouve les accords", () => {
    let right = 0;
    let total = 0;
    analysis.beats.forEach((t, i) => {
      const mid = t + beat / 2;
      if (mid >= bars * 3 * beat) return;
      total++;
      if (analysis.beatChords[i] === progression[Math.floor(mid / (3 * beat)) % 4][0]) right++;
    });
    expect(right / total).toBeGreaterThan(0.75);
  });
});

describe("mise en page solfa", () => {
  const analysis: Analysis = {
    version: 1,
    duration: 4,
    tempo: 120,
    beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    beatsPerBar: 4,
    downbeat: 0,
    key: { tonic: 7, mode: "major" },
    tuningCents: 0,
    beatChords: ["G", "G", "D", "D", "Em", "Em", "N", "N"],
    slotsPerBeat: 2,
    //        sol     la  si    ré aigu       fa♯ grave      silence
    melody: [67, 67, 69, 71, 74, 74, 74, 74, 66, 66, 67, 67, null, null, null, null],
    attacks: [1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
  };

  it("écrit en do mobile avec divisions, tenues et marques d'octave", () => {
    const sheet = buildSheet(analysis, "solfa");
    expect(sheet.doPc).toBe(7);
    expect(sheet.bars).toHaveLength(2);
    const texts = sheet.bars.map((bar) => bar.beats.map((b) => b.tokens.map((t) => t.text).join(".")));
    expect(texts).toEqual([
      ["d", "r.m", "s", "–"],
      ["t", "d", "", ""],
    ]);
    // fa♯ sous le do de référence → octave inférieure.
    expect(sheet.bars[1].beats[0].tokens[0].octave).toBe(-1);
    expect(sheet.bars[0].beats[2].tokens[0].octave).toBe(0);
  });

  it("n'affiche l'accord qu'au changement ou en début de mesure", () => {
    const sheet = buildSheet(analysis, "solfa");
    const chords = sheet.bars.map((bar) => bar.beats.map((b) => b.chord));
    expect(chords).toEqual([
      ["G", null, "D", null],
      ["Em", null, null, null],
    ]);
  });

  it("sait écrire en notes fixes et décaler la mesure", () => {
    const sheet = buildSheet(analysis, "latin", { beatsPerBar: 3, downbeat: 1 });
    expect(sheet.bars[0].pickup).toBe(true);
    expect(sheet.bars[0].beats).toHaveLength(1);
    expect(sheet.bars[1].beats).toHaveLength(3);
    expect(sheet.bars[0].beats[0].tokens[0].text).toBe("Sol");
  });
});
