import { describe, expect, it } from "vitest";
import { analyzeAudio } from "./analyze";
import { PitchDetector } from "./pitch";
import { BASS_STYLES, DRUM_STYLES, PLAY_STYLES } from "./styles";
import {
  encodeWav,
  foldTail,
  heardChords,
  melodyNotes,
  transposeChord,
  parseChord,
  parseProgression,
  renderSong,
  chordLengths,
  mixStems,
  renderStems,
  stemsScale,
  voiceNotes,
  renderTrackStem,
  renderVoiceStem,
  songLayout,
  withChordBeats,
  type MelodyOptions,
  type SongOptions,
  type Track,
} from "./synth";
import { chordsKey, generateMelody, melodyToText, parseMelody } from "./tune";
import { nameChord } from "./chords";
import { INSTRUMENTS, renderNoteSample, type InstrumentId } from "./voices";

const chordsOf = (text: string) => parseProgression(text).chords;
const labels = (text: string) => chordsOf(text).map((c) => c.label);
const track = (instrument: Track["instrument"], style: string, octave = 0, volume = 1): Track => ({ instrument, style, octave, volume });
const melody = (over: Partial<MelodyOptions>): MelodyOptions => ({ mode: "manual", text: "", seed: 1, instrument: "flute", octave: 0, volume: 1, ...over });
const song = (over: Partial<SongOptions>): SongOptions => ({ chords: chordsOf("C G Am F"), tempo: 100, beatsPerChord: 4, tracks: [], sampleRate: 22050, ...over });

function peakOf(samples: Float32Array): { peak: number; finite: boolean } {
  let peak = 0;
  let finite = true;
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i])) finite = false;
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  return { peak, finite };
}

/** Hauteur (en note MIDI, avec décimales) mesurée au début du son. */
function pitchAt(samples: Float32Array, sampleRate: number, seconds = 0.05): number {
  const start = Math.round(seconds * sampleRate);
  const result = new PitchDetector(sampleRate, 8192, { maxFreq: 4000 }).detect(samples.subarray(start, start + 8192));
  expect(result).not.toBeNull();
  return 69 + 12 * Math.log2(result!.freq / 440);
}

describe("lecture des accords saisis", () => {
  it("lit les lettres, avec dièses, bémols et barres de mesure", () => {
    expect(labels("C G Am F")).toEqual(["C", "G", "Am", "F"]);
    expect(labels("Dm7 | G7 | Cmaj7, A7")).toEqual(["Dm7", "G7", "Cmaj7", "A7"]);
    expect(labels("F#m Bb Ebmaj7 C#m7b5")).toEqual(["F♯m", "B♭", "E♭maj7", "C♯m7♭5"]);
  });

  it("lit les noms Do Ré Mi", () => {
    expect(labels("Do Sol Lam Fa")).toEqual(["C", "G", "Am", "F"]);
    expect(labels("Rém7 Sol7 Domaj7 Sib Mib Fa#m")).toEqual(["Dm7", "G7", "Cmaj7", "B♭", "E♭", "F♯m"]);
  });

  it("ne confond pas lettres et noms latins", () => {
    expect(labels("Dm Fadd9 Em La7 Fa")).toEqual(["Dm", "Fadd9", "Em", "A7", "F"]);
  });

  it("distingue M (majeur) de m (mineur), accepte les minuscules", () => {
    expect(labels("CM7 Cm7 am")).toEqual(["Cmaj7", "Cm7", "Am"]);
  });

  it("lit la basse imposée et le signe de répétition", () => {
    expect(parseChord("C/E")).toMatchObject({ label: "C/E", root: 0, bass: 4 });
    expect(labels("Am % F %")).toEqual(["Am", "Am", "F", "F"]);
  });

  it("signale ce qu'il ne comprend pas, sans rien inventer", () => {
    const result = parseProgression("C H7 Xyz G");
    expect(result.chords.map((c) => c.label)).toEqual(["C", "G"]);
    expect(result.errors).toEqual(["H7", "Xyz"]);
  });
});

describe("justesse de chaque instrument", () => {
  // Un La tenu, joué seul à la mélodie : le détecteur de hauteur doit mesurer un La juste.
  for (const { id, name } of INSTRUMENTS) {
    it(name, () => {
      const rendered = renderSong(
        song({ chords: chordsOf("A"), tempo: 60, sampleRate: 44100, melody: melody({ text: "la4 - - -", instrument: id }) }),
      );
      const midi = pitchAt(rendered.samples, rendered.sampleRate);
      expect(Math.round(midi)).toBe(69);
      expect(Math.abs(midi - 69) * 100).toBeLessThan(6);
    });
  }
});

