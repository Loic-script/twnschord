import { Pool, type QueryResultRow } from "pg";

// En développement, le rechargement à chaud réévalue ce module :
// on garde le pool sur globalThis pour ne pas multiplier les connexions.
const holder = globalThis as unknown as { __diapasonPool?: Pool };

function pool(): Pool {
  if (!holder.__diapasonPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL n'est pas défini");
    holder.__diapasonPool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000 });
    // Une connexion au repos qui se coupe (redémarrage de PostgreSQL, pare-feu) émet « error » sur le pool :
    // sans écouteur, Node arrêterait tout le serveur. La connexion est simplement remplacée à la demande suivante.
    holder.__diapasonPool.on("error", (err) => console.error("[db]", err.message));
  }
  return holder.__diapasonPool;
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool().query<T>(text, params);
  return result.rows;
}
