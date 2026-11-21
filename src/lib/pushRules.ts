/**
 * Règles des notifications push, sans accès à la base ni au réseau
 * (donc testables seules) : quelles adresses d'appareil sont acceptées,
 * à quoi ressemble un abonnement valide, et ce que contient une notification.
 */

export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushMessage {
  title: string;
  body: string;
  /** Ce qui s'ouvre au clic : une adresse interne, par exemple "/?morceau=12". */
  url: string;
  /** Deux notifications de même étiquette se remplacent au lieu de s'empiler. */
  tag?: string;
}

// Services de notification des navigateurs. Le serveur n'envoie rien ailleurs : sans cette
// liste, un abonnement forgé pourrait lui faire appeler une adresse quelconque, y compris interne.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge sur Android, Brave…
  /^android\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/, // Firefox
  /^([a-z0-9-]+\.)*notify\.windows\.com$/, // Edge sous Windows
  /^([a-z0-9-]+\.)*push\.apple\.com$/, // Safari, iPhone et iPad
];

export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.port === "" && PUSH_HOSTS.some((host) => host.test(url.hostname));
}

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** Vérifie et recopie un abonnement reçu du navigateur ; null s'il n'est pas valide. */
export function parseSubscription(value: unknown): PushSubscriptionData | null {
  if (typeof value !== "object" || value === null) return null;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (!isPushEndpoint(endpoint) || typeof keys !== "object" || keys === null) return null;
  const { p256dh, auth } = keys;
  if (typeof p256dh !== "string" || typeof auth !== "string") return null;
  // Clé publique P-256 non compressée (65 octets) et secret de 16 octets, en base64 « URL ».
  if (!BASE64URL.test(p256dh) || !BASE64URL.test(auth) || p256dh.length < 80 || p256dh.length > 100 || auth.length < 20 || auth.length > 30) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/**
 * Texte envoyé à l'appareil. Les longueurs sont bornées (les services de
 * notification refusent au-delà de ~4 Ko) et l'adresse est forcément interne.
 */
export function buildPayload(message: PushMessage): string {
  const url = message.url.startsWith("/") && !message.url.startsWith("//") ? message.url : "/";
  return JSON.stringify({
    title: message.title.slice(0, 80),
    body: message.body.slice(0, 240),
    url: url.slice(0, 300),
    tag: message.tag?.slice(0, 60),
  });
}

/** Ce que l'application ouvre pour une adresse de notification. */
export type PushTarget = { kind: "piece"; id: string } | { kind: "tab"; tab: string } | { kind: "home" };

export function readTarget(href: string, origin: string): PushTarget {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return { kind: "home" };
  }
  if (url.origin !== origin) return { kind: "home" };
  const piece = url.searchParams.get("morceau");
  if (piece && /^\d{1,18}$/.test(piece)) return { kind: "piece", id: piece };
  const tab = url.searchParams.get("onglet");
  if (tab && /^[a-z]{2,12}$/.test(tab)) return { kind: "tab", tab };
  return { kind: "home" };
}
