export interface Mic {
  ctx: AudioContext;
  analyser: AnalyserNode;
  stream: MediaStream;
  /** Coupe le micro et libère le contexte audio. */
  close(): void;
}

function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Le micro est bloqué pour ce site. Autorisez-le dans les réglages du navigateur, puis réessayez.";
  }
  if (name === "NotFoundError") return "Aucun micro détecté sur cet appareil.";
  if (name === "NotReadableError") return "Le micro est déjà utilisé par une autre application.";
  return "Le micro n'a pas pu démarrer. Réessayez.";
}

/**
 * Ouvre le micro et le branche sur un analyseur. À appeler depuis un clic.
 * En cas d'échec, l'erreur levée porte un message lisible par l'utilisateur.
 */
export async function openMic(fftSize = 8192): Promise<Mic> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Le micro n'est accessible que sur une connexion sécurisée : ouvrez l'application en https ou sur localhost.");
  }
  let stream: MediaStream;
  try {
    // Les traitements « voix » du navigateur déforment les notes : on les coupe.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (err) {
    throw new Error(micErrorMessage(err));
  }
  try {
    const ctx = new AudioContext();
    await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    ctx.createMediaStreamSource(stream).connect(analyser);
    return {
      ctx,
      analyser,
      stream,
      close() {
        stream.getTracks().forEach((track) => track.stop());
        void ctx.close();
      },
    };
  } catch (err) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error(micErrorMessage(err));
  }
}
