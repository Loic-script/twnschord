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

type Context = { params: Promise<{ action: string }> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const unavailable = () => fail("La base de données ne répond pas. Vérifiez que PostgreSQL est démarré.", 503);

// Frein aux essais de mot de passe en rafale (en mémoire : suffisant pour un seul serveur).
const attempts = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.reset < now) {
    attempts.set(key, { count: 1, reset: now + WINDOW_MS });
    if (attempts.size > 5000) {
      for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
    }
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

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
    if (tooManyAttempts(`${ip}|${email}`)) {
      return fail("Trop de tentatives. Réessayez dans quelques minutes.", 429);
    }

    if (action === "register") {
      if (password.length < 8) return fail("Le mot de passe doit compter au moins 8 caractères.", 400);
      if (password.length > 200) return fail("Mot de passe trop long (200 caractères au maximum).", 400);
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