describe("notes du piano jouable", () => {
  it("chaque instrument donne une note juste, sans écrêtage, au même niveau du grave à l'aigu", () => {
    for (const { id } of INSTRUMENTS) {
      for (const midi of [48, 60, 72]) {
        const sample = renderNoteSample(id, midi, 44100);
        const { peak, finite } = peakOf(sample);
        expect(finite).toBe(true);
        expect(peak).toBeCloseTo(0.7, 3);
        const measured = pitchAt(sample, 44100);
        expect(Math.round(measured)).toBe(midi);
        expect(Math.abs(measured - midi) * 100).toBeLessThan(6);
      }
    }
  });

  it("un son entretenu dure plus longtemps qu'un son qui s'éteint", () => {
    expect(renderNoteSample("organ", 60).length).toBeGreaterThan(renderNoteSample("piano", 60).length);
    // Un piano s'éteint de lui-même : la fin de la note est bien plus faible que le début.
    const piano = renderNoteSample("piano", 60);
    const loud = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += piano[i] * piano[i];
      return sum;
    };
    expect(loud(100000, 120000)).toBeLessThan(loud(2000, 22000) * 0.2);
  });

  it("nomme l'accord joué, renversements compris", () => {
    expect(nameChord([60, 64, 67])).toBe("C");
    expect(nameChord([57, 60, 64])).toBe("Am");
    expect(nameChord([55, 59, 62, 65])).toBe("G7");
    expect(nameChord([48, 60, 64, 67, 72])).toBe("C"); // notes redoublées à l'octave
    expect(nameChord([64, 67, 72])).toBe("C/E"); // premier renversement
    expect(nameChord([67, 72, 76])).toBe("C/G");
    expect(nameChord([60, 67])).toBe("C5");
    expect(nameChord([60, 65, 67])).toBe("Csus4");
    expect(nameChord([60])).toBeNull(); // une seule note
    expect(nameChord([60, 61, 62])).toBeNull(); // pas un accord connu
    expect(nameChord([])).toBeNull();
  });
});

describe("guitare basse", () => {
  // La fondamentale d'un accord, tenue seule : note attendue dans la tessiture d'une basse quatre cordes.
  const cases: [string, number][] = [
    ["E", 28], // Mi grave, corde à vide (41 Hz)
    ["G", 31],
    ["A", 33],
    ["C", 36],
    ["D", 38],
    ["Eb", 39],
  ];
  const bassNote = (chord: string, octave = 0) =>
    renderSong(song({ chords: chordsOf(chord), tempo: 60, sampleRate: 44100, tracks: [track("bass", "root", octave)] })).samples;
  const measure = (samples: Float32Array) => {
    const start = Math.round(0.08 * 44100);
    const result = new PitchDetector(44100, 8192, { minFreq: 35, maxFreq: 1000 }).detect(samples.subarray(start, start + 8192));
    expect(result).not.toBeNull();
    return 69 + 12 * Math.log2(result!.freq / 440);
  };

  for (const [chord, midi] of cases) {
    it(`${chord} : juste, dans le grave de l'instrument`, () => {
      const measured = measure(bassNote(chord));
      expect(Math.round(measured)).toBe(midi);
      // Les cordes filées sonnent un rien au-dessus de la note théorique : on tolère 10 cents.
      expect(Math.abs(measured - midi) * 100).toBeLessThan(10);
    });
  }

  it("le timbre change d'une note à l'autre, comme sur une vraie corde", () => {
    // La à vide et Do trois cases plus haut sur la même corde : le spectre n'est pas une simple copie transposée.
    const spectrum = (samples: Float32Array, f0: number) =>
      [1, 2, 3, 4, 5, 6].map((h) => {
        let re = 0;
        let im = 0;
        const n = 16384;
        for (let i = 0; i < n; i++) {
          const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
          const s = samples[4000 + i] * w;
          re += s * Math.cos((2 * Math.PI * f0 * h * i) / 44100);
          im += s * Math.sin((2 * Math.PI * f0 * h * i) / 44100);
        }
        return Math.hypot(re, im);
      });
    const open = spectrum(bassNote("A"), 55);
    const fretted = spectrum(bassNote("C"), 65.41);
    const shape = (s: number[]) => s.map((v) => v / s[0]);
    const difference = shape(open).reduce((sum, v, i) => sum + Math.abs(v - shape(fretted)[i]), 0);
    expect(difference).toBeGreaterThan(0.2);
  });

  it("reste propre : pas d'écrêtage, pas de valeur aberrante", () => {
    const { peak, finite } = peakOf(renderSong(song({ tracks: [track("bass", "funk", 0, 1.5)] })).samples);
    expect(finite).toBe(true);
    expect(peak).toBeLessThanOrEqual(0.9);
  });
});

