import { describe, expect, it } from "vitest";
import { analyzeAudio } from "./analyze";
import { LiveAnalyzer } from "./live";
import { PitchDetector } from "./pitch";
import { pitchShift } from "./pitchShift";
import { parseProgression, renderSong } from "./synth";
import { transposeAnalysis, transposeLabel } from "./transpose";
import type { Analysis } from "./types";

const RATE = 44100;

function tone(freqs: number[], seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (const f of freqs) {
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE;
      out[i] += 0.2 * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t));
    }
  }
  return out;
}

const rms = (s: Float32Array, from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += s[i] * s[i];
  return Math.sqrt(sum / (to - from));
};

function pitchOf(samples: Float32Array): number {
  const start = Math.round(0.5 * RATE);
  const result = new PitchDetector(RATE, 8192).detect(samples.subarray(start, start + 8192));
  expect(result).not.toBeNull();
  return result!.freq;
}

describe("changement de hauteur d'un enregistrement", () => {
  for (const semitones of [-6, -3, -1, 1, 2, 5, 6]) {
    it(`${semitones > 0 ? "+" : ""}${semitones} demi-ton(s) : la note tombe juste`, async () => {
      const input = tone([440], 1.5);
      const output = await pitchShift(input, semitones);
      expect(output.length).toBe(input.length);
      const expected = 440 * Math.pow(2, semitones / 12);
      const cents = 1200 * Math.log2(pitchOf(output) / expected);
      expect(Math.abs(cents)).toBeLessThan(5);
      // Le niveau sonore est conservé.
      const ratio = rms(output, 20000, 50000) / rms(input, 20000, 50000);
      expect(ratio).toBeGreaterThan(0.8);
      expect(ratio).toBeLessThan(1.2);
    });
  }

  it("zéro demi-ton rend le son tel quel", async () => {
    const input = tone([330], 0.5);
    expect(Array.from(await pitchShift(input, 0))).toEqual(Array.from(input));
  });

  it("un accord transposé est reconnu dans la nouvelle tonalité", async () => {
    // Do majeur (Do4, Mi4, Sol4) monté de deux demi-tons → Ré majeur.
    const output = await pitchShift(tone([261.63, 329.63, 392.0], 2), 2);
    const live = new LiveAnalyzer(RATE);
    let result = live.process(output.subarray(20000, 20000 + live.bufferSize));
    for (let offset = 22048; offset + live.bufferSize <= 70000; offset += 2048) {
      result = live.process(output.subarray(offset, offset + live.bufferSize));
    }
    expect(result.chord?.label).toBe("D");
  });

  it("un morceau transposé garde son tempo et change de tonalité", async () => {
    const song = renderSong({
      chords: parseProgression("C G Am F C G Am F").chords,
      tempo: 100,
      beatsPerChord: 4,
      tracks: [
        { instrument: "piano", style: "block", octave: 0, volume: 1 },
        { instrument: "drums", style: "pop", octave: 0, volume: 1 },
      ],
      sampleRate: 22050,
    });
    const shifted = await pitchShift(song.samples, -3);
    const analysis = await analyzeAudio(shifted, song.sampleRate);
    expect(Math.abs(analysis.tempo - 100)).toBeLessThan(2);
    expect(analysis.key).toEqual({ tonic: 9, mode: "major" });
    const expected = ["A", "E", "F♯m", "D"];
    let right = 0;
    let total = 0;
    analysis.beats.forEach((t, i) => {
      const index = Math.floor((t + 0.3) / song.chordDuration);
      if (index >= 8) return;
      total++;
      if (analysis.beatChords[i] === expected[index % 4]) right++;
    });
    expect(right / total, analysis.beatChords.join(" ")).toBeGreaterThan(0.75);
  }, 60000);

  it("signale sa progression", async () => {
    const seen: number[] = [];
    await pitchShift(tone([440], 4), 3, (f) => seen.push(f));
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe(1);
  });
});

describe("analyse lue dans une autre tonalité", () => {
  const analysis: Analysis = {
    version: 1,
    duration: 2,
    tempo: 120,
    beats: [0, 0.5, 1, 1.5],
    beatsPerBar: 4,
    downbeat: 0,
    key: { tonic: 0, mode: "major" },
    tuningCents: 0,
    beatChords: ["C", "Am7", "N", "B♭maj7"],
    slotsPerBeat: 2,
    melody: [60, 60, null, 64, 67, null, null, 72],
    attacks: [1, 0, 0, 1, 1, 0, 0, 1],
  };

  it("renomme les accords", () => {
    expect(transposeLabel("Am7", 2)).toBe("Bm7");
    expect(transposeLabel("F♯m", -2)).toBe("Em");
    expect(transposeLabel("B", 1)).toBe("C");
    expect(transposeLabel("N", 5)).toBe("N");
  });

  it("décale tonalité, accords et mélodie, sans toucher au rythme", () => {
    const up = transposeAnalysis(analysis, 2);
    expect(up.key).toEqual({ tonic: 2, mode: "major" });
    expect(up.beatChords).toEqual(["D", "Bm7", "N", "Cmaj7"]);
    expect(up.melody).toEqual([62, 62, null, 66, 69, null, null, 74]);
    expect(up.beats).toBe(analysis.beats);
    expect(up.attacks).toBe(analysis.attacks);
  });

  it("ne modifie pas l'analyse d'origine, et zéro la rend telle quelle", () => {
    transposeAnalysis(analysis, -4);
    expect(analysis.beatChords[0]).toBe("C");
    expect(transposeAnalysis(analysis, 0)).toBe(analysis);
    expect(transposeAnalysis(transposeAnalysis(analysis, 5), -5).beatChords).toEqual(analysis.beatChords);
  });
});
