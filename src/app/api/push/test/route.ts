import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { APP_NAME } from "@/lib/app";
import { notifyEndpoint, pushReady } from "@/lib/push";
import { isPushEndpoint } from "@/lib/pushRules";
import { limited } from "@/lib/rateLimit";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Envoie une notification d'essai à l'appareil qui la demande (et à lui seul). */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("Origine de la requête refusée.", 403);
  if (!pushReady()) return fail("Les notifications ne sont pas configurées sur ce serveur.", 503);
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (!isPushEndpoint(body?.endpoint)) return fail("Abonnement invalide.", 400);
  if (limited(`push-test|${body.endpoint}`, 5, 60 * 1000)) return fail("Trop d'essais à la suite. Réessayez dans une minute.", 429);

  try {
    const result = await notifyEndpoint(body.endpoint, {
      title: `${APP_NAME} — notification d'essai`,
      body: "Les notifications fonctionnent sur cet appareil. Touchez pour ouvrir l'application.",
      url: "/app?onglet=account",
      tag: "essai",
    });
    if (result === "sent") return NextResponse.json({ ok: true });
    if (result === "unknown" || result === "expired") {
      return fail("Cet appareil n'est plus abonné. Désactivez puis réactivez les notifications.", 410);
    }
    return fail("Le service de notification n'a pas accepté l'envoi. Réessayez dans un instant.", 502);
  } catch (err) {
    console.error("[push]", err);
    return fail("La base de données ne répond pas.", 503);
  }
}