describe("changement de tonalité", () => {
  it("renomme les accords, basse imposée comprise", () => {
    const up = (text: string, n: number) => chordsOf(text).map((c) => transposeChord(c, n).label);
    expect(up("C G Am F", 2)).toEqual(["D", "A", "Bm", "G"]);
    expect(up("C G Am F", -3)).toEqual(["A", "E", "F♯m", "D"]);
    expect(up("Dm7 G7 Cmaj7 C/E", 1)).toEqual(["E♭m7", "A♭7", "C♯maj7", "C♯/F"]);
    expect(up("F#m7b5 Bb", 12)).toEqual(["F♯m7♭5", "B♭"]);
    expect(heardChords(chordsOf("C"), 0)[0].label).toBe("C");
  });

  it("déplace la tonalité reconnue", () => {
    expect(chordsKey(heardChords(chordsOf("C G Am F"), 2))).toEqual({ tonic: 2, mode: "major" });
    expect(chordsKey(heardChords(chordsOf("Am Dm E7 Am"), -2))).toEqual({ tonic: 7, mode: "minor" });
  });

  it("monte la basse avec les accords", () => {
    const root = (transpose: number) => {
      const s = renderSong(song({ chords: chordsOf("A"), tempo: 60, sampleRate: 44100, transpose, tracks: [track("bass", "root")] })).samples;
      const start = Math.round(0.08 * 44100);
      const result = new PitchDetector(44100, 8192, { minFreq: 35, maxFreq: 1000 }).detect(s.subarray(start, start + 8192));
      return Math.round(69 + 12 * Math.log2(result!.freq / 440));
    };
    expect(root(0)).toBe(33); // La
    expect(root(3)).toBe(36); // Do
    expect(root(-2)).toBe(31); // Sol
  });

  it("décale la mélodie du même nombre de demi-tons, sans changer son dessin", () => {
    for (const mode of ["auto", "manual"] as const) {
      const notes = (transpose: number) => melodyNotes(song({ transpose, melody: melody({ mode, seed: 5, text: "do mi sol.la d r" }) })).notes;
      expect(notes(4)).toEqual(notes(0).map((n) => ({ ...n, midi: n.midi + 4 })));
      expect(notes(-5)).toEqual(notes(0).map((n) => ({ ...n, midi: n.midi - 5 })));
    }
  });

  it("le son retrouvé par l'analyseur est bien dans la nouvelle tonalité", async () => {
    const rendered = renderSong(song({ chords: chordsOf("C G Am F C G Am F"), transpose: 2, tracks: [track("piano", "block")] }));
    const analysis = await analyzeAudio(rendered.samples, rendered.sampleRate);
    expect(analysis.key).toEqual({ tonic: 2, mode: "major" });
    expect(analysis.beatChords.slice(0, 16).filter((c) => c === "D" || c === "A" || c === "Bm" || c === "G").length).toBeGreaterThan(13);
  }, 60000);
});

describe("octave et volume", () => {
  const la = (octave: number, instrument: InstrumentId = "organ") =>
    renderSong(song({ chords: chordsOf("A"), tempo: 60, sampleRate: 44100, melody: melody({ text: "la4 - - -", instrument, octave }) }));

  it("l'octave écrite dans la note (la4) n'est pas déplacée par le réglage d'octave", () => {
    expect(Math.round(pitchAt(la(1).samples, 44100))).toBe(69);
  });

  it("monter ou descendre l'octave d'une mélodie la déplace de 12 demi-tons", () => {
    const at = (octave: number) =>
      Math.round(
        pitchAt(renderSong(song({ chords: chordsOf("A"), tempo: 60, sampleRate: 44100, melody: melody({ text: "la - - -", instrument: "organ", octave }) })).samples, 44100),
      );
    expect(at(0)).toBe(81);
    expect(at(-1)).toBe(69);
    expect(at(-2)).toBe(57);
  });

  it("monter l'octave d'une piste d'accompagnement monte ses notes", () => {
    const at = (octave: number) =>
      pitchAt(renderSong(song({ chords: chordsOf("A5"), tempo: 60, sampleRate: 44100, tracks: [track("bass", "root", octave)] })).samples, 44100, 0.1);
    expect(Math.round(at(1) - at(0))).toBe(12);
  });

  it("une piste à volume zéro ne s'entend pas", () => {
    const alone = renderSong(song({ tracks: [track("piano", "pop")] }));
    const withMuted = renderSong(song({ tracks: [track("piano", "pop"), track("drums", "rock", 0, 0)] }));
    expect(Array.from(withMuted.samples.subarray(0, 4000))).toEqual(Array.from(alone.samples.subarray(0, 4000)));
    expect(peakOf(renderSong(song({ tracks: [track("piano", "pop", 0, 0)] })).samples).peak).toBe(0);
  });

  it("baisser le volume d'une piste la fait reculer dans le mélange", () => {
    // Batterie seule en repère : ajouter un piano très doux change peu le signal, un piano fort le change beaucoup.
    const energy = (volume: number) => {
      const s = renderSong(song({ tracks: [track("drums", "pop"), track("organ", "sustain", 0, volume)] })).samples;
      let sum = 0;
      for (let i = 0; i < s.length; i++) sum += s[i] * s[i];
      return sum;
    };
    expect(energy(1.5)).toBeGreaterThan(energy(0.2) * 1.5);
  });
});

