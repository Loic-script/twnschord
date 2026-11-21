import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { query } from "@/lib/db";
import { limited } from "@/lib/rateLimit";
import { parseAnalysis } from "@/lib/validate";

const MAX_BODY = 3_000_000;
const MAX_PER_USER = 500;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

interface Row {
  id: string;
  title: string;
  duration: number;
  tempo: number;
  key_tonic: number;
  key_mode: string;
  created_at: Date;
}

const summary = (r: Row) => ({
  id: r.id,
  title: r.title,
  duration: r.duration,
  tempo: r.tempo,
  key: { tonic: r.key_tonic, mode: r.key_mode },
  createdAt: r.created_at,
});

/** Liste des analyses enregistrées par l'utilisateur connecté, la plus récente d'abord. */
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return fail("Connectez-vous pour voir vos morceaux.", 401);
    const rows = await query<Row>(
      `SELECT id::text AS id, title, duration, tempo, key_tonic, key_mode, created_at
         FROM analyses WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [user.id, MAX_PER_USER],
    );
    return NextResponse.json({ analyses: rows.map(summary) });
  } catch (err) {
    console.error("[analyses]", err);
    return fail("La base de données ne répond pas.", 503);
  }
}

/** Enregistre une analyse. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("Origine de la requête refusée.", 403);
  try {
    const user = await currentUser();
    if (!user) return fail("Connectez-vous pour enregistrer un morceau.", 401);

    // Pas plus de 30 enregistrements par minute et par compte.
    if (limited(`save|${user.id}`, 30, 60 * 1000)) return fail("Trop d'enregistrements à la suite. Réessayez dans une minute.", 429);

    const text = await request.text();
    if (text.length > MAX_BODY) return fail("Analyse trop volumineuse.", 413);
    let body: Record<string, unknown> | null = null;
    try {
      body = JSON.parse(text);
    } catch {
      return fail("Requête illisible.", 400);
    }
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
    const analysis = parseAnalysis(body?.analysis);
    if (!title) return fail("Donnez un titre au morceau.", 400);
    if (!analysis) return fail("Analyse invalide.", 400);

    const [{ count }] = await query<{ count: string }>("SELECT count(*) AS count FROM analyses WHERE user_id = $1", [
      user.id,
    ]);
    if (Number(count) >= MAX_PER_USER) {
      return fail(`Bibliothèque pleine (${MAX_PER_USER} morceaux). Supprimez-en pour en ajouter.`, 409);
    }

    const rows = await query<Row>(
      `INSERT INTO analyses (user_id, title, duration, tempo, key_tonic, key_mode, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id::text AS id, title, duration, tempo, key_tonic, key_mode, created_at`,
      [user.id, title, analysis.duration, analysis.tempo, analysis.key.tonic, analysis.key.mode, JSON.stringify(analysis)],
    );
    return NextResponse.json({ analysis: summary(rows[0]) }, { status: 201 });
  } catch (err) {
    console.error("[analyses]", err);
    return fail("La base de données ne répond pas.", 503);
  }
}
