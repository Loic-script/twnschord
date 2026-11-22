"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@/lib/api";
import { decodeToMono, runAnalysis } from "@/lib/audio/analyzeClient";
import type { NoteNaming } from "@/lib/audio/notes";
import type { Track } from "./App";
import Player from "./Player";

/** Où en est l'analyse d'un fichier. Tenu par App : l'analyse continue quand on change d'onglet. */
export type FilePhase =
  | { kind: "idle" }
  | { kind: "working"; stage: string; fraction: number | null }
  | { kind: "error"; message: string };

interface Props {
  phase: FilePhase;
  onPhase: (phase: FilePhase) => void;
  track: Track | null;
  naming: NoteNaming;
  user: User | null;
  online: boolean;
  /** Fichier remis par le système (« Ouvrir avec », « Partager ») : analysé dès son arrivée. */
  incoming: File | null;
  onIncomingTaken: () => void;
  onTrack: (track: Track | null) => void;
  onGoAccount: () => void;
}

export default function FileView({ phase, onPhase: setPhase, track, naming, user, online, incoming, onIncomingTaken, onTrack, onGoAccount }: Props) {
  const [drag, setDrag] = useState(false);
  const taken = useRef<File | null>(null);

  const analyze = async (file: File | undefined) => {
    // Une seule analyse à la fois : elles se partagent le même moteur.
    if (!file || phase.kind === "working") return;
    setPhase({ kind: "working", stage: file.type.startsWith("video/") ? "Extraction du son de la vidéo" : "Lecture du fichier", fraction: null });
    try {
      const decoded = await decodeToMono(file);
      const analysis = await runAnalysis(decoded.samples, decoded.sampleRate, (fraction, stage) =>
        setPhase({ kind: "working", stage, fraction }),
      );
      onTrack({
        id: Date.now(),
        title: file.name.replace(/\.[^.]+$/, "") || "Sans titre",
        analysis,
        audioUrl: URL.createObjectURL(file),
        savedId: null,
      });
      setPhase({ kind: "idle" });
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "L'analyse a échoué." });
    }
  };

  // Un fichier arrivé de l'extérieur est traité comme un fichier choisi ici — une seule fois.
  useEffect(() => {
    if (!incoming || taken.current === incoming) return;
    taken.current = incoming;
    onIncomingTaken();
    void analyze(incoming);
    // `analyze` et `onIncomingTaken` sont recréés à chaque rendu : seul l'arrivée d'un fichier doit relancer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  if (phase.kind === "working") {
    const percent = phase.fraction === null ? null : Math.round(phase.fraction * 100);
    return (
      <div className="progress" role="status">
        <p className="drop-title">Analyse en cours</p>
        <div className="progress-bar" data-busy={percent === null}>
          <i style={percent === null ? undefined : { width: `${percent}%` }} />
        </div>
        <div className="progress-text">
          <span>{phase.stage}…</span>
          <span>{percent === null ? "" : `${percent} %`}</span>
        </div>
        <p className="note">Tout le calcul se fait sur cet appareil. Un morceau de quatre minutes prend quelques secondes à une minute selon l&apos;appareil.</p>
      </div>
    );
  }

  if (track) {
    return (
      <Player
        key={track.id}
        track={track}
        naming={naming}
        user={user}
        online={online}
        onChange={onTrack}
        onClose={() => onTrack(null)}
        onGoAccount={onGoAccount}
      />
    );
  }

  return (
    <>
      <label
        className="drop"
        data-drag={drag}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void analyze(e.dataTransfer.files[0]);
        }}
      >
        <span className="drop-title">Choisir un morceau</span>
        <span className="note">
          Un fichier audio (MP3, WAV, M4A, OGG…) ou une vidéo (MP4, MOV, WebM…) dont seul le son est gardé, jusqu&apos;à
          20 minutes. Vous obtenez la grille d&apos;accords, le tempo, la tonalité et le solfa de la mélodie, à suivre
          pendant la lecture.
        </span>
        <span className="btn btn-primary" aria-hidden="true">
          Parcourir les fichiers
        </span>
        <input
          type="file"
          accept="audio/*,video/*,.mp3,.wav,.m4a,.ogg,.oga,.opus,.flac,.aac,.mp4,.m4v,.mov,.webm,.mkv,.3gp"
          className="sr-only"
          onChange={(e) => {
            void analyze(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {phase.kind === "error" && (
        <p className="alert" role="alert">
          {phase.message}
        </p>
      )}
      <p className="note">Le fichier reste sur cet appareil : il n&apos;est jamais envoyé sur Internet, même avec un compte.</p>
    </>
  );
}