describe("tous les types se jouent", () => {
  const check = (tracks: Track[]) => {
    const { peak, finite } = peakOf(renderSong(song({ chords: chordsOf("Dm7 G7"), tracks })).samples);
    expect(finite).toBe(true);
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(0.9);
  };

  it(`${PLAY_STYLES.length} jeux, sur chaque famille d'instrument`, () => {
    expect(PLAY_STYLES.length).toBeGreaterThanOrEqual(10);
    for (const style of PLAY_STYLES) for (const id of ["piano", "guitar", "strings"] as const) check([track(id, style.id)]);
  });

  it("chaque instrument, plaqué", () => {
    expect(INSTRUMENTS.length).toBeGreaterThanOrEqual(10);
    for (const { id } of INSTRUMENTS) check([track(id, "block")]);
  });

  it(`${DRUM_STYLES.length} rythmes de batterie`, () => {
    expect(DRUM_STYLES.length).toBe(10);
    for (const style of DRUM_STYLES) check([track("drums", style.id)]);
  });

  it(`${BASS_STYLES.length} lignes de basse`, () => {
    expect(BASS_STYLES.length).toBe(10);
    for (const style of BASS_STYLES) check([track("bass", style.id)]);
  });

  it("deux temps par accord", () => {
    for (const style of PLAY_STYLES) check([track("piano", style.id), track("bass", "walking"), track("drums", "funk")]);
    expect(renderSong(song({ beatsPerChord: 2, tempo: 120 })).chordDuration).toBeCloseTo(1, 6);
  });
});

describe("le son généré correspond aux accords demandés", () => {
  const chords = chordsOf("C G Am F C G Am F");
  const expected = chords.map((c) => c.label);
  const cases: [string, Track[]][] = [
    ["piano plaqué", [track("piano", "block")]],
    ["piano pop, basse et batterie pop", [track("piano", "pop"), track("bass", "pop"), track("drums", "pop")]],
    ["guitare grattée, basse et batterie rock", [track("guitar", "strum"), track("bass", "rock"), track("drums", "rock")]],
    ["orgue cantique, basse tenue", [track("organ", "hymn"), track("bass", "root")]],
    ["cordes tenues, batterie ballade", [track("strings", "sustain"), track("drums", "ballad")]],
    ["piano électrique bossa, basse et batterie bossa", [track("epiano", "bossa"), track("bass", "bossa"), track("drums", "bossa")]],
    ["piano gospel, orgue tenu, batterie gospel", [track("piano", "gospel"), track("organ", "sustain"), track("drums", "gospel")]],
    [
      "cinq pistes",
      [track("piano", "pop"), track("nylon", "arpeggio"), track("strings", "sustain"), track("bass", "alternate"), track("drums", "disco")],
    ],
  ];

  for (const [name, tracks] of cases) {
    it(name, async () => {
      const rendered = renderSong(song({ chords, tracks }));
      expect(rendered.loopLength).toBe(Math.round(8 * 2.4 * 22050));
      // On repasse le son dans l'analyseur de l'application.
      const analysis = await analyzeAudio(rendered.samples, rendered.sampleRate);
      const rootOf = (label: string) => /^[A-G][♯♭]?/.exec(label)?.[0] ?? "";
      let exact = 0;
      let sameRoot = 0;
      let total = 0;
      analysis.beats.forEach((t, i) => {
        const index = Math.floor((t + 0.3) / rendered.chordDuration);
        if (index >= expected.length) return;
        total++;
        if (analysis.beatChords[i] === expected[index]) exact++;
        if (rootOf(analysis.beatChords[i]) === rootOf(expected[index])) sameRoot++;
      });
      // La fondamentale doit être retrouvée presque partout. La couleur exacte l'est un peu moins :
      // avec une basse forte, ses harmoniques font parfois lire « A7 » là où l'on joue « Am »
      // (limite connue de l'analyseur, pas du son généré).
      const detail = `tempo ${analysis.tempo} — ${analysis.beatChords.join(" ")}`;
      expect(sameRoot / total, detail).toBeGreaterThan(0.9);
      expect(exact / total, detail).toBeGreaterThan(0.7);
      expect(Math.abs(analysis.tuningCents)).toBeLessThan(10);
    }, 60000);
  }
});

