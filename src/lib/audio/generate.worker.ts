// Calcul d'une piste du générateur, hors de la page : la page reste fluide et la musique continue
// pendant le calcul. Plusieurs de ces travailleurs calculent les pistes en parallèle (stemClient.ts).
import { renderTrackStem, renderVoiceStem, type SongFrame, type Track } from "./synth";
import type { MelodyNote } from "./tune";
import type { InstrumentId } from "./voices";

export type StemRequest =
  | { id: number; kind: "track"; frame: SongFrame; track: Track; seed: number }
  | { id: number; kind: "voice"; frame: SongFrame; instrument: InstrumentId; notes: MelodyNote[]; seed: number };

export type StemResponse = { id: number; samples: Float32Array } | { id: number; error: string };

interface WorkerScope {
  onmessage: ((event: MessageEvent<StemRequest>) => void) | null;
  postMessage(message: StemResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const request = event.data;
  try {
    const samples =
      request.kind === "track"
        ? renderTrackStem(request.frame, request.track, request.seed)
        : renderVoiceStem(request.frame, request.instrument, request.notes, request.seed);
    // Le résultat est cédé à la page plutôt que copié.
    scope.postMessage({ id: request.id, samples }, [samples.buffer]);
  } catch (err) {
    scope.postMessage({ id: request.id, error: (err instanceof Error ? err.stack || err.message : String(err)) || "erreur inconnue" });
  }
};
