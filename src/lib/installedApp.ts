// Ce qui distingue l'application installée (sa propre fenêtre, son icône) de la page ouverte dans un navigateur.

// Mêmes noms que dans public/sw.js, qui range là le fichier reçu par « Partager ».
const SHARED_CACHE = "twinschord-recu";
const SHARED_KEY = "/__recu";

/** Vrai dans l'application installée ; faux dans un onglet de navigateur. */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  // iPhone et iPad l'indiquent par une propriété à eux.
  if ((navigator as { standalone?: boolean }).standalone === true) return true;
  return ["standalone", "window-controls-overlay"].some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches);
}

/** Demande au système de ne pas effacer les fichiers du mode hors ligne quand la place manque. */
export function keepOfflineFiles(): void {
  if (!isInstalled()) return;
  void navigator.storage?.persist?.().catch(() => {});
}

/**
 * Le fichier envoyé à l'application par le menu « Partager » du téléphone, s'il y en a un.
 * Il n'est remis qu'une fois : le lire le retire.
 */
export async function takeSharedFile(): Promise<File | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(SHARED_CACHE);
    const response = await cache.match(SHARED_KEY);
    if (!response) return null;
    const blob = await response.blob();
    await cache.delete(SHARED_KEY);
    let name = "";
    try {
      name = decodeURIComponent(response.headers.get("X-Nom") ?? "");
    } catch {
      // Nom illisible : le fichier garde un nom par défaut.
    }
    return new File([blob], name || "Morceau partagé", { type: blob.type });
  } catch {
    return null;
  }
}

interface LaunchParams {
  files?: { getFile(): Promise<File> }[];
}

interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

/**
 * Fichiers ouverts avec l'application depuis l'ordinateur (« Ouvrir avec TwinsChord ») :
 * `handle` reçoit le premier. Sans effet là où le système ne le propose pas.
 */
export function onLaunchFile(handle: (file: File) => void): void {
  const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
  if (!queue) return;
  queue.setConsumer((params) => {
    const first = params.files?.[0];
    if (!first) return;
    first.getFile().then(handle, () => {});
  });
}