describe("mélodie écrite à la main", () => {
  it("lit Do Ré Mi, les lettres, les altérations et les marques d'octave", () => {
    const { notes, errors } = parseMelody("do ré mi fa# Sib C E' sol,", 0);
    expect(errors).toEqual([]);
    expect(notes.map((n) => n.midi)).toEqual([72, 74, 76, 78, 82, 72, 88, 67]);
    expect(notes.map((n) => n.at)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("lit le solfa à do mobile", () => {
    // En Sol majeur, do = Sol.
    expect(parseMelody("d r m f s l t d'", 7).notes.map((n) => n.midi % 12)).toEqual([7, 9, 11, 0, 2, 4, 6, 7]);
    expect(parseMelody("d r m", 0).notes.map((n) => n.midi)).toEqual([72, 74, 76]);
  });

  it("gère les tenues, les silences et les temps divisés", () => {
    const { notes, beats } = parseMelody("do - ré.mi _ fa.-.sol.la | si._", 0);
    expect(beats).toBe(6);
    expect(notes).toEqual([
      { at: 0, dur: 2, midi: 72 },
      { at: 2, dur: 0.5, midi: 74 },
      { at: 2.5, dur: 0.5, midi: 76 },
      { at: 4, dur: 0.5, midi: 77 },
      { at: 4.5, dur: 0.25, midi: 79 },
      { at: 4.75, dur: 0.25, midi: 81 },
      { at: 5, dur: 0.5, midi: 83 },
    ]);
  });

  it("signale les notes qu'il ne comprend pas", () => {
    expect(parseMelody("do zut mi h", 0).errors).toEqual(["zut", "h"]);
  });

  it("répète une mélodie courte sur toute la suite d'accords", () => {
    const { notes } = melodyNotes(song({ melody: melody({ text: "do mi" }) }));
    expect(notes).toHaveLength(16);
    expect(notes[15]).toEqual({ at: 15, dur: 1, midi: 76 });
  });
});

describe("mélodie générée d'après les accords", () => {
  const chords = chordsOf("C G Am F");

  it("trouve la tonalité de la suite d'accords", () => {
    expect(chordsKey(chords)).toEqual({ tonic: 0, mode: "major" });
    expect(chordsKey(chordsOf("Am Dm E7 Am"))).toEqual({ tonic: 9, mode: "minor" });
  });

  it("donne la même mélodie pour la même graine, une autre pour une autre graine", () => {
    expect(generateMelody(chords, 4, 3)).toEqual(generateMelody(chords, 4, 3));
    expect(generateMelody(chords, 4, 3)).not.toEqual(generateMelody(chords, 4, 4));
  });

  it("reste dans la gamme, couvre tout le morceau et finit sur la fondamentale", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const notes = generateMelody(chords, 4, seed);
      const scale = [0, 2, 4, 5, 7, 9, 11];
      for (const n of notes) {
        expect(scale).toContain(n.midi % 12);
        expect(n.midi).toBeGreaterThanOrEqual(67);
        expect(n.midi).toBeLessThanOrEqual(84);
      }
      expect(notes.reduce((sum, n) => sum + n.dur, 0)).toBeCloseTo(16, 6);
      expect(notes[notes.length - 1].midi % 12).toBe(5); // Fa, fondamentale du dernier accord
    }
  });

  it("joue une note de l'accord à chaque début de demi-mesure", () => {
    const notes = generateMelody(chords, 4, 7);
    const tones = [[0, 4, 7], [7, 11, 2], [9, 0, 4], [5, 9, 0]];
    for (const n of notes) if (n.at % 2 === 0) expect(tones[Math.floor(n.at / 4)]).toContain(n.midi % 12);
  });

  it("s'écrit en toutes notes et se relit à l'identique", () => {
    for (const naming of ["latin", "letter"] as const) {
      for (let seed = 1; seed <= 10; seed++) {
        const notes = generateMelody(chords, 4, seed);
        const text = melodyToText(notes, 16, naming);
        const back = parseMelody(text, 0);
        expect(back.errors).toEqual([]);
        expect(back.notes).toEqual(notes);
      }
    }
  });

  it("s'entend dans le son : la mélodie change le rendu", () => {
    const without = renderSong(song({ tracks: [track("piano", "block")] }));
    const withMelody = renderSong(song({ tracks: [track("piano", "block")], melody: melody({ mode: "auto", seed: 2 }) }));
    expect(Array.from(withMelody.samples.subarray(0, 4000))).not.toEqual(Array.from(without.samples.subarray(0, 4000)));
  });
});

describe("boucle et export", () => {
  const options = song({ chords: chordsOf("Am F"), tempo: 120, beatsPerChord: 2, tracks: [track("guitar", "strum"), track("bass", "pop"), track("drums", "pop")] });
  const rendered = renderSong(options);

  it("dure deux temps par accord quand on le demande", () => {
    expect(rendered.chordDuration).toBeCloseTo(1, 6);
    expect(rendered.loopLength).toBe(2 * 22050);
  });

  it("replie la résonance finale sur le début pour boucler sans coupure", () => {
    const loop = foldTail(rendered.samples, rendered.loopLength);
    expect(loop.length).toBe(rendered.loopLength);
    expect(peakOf(loop).peak).toBeLessThanOrEqual(0.98);
  });

  it("produit un fichier WAV valide", () => {
    const wav = new DataView(encodeWav(rendered.samples, rendered.sampleRate));
    const tag = (offset: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => wav.getUint8(offset + i)));
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(wav.getUint32(24, true)).toBe(22050);
    expect(wav.byteLength).toBe(44 + rendered.samples.length * 2);
  });

  it("donne exactement le même son à chaque rendu", () => {
    expect(Array.from(renderSong(options).samples.subarray(0, 2000))).toEqual(Array.from(rendered.samples.subarray(0, 2000)));
  });
});

