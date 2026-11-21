import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { query } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Une analyse complète. Le filtre sur user_id garantit qu'on ne lit que les siennes. */
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!/^\d{1,18}$/.test(id)) return fail("Introuvable", 404);
  try {
    const user = await currentUser();
    if (!user) return fail("Connectez-vous pour ouvrir ce morceau.", 401);
    const rows = await query<{ id: string; title: string; data: unknown }>(
      "SELECT id::text AS id, title, data FROM analyses WHERE id = $1 AND user_id = $2",
      [id, user.id],
    );
    if (rows.length === 0) return fail("Morceau introuvable.", 404);
    return NextResponse.json({ id: rows[0].id, title: rows[0].title, analysis: rows[0].data });
  } catch (err) {
    console.error("[analyses]", err);
    return fail("La base de données ne répond pas.", 503);
  }
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  if (!sameOrigin(request)) return fail("Origine de la requête refusée.", 403);
  if (!/^\d{1,18}$/.test(id)) return fail("Introuvable", 404);
  try {
    const user = await currentUser();
    if (!user) return fail("Connectez-vous pour supprimer ce morceau.", 401);
    const rows = await query<{ id: string }>(
      "DELETE FROM analyses WHERE id = $1 AND user_id = $2 RETURNING id::text AS id",
      [id, user.id],
    );
    if (rows.length === 0) return fail("Morceau introuvable.", 404);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[analyses]", err);
    return fail("La base de données ne répond pas.", 503);
  }
}
