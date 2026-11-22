import { NextResponse } from "next/server";
import {
  createSession,
  currentUser,
  destroySession,
  hashPassword,
  isSecureRequest,
  sameOrigin,
  verifyPassword,
} from "@/lib/auth";
import { query } from "@/lib/db";
import { limited } from "@/lib/rateLimit";

type Context = { params: Promise<{ action: string }> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const unavailable = () => fail("La base de données ne répond pas. Vérifiez que PostgreSQL est démarré.", 503);

// Protection contre les robots et les essais en rafale.
const TEN_MINUTES = 10 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
/** Essais de connexion ou d'inscription pour une même adresse e-mail, par connexion. */
const MAX_PER_EMAIL = 10;
/** Essais toutes adresses confondues, par connexion (contre le balayage d'adresses). */
const MAX_PER_IP = 40;
/**
 * Essais pour une même adresse e-mail, toutes connexions confondues : l'adresse de la connexion vient
 * d'un en-tête que l'expéditeur peut falsifier si aucun serveur frontal ne le réécrit ; ce plafond-ci
 * borne donc les essais de mot de passe sur un compte quoi qu'il arrive.
 */
const MAX_PER_ACCOUNT = 30;
/** Comptes créés par connexion et par heure. */
const MAX_REGISTRATIONS = 10;
/** Une personne met plus de temps que cela à remplir le formulaire d'inscription. */
const MIN_FORM_MS = 800;

// Haché factice : la vérification prend le même temps que le compte existe ou non.
let dummyHash: Promise<string> | null = null;

export async function GET(_request: Request, context: Context) {
  const { action } = await context.params;
  if (action !== "me") return fail("Introuvable", 404);
  try {
    return NextResponse.json({ user: await currentUser() });
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request, context: Context) {
  const { action } = await context.params;
  if (!sameOrigin(request)) return fail("Origine de la requête refusée.", 403);

  try {
    if (action === "logout") {
      await destroySession();
      return NextResponse.json({ ok: true });
    }
    if (action !== "login" && action !== "register") return fail("Introuvable", 404);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (!EMAIL_RE.test(email) || email.length > 254) return fail("Adresse e-mail invalide.", 400);

    const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
    if (
      limited(`auth-ip|${ip}`, MAX_PER_IP, TEN_MINUTES) ||
      limited(`auth|${ip}|${email}`, MAX_PER_EMAIL, TEN_MINUTES) ||
      limited(`auth-compte|${email}`, MAX_PER_ACCOUNT, TEN_MINUTES)
    ) {
      return fail("Trop de tentatives. Réessayez dans quelques minutes.", 429);
    }

    if (action === "register") {
      // Deux pièges à robots : un champ invisible qu'une personne ne remplit jamais,
      // et un formulaire envoyé plus vite qu'on ne peut le remplir à la main.
      const trap = typeof body?.website === "string" ? body.website : "";
      const elapsed = typeof body?.elapsed === "number" ? body.elapsed : 0;
      if (trap !== "" || elapsed < MIN_FORM_MS) {
        return fail("Inscription refusée : le formulaire semble avoir été rempli automatiquement. Rechargez la page et réessayez.", 400);
      }
      if (password.length < 8) return fail("Le mot de passe doit compter au moins 8 caractères.", 400);
      if (password.length > 200) return fail("Mot de passe trop long (200 caractères au maximum).", 400);
      if (limited(`register|${ip}`, MAX_REGISTRATIONS, ONE_HOUR)) {
        return fail("Trop de comptes créés depuis cette connexion. Réessayez dans une heure.", 429);
      }
      const rows = await query<{ id: string }>(
        `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING RETURNING id::text AS id`,
        [email, name, await hashPassword(password)],
      );
      if (rows.length === 0) return fail("Un compte existe déjà avec cette adresse.", 409);
      await createSession(rows[0].id, isSecureRequest(request));
      return NextResponse.json({ user: { id: rows[0].id, email, name } }, { status: 201 });
    }

    const rows = await query<{ id: string; name: string; password_hash: string }>(
      "SELECT id::text AS id, name, password_hash FROM users WHERE email = $1",
      [email],
    );
    dummyHash ??= hashPassword("mot-de-passe-factice");
    const valid = await verifyPassword(password.slice(0, 200), rows[0]?.password_hash ?? (await dummyHash));
    if (rows.length === 0 || !valid) return fail("E-mail ou mot de passe incorrect.", 401);
    await createSession(rows[0].id, isSecureRequest(request));
    return NextResponse.json({ user: { id: rows[0].id, email, name: rows[0].name } });
  } catch (err) {
    console.error("[auth]", err);
    return unavailable();
  }
}