describe("durée de chaque accord et mesure", () => {
  it("lit la durée propre d'un accord, écrite « :n », et garde sa position dans le texte", () => {
    const text = "C G:2 Do:3 %:1 Am";
    const parsed = parseProgression(text);
    expect(parsed.chords.map((c) => c.label)).toEqual(["C", "G", "C", "C", "Am"]);
    expect(parsed.chords.map((c) => c.beats)).toEqual([undefined, 2, 3, 1, undefined]);
    expect(parsed.spans.map(([a, b]) => text.slice(a, b))).toEqual(["C", "G:2", "Do:3", "%:1", "Am"]);
    expect(parsed.errors).toEqual([]);
    // « % » répète l'accord, pas sa durée.
    expect(parseProgression("G:2 %").chords.map((c) => c.beats)).toEqual([2, undefined]);
    // Durée bornée de 1 à 16 temps ; « :0 » vaut 1.
    expect(parseProgression("C:0 G:99").chords.map((c) => c.beats)).toEqual([1, 16]);
  });

  it("réécrit la durée d'un accord dans le texte, ou la retire", () => {
    const text = "C  G:2 Am | F";
    const { spans } = parseProgression(text);
    expect(withChordBeats(text, spans[2], 3)).toBe("C  G:2 Am:3 | F");
    expect(withChordBeats(text, spans[1], 4)).toBe("C  G:4 Am | F");
    expect(withChordBeats(text, spans[1], null)).toBe("C  G Am | F");
  });

  it("chaque accord dure sa propre durée, ou la durée commune", () => {
    const chords = chordsOf("C G:2 Am F:1");
    expect(chordLengths(chords, 4)).toEqual([4, 2, 4, 1]);
    expect(chordLengths(chords, 3)).toEqual([3, 2, 3, 1]);
    const rendered = renderSong(song({ chords, tempo: 120, tracks: [track("piano", "pop")] }));
    // 11 temps à 120 bpm = 5,5 s ; chaque accord commence où finit le précédent.
    expect(rendered.loopLength).toBe(Math.round(5.5 * 22050));
    expect(rendered.chordStarts).toEqual([0, 2, 3, 5]);
  });

  for (const [meter, beatsPerBar] of [["3/4", 3], ["6/8", 6], ["5/4", 5], ["2/4", 2], ["1/4", 1], ["12/8", 12]] as const) {
    it(`en ${meter}, tout se joue, sans saturation, et la boucle dure le bon nombre de temps`, () => {
      const tracks = [track("piano", "pop"), track("guitar", "strum"), track("bass", "walking"), track("drums", "rock")];
      const rendered = renderSong(song({ chords: chordsOf("C G Am F"), tempo: 120, beatsPerChord: beatsPerBar, beatsPerBar, tracks, melody: melody({ mode: "auto", seed: 3 }) }));
      expect(rendered.loopLength).toBe(Math.round(4 * beatsPerBar * 0.5 * 22050));
      const { peak, finite } = peakOf(rendered.samples);
      expect(finite).toBe(true);
      expect(peak).toBeGreaterThan(0.1);
      expect(peak).toBeLessThanOrEqual(0.9);
    });
  }

  it("en 3/4, rien ne sonne dans un temps qui n'existe pas : la boucle se termine avec la dernière mesure", () => {
    // Batterie seule : chaque mesure de 3 temps ne reprend que les coups des 3 premiers temps du motif.
    const rendered = renderSong(song({ chords: chordsOf("C"), tempo: 60, beatsPerChord: 3, beatsPerBar: 3, sampleRate: 22050, tracks: [track("drums", "pop")] }));
    expect(rendered.loopLength).toBe(3 * 22050);
  });

  it("la mélodie générée couvre exactement chaque accord, même de durée impaire", () => {
    const chords = chordsOf("C G:3 Am:1 F");
    const lengths = chordLengths(chords, 4);
    const notes = generateMelody(chords, lengths, 5);
    const total = lengths.reduce((a, b) => a + b, 0);
    const end = Math.max(...notes.map((n) => n.at + n.dur));
    expect(end).toBeCloseTo(total, 6);
    // Aucune note ne chevauche la frontière entre deux accords.
    const bounds = [4, 7, 8];
    for (const note of notes) for (const b of bounds) expect(note.at < b - 1e-9 && note.at + note.dur > b + 1e-9).toBe(false);
  });

  it("le texte de la mélodie place une barre à chaque mesure", () => {
    const chords = chordsOf("C G");
    const text = melodyToText(generateMelody(chords, 3, 2), 6, "latin", undefined, 3);
    expect(text.split("|").length).toBe(2);
    expect(text.split("|")[0].trim().split(" ").length).toBe(3);
  });
});

