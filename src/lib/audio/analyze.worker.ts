import { analyzeAudio } from "./analyze";
import { pitchShift } from "./pitchShift";
import type { Analysis } from "./types";

export type WorkerRequest =
  | { id: number; kind: "analyze"; samples: Float32Array; sampleRate: number }
  | { id: number; kind: "shift"; samples: Float32Array; semitones: number };

export type WorkerResponse =
  | { id: number; type: "progress"; fraction: number; stage: string }
  | { id: number; type: "done"; analysis: Analysis }
  | { id: number; type: "shifted"; samples: Float32Array }
  | { id: number; type: "error"; message: string };

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = async (event) => {
  const request = event.data;
  const { id } = request;
  try {
    if (request.kind === "shift") {
      const samples = await pitchShift(request.samples, request.semitones, (fraction) =>
        scope.postMessage({ id, type: "progress", fraction, stage: "Transposition" }),
      );
      // Le résultat est cédé à la page plutôt que copié.
      scope.postMessage({ id, type: "shifted", samples }, [samples.buffer]);
    } else {
      const analysis = await analyzeAudio(request.samples, request.sampleRate, (fraction, stage) =>
        scope.postMessage({ id, type: "progress", fraction, stage }),
      );
      scope.postMessage({ id, type: "done", analysis });
    }
  } catch (err) {
    scope.postMessage({ id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
