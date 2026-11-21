import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { query } from "@/lib/db";
import { pushPublicKey, pushReady } from "@/lib/push";
import { isPushEndpoint, parseSubscription } from "@/lib/pushRules";
import { limited } from "@/lib/rateLimit";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const ipOf = (request: Request) => (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();

/** Ce dont le navigateur a besoin pour s'abonner : la clé publique du serveur. */
export async function GET() {
  return NextResponse.json({ enabled: pushReady(), publicKey: pushPublicKey() });
}

/**
 * Abonne un appareil, ou met à jour son abonnement. Il est rattaché au compte
 * connecté, s'il y en a un : rappeler cette route après une connexion ou une
 * déconnexion met ce rattachement à jour.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("Origine de la requête refusée.", 403);
  if (!pushReady()) return fail("Les notifications ne sont pas configurées sur ce serveur.", 503);
  if (limited(`push|${ipOf(request)}`, 30, 10 * 60 * 1000)) return fail("Trop de demandes. Réessayez dans quelques minutes.", 429);

  const body = (await request.json().catch(() => null)) as { subscription?: unknown } | null;
  const subscription = parseSubscription(body?.subscription);
  if (!subscription) return fail("Abonnement invalide.", 400);

  try {
    const user = await currentUser();
    await query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_id = EXCLUDED.user_id`,
      [subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, user?.id ?? null],
    );
    return NextResponse.json({ ok: true, account: Boolean(user) }, { status: 201 });
  } catch (err) {
    console.error("[push]", err);
    return fail("La base de données ne répond pas.", 503);
  }
}

/** Désabonne un appareil. */
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return fail("Origine de la requête refusée.", 403);
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (!isPushEndpoint(body?.endpoint)) return fail("Abonnement invalide.", 400);
  try {
    await query("DELETE FROM push_subscriptions WHERE endpoint = $1", [body.endpoint]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[push]", err);
    return fail("La base de données ne répond pas.", 503);
  }
}