describe("pistes séparées, pour le mélange en direct", () => {
  const tracks = [track("piano", "pop", 0, 0.5), track("bass", "walking", 0, 1.5), track("drums", "rock")];
  const options = song({ chords: chordsOf("C G:2 Am F"), tracks, melody: melody({ mode: "auto", seed: 4 }) });
  const stems = renderStems(options);

  it("une piste par instrument et une par voix, toutes de la même longueur", () => {
    expect(stems.stems.length).toBe(4);
    expect(new Set(stems.stems.map((s) => s.length)).size).toBe(1);
    expect(stems.loopLength).toBe(renderSong(options).loopLength);
    expect(stems.chordStarts).toEqual(renderSong(options).chordStarts);
  });

  it("mélangées avec leur volume, elles redonnent exactement le morceau complet", () => {
    const whole = renderSong(options).samples;
    const mixed = mixStems(stems.stems, [0.5, 1.5, 1, 1]);
    let worst = 0;
    for (let i = 0; i < whole.length; i++) worst = Math.max(worst, Math.abs(whole[i] - mixed[i]));
    expect(worst).toBeLessThan(1e-5);
  });

  it("une piste muette ne s'entend plus, les autres gardent leur niveau", () => {
    const scale = stemsScale(stems.stems);
    const all = mixStems(stems.stems, [1, 1, 1, 1], scale);
    const noDrums = mixStems(stems.stems, [1, 1, 0, 1], scale);
    const onlyDrums = mixStems(stems.stems, [0, 0, 1, 0], scale);
    let worst = 0;
    for (let i = 0; i < all.length; i++) worst = Math.max(worst, Math.abs(all[i] - noDrums[i] - onlyDrums[i]));
    expect(worst).toBeLessThan(1e-5);
    expect(peakOf(all).peak).toBeCloseTo(0.89, 5);
  });
});

describe("voix qui accompagnent la mélodie", () => {
  const chords = chordsOf("C F G C");
  const voice = (over: Partial<{ mode: "harmony" | "manual"; text: string; octave: number; volume: number }>) => ({ mode: "harmony" as const, text: "", instrument: "strings" as const, octave: 0, volume: 1, ...over });

  it("la 2ᵉ voix en harmonie chante une note de l'accord, d'une tierce à une sixte sous la 1ʳᵉ", () => {
    const options = song({ chords, melody: melody({ mode: "auto", seed: 3 }), voices: [voice({}), voice({})] });
    const [first, second, third] = voiceNotes(options);
    expect(second.notes.length).toBe(first.notes.length);
    const lengths = chordLengths(chords, 4);
    second.notes.forEach((note, k) => {
      const above = first.notes[k];
      const gap = above.midi - note.midi;
      const chord = chords[Math.min(chords.length - 1, Math.floor(note.at / lengths[0]))];
      const classes = chord.intervals.map((iv) => (chord.root + iv) % 12);
      expect(note.at).toBe(above.at);
      expect(gap === 12 || (gap >= 3 && gap <= 9 && classes.includes(((note.midi % 12) + 12) % 12))).toBe(true);
    });
    // La 3ᵉ voix se place sous la 2ᵉ.
    third.notes.forEach((note, k) => expect(note.midi).toBeLessThan(second.notes[k].midi));
  });

  it("une voix écrite à la main se lit comme la mélodie, et se répète sur tout le morceau", () => {
    const options = song({ chords, melody: melody({ mode: "manual", text: "mi - - -" }), voices: [voice({ mode: "manual", text: "do - sol -" })] });
    const [, written] = voiceNotes(options);
    expect(written.errors).toEqual([]);
    expect(written.notes.length).toBe(8);
    expect(written.notes[0].midi % 12).toBe(0);
    expect(written.notes[1].midi % 12).toBe(7);
  });

  it("jusqu'à 10 voix s'entendent, sans saturation", () => {
    const voices = Array.from({ length: 12 }, (_, k) => voice({ octave: k % 2 ? -1 : 0 }));
    const options = song({ chords, tracks: [track("piano", "block")], melody: melody({ mode: "auto", seed: 1 }), voices });
    const stems = renderStems(options);
    expect(stems.stems.length).toBe(1 + 10);
    const rendered = renderSong(options);
    const { peak, finite } = peakOf(rendered.samples);
    expect(finite).toBe(true);
    expect(peak).toBeLessThanOrEqual(0.9);
    const without = renderSong(song({ chords, tracks: [track("piano", "block")], melody: melody({ mode: "auto", seed: 1 }) }));
    expect(Array.from(rendered.samples.subarray(0, 8000))).not.toEqual(Array.from(without.samples.subarray(0, 8000)));
  });
});

