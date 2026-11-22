import * as webpush from "web-push";
import { query } from "./db";
import { buildPayload, type PushMessage, type PushSubscriptionData } from "./pushRules";

let configured: boolean | null = null;

/** Prépare l'envoi avec les clés de .env.local ; false si elles n'ont pas été générées. */
export function pushReady(): boolean {
  if (configured === null) {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    configured = false;
    if (publicKey && privateKey && subject) {
      try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        configured = true;
      } catch (err) {
        // Clé ou adresse de contact mal formée : les notifications restent désactivées, le reste fonctionne.
        console.error("[push] configuration invalide :", err instanceof Error ? err.message : err);
      }
    }
  }
  return configured;
}

export const pushPublicKey = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

interface Row {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type Delivery = "sent" | "expired" | "failed";

/**
 * Envoie une notification à un appareil. Le message est chiffré pour cet
 * appareil seul : le service de notification qui le transporte ne peut pas le lire.
 */
export async function deliver(subscription: PushSubscriptionData, message: PushMessage): Promise<Delivery> {
  if (!pushReady()) return "failed";
  try {
    // `timeout` : un service de notification qui ne répond pas ne doit pas retenir la requête indéfiniment.
    await webpush.sendNotification(subscription, buildPayload(message), { TTL: 24 * 3600, urgency: "high", timeout: 10_000 });
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404 ou 410 : l'appareil s'est désabonné ou a effacé ses données.
    if (status === 404 || status === 410) return "expired";
    console.error("[push]", status ?? err);
    return "failed";
  }
}

async function deliverToRows(rows: Row[], message: PushMessage): Promise<number> {
  const results = await Promise.all(
    rows.map(async (row) => {
      const result = await deliver({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, message);
      if (result === "expired") await query("DELETE FROM push_subscriptions WHERE endpoint = $1", [row.endpoint]);
      else if (result === "sent") await query("UPDATE push_subscriptions SET last_used_at = now() WHERE endpoint = $1", [row.endpoint]);
      return result;
    }),
  );
  return results.filter((r) => r === "sent").length;
}

/**
 * Prévient tous les appareils d'un compte, sauf éventuellement celui qui est à
 * l'origine de l'événement (inutile de le notifier de ce qu'il vient de faire).
 * Renvoie le nombre d'appareils notifiés.
 */
export async function notifyUser(userId: string, message: PushMessage, exceptEndpoint?: string): Promise<number> {
  if (!pushReady()) return 0;
  const rows = await query<Row>("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1 AND endpoint IS DISTINCT FROM $2", [
    userId,
    exceptEndpoint ?? null,
  ]);
  return deliverToRows(rows, message);
}

/** Notifie un appareil précis, s'il est bien abonné. */
export async function notifyEndpoint(endpoint: string, message: PushMessage): Promise<Delivery | "unknown"> {
  const rows = await query<Row>("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
  if (rows.length === 0) return "unknown";
  const sent = await deliverToRows(rows, message);
  if (sent === 1) return "sent";
  const still = await query("SELECT 1 FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
  return still.length === 0 ? "expired" : "failed";
}
