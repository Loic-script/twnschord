/**
 * Notifications push, côté navigateur : savoir si l'appareil peut en recevoir,
 * l'abonner, le désabonner. L'abonnement appartient au navigateur ; le serveur
 * n'en garde qu'une copie pour pouvoir lui écrire.
 */
import { isInstalled } from "./installedApp";

export type PushState =
  /** Ce navigateur ne sait pas recevoir de notifications. */
  | "unsupported"
  /** iPhone / iPad : possible seulement une fois l'application ajoutée à l'écran d'accueil. */
  | "needs-install"
  /** L'utilisateur a refusé les notifications pour ce site dans son navigateur. */
  | "blocked"
  | "off"
  | "on";

async function post(path: string, method: string, body: unknown): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const response = await fetch(path, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { ok: response.ok, status: response.status, error: data?.error };
  } catch {
    return { ok: false, status: 0, error: "Serveur injoignable. Vérifiez votre connexion Internet." };
  }
}

function support(): "ok" | "unsupported" | "needs-install" {
  if (typeof window === "undefined") return "unsupported";
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "ok";
  const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = isInstalled();
  return apple && !installed ? "needs-install" : "unsupported";
}

/** Le service worker de l'application, ou une erreur claire s'il ne démarre pas. */
async function registration(): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Le service de notification de l'application n'a pas démarré. Rechargez la page et réessayez.")), 8000),
  );
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

async function subscription(): Promise<PushSubscription | null> {
  if (support() !== "ok") return null;
  const existing = await navigator.serviceWorker.getRegistration();
  return existing ? existing.pushManager.getSubscription() : null;
}

export async function pushState(): Promise<PushState> {
  const s = support();
  if (s !== "ok") return s;
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" && (await subscription()) ? "on" : "off";
}

/** Adresse de l'abonnement de cet appareil, s'il est abonné. */
export async function pushEndpoint(): Promise<string | null> {
  try {
    return (await subscription())?.endpoint ?? null;
  } catch {
    return null;
  }
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Abonne cet appareil. À appeler depuis un clic : c'est à ce moment que le
 * navigateur demande à l'utilisateur s'il accepte les notifications.
 */
export async function enablePush(): Promise<PushState> {
  const s = support();
  if (s !== "ok") return s;
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "off";

  const config = (await fetch("/api/push", { credentials: "same-origin" }).then((r) => r.json())) as { enabled: boolean; publicKey: string };
  if (!config.enabled || !config.publicKey) throw new Error("Les notifications ne sont pas configurées sur ce serveur.");

  const reg = await registration();
  const options = { userVisibleOnly: true, applicationServerKey: keyBytes(config.publicKey) };
  let sub: PushSubscription;
  try {
    sub = await reg.pushManager.subscribe(options);
  } catch {
    // Un ancien abonnement, fait avec d'autres clés serveur, bloque le nouveau : on le retire et on recommence.
    try {
      await (await reg.pushManager.getSubscription())?.unsubscribe();
      sub = await reg.pushManager.subscribe(options);
    } catch {
      throw new Error(
        "Ce navigateur n'a pas pu s'abonner aux notifications. Vérifiez qu'elles sont autorisées pour ce site, que vous êtes connecté à Internet et que vous n'êtes pas en navigation privée, puis réessayez.",
      );
    }
  }
  const saved = await post("/api/push", "POST", { subscription: sub.toJSON() });
  if (!saved.ok) {
    await sub.unsubscribe();
    throw new Error(saved.error ?? "L'abonnement n'a pas pu être enregistré.");
  }
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const sub = await subscription();
  if (sub) {
    await post("/api/push", "DELETE", { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  return pushState();
}

/**
 * Redonne l'abonnement au serveur, qui le rattache au compte connecté (ou le
 * détache après une déconnexion). Sans effet si l'appareil n'est pas abonné.
 */
export async function syncPush(): Promise<void> {
  try {
    const sub = await subscription();
    if (sub && Notification.permission === "granted") await post("/api/push", "POST", { subscription: sub.toJSON() });
  } catch {
    // Sans réseau, le rattachement se fera à la prochaine occasion.
  }
}

/** Demande au serveur une notification d'essai pour cet appareil. */
export async function sendTestPush(): Promise<void> {
  const endpoint = await pushEndpoint();
  if (!endpoint) throw new Error("Cet appareil n'est pas abonné aux notifications.");
  const result = await post("/api/push/test", "POST", { endpoint });
  if (!result.ok) throw new Error(result.error ?? "La notification d'essai n'a pas pu partir.");
}