describe("une piste calculée seule (calcul en parallèle, hors de la page)", () => {
  const frame = { chords: chordsOf("C G:2 Am F"), tempo: 120, beatsPerChord: 4, beatsPerBar: 4, transpose: 0, sampleRate: 22050 };

  it("même réglage, même aléa : exactement le même son ; elle a la longueur du morceau", () => {
    const a = renderTrackStem(frame, track("guitar", "strum"), 1234);
    const b = renderTrackStem(frame, track("guitar", "strum"), 1234);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a.length).toBe(songLayout(frame).length);
    expect(peakOf(a).peak).toBeGreaterThan(0.01);
  });

  it("une voix calculée seule joue ses notes, à la hauteur demandée", () => {
    const notes = [{ at: 0, dur: 2, midi: 69 }];
    const stem = renderVoiceStem({ ...frame, chords: chordsOf("A"), tempo: 60, sampleRate: 44100 }, "organ", notes, 7);
    expect(Math.abs(pitchAt(stem, 44100) - 69)).toBeLessThan(0.3);
  });

  it("le découpage du morceau est le même que celui du rendu complet", () => {
    const whole = renderSong(song({ chords: frame.chords, tempo: 120, tracks: [track("piano", "pop")] }));
    const layout = songLayout(frame);
    expect(layout.loopLength).toBe(whole.loopLength);
    expect(layout.chordStarts).toEqual(whole.chordStarts);
  });
});

describe("solfa en syllabes (do re mi fa so la ti)", () => {
  // En Do majeur (do = Do), à partir de la tessiture habituelle de la mélodie.
  const read = (text: string, doPc = 0) => parseMelody(text, doPc);
  const pcs = (text: string, doPc = 0) => read(text, doPc).notes.map((n) => ((n.midi % 12) + 12) % 12);

  it("lit la voix de la capture : so so so do ti ti ti re di di ti ti so", () => {
    const parsed = read("so so so do ti ti ti re di di ti ti so");
    expect(parsed.errors).toEqual([]);
    expect(parsed.notes.length).toBe(13);
    expect(pcs("so so so do ti ti ti re di di ti ti so")).toEqual([7, 7, 7, 0, 11, 11, 11, 2, 1, 1, 11, 11, 7]);
  });

  it("do mobile : en Sol majeur, do = Sol et so = Ré", () => {
    expect(pcs("do re mi fa so la ti", 7)).toEqual([7, 9, 11, 0, 2, 4, 6]);
  });

  it("dièses en « i », bémols en « a » ou « e », et marques d'octave", () => {
    expect(pcs("so di ri fi si li ra me se le te ta")).toEqual([7, 1, 3, 6, 8, 10, 1, 3, 6, 8, 10, 10]);
    // « do' » : une octave au-dessus de « do » ; « do, » : une octave au-dessous.
    const [so, doUp, doMid, doDown] = read("so do' do do,").notes.map((n) => n.midi);
    expect(so % 12).toBe(7);
    expect(doUp - doMid).toBe(12);
    expect(doMid - doDown).toBe(12);
  });

  it("un texte sans syllabe propre au solfa reste lu en noms fixes (sol, si = Si)", () => {
    expect(pcs("do ré mi fa sol la si", 7)).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it("une voix écrite en syllabes s'entend comme la mélodie", () => {
    const chords = chordsOf("C G Am F");
    const voice = { mode: "manual" as const, text: "so so so do ti ti ti re di di ti ti so", instrument: "piano" as const, octave: 0, volume: 1.3 };
    const options = song({ chords, melody: melody({ mode: "manual", text: "mi mi mi do re re re fa mi mi re re do" }), voices: [voice] });
    const [first, second] = voiceNotes(options);
    expect(second.errors).toEqual([]);
    expect(second.notes.length).toBe(first.notes.length);
    const stems = renderStems(options);
    expect(peakOf(stems.stems[1]).peak).toBeGreaterThan(0.05);
  });
});
