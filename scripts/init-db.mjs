// Crée la base de données (si besoin) puis applique db/schema.sql.
// Usage : npm run db:init
import { readFile } from "node:fs/promises";
import pg from "pg";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Pas de .env.local : on se contente des variables d'environnement déjà définies.
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL est absent. Copiez .env.example vers .env.local et renseignez-le.");
  process.exit(1);
}

const target = new URL(url);
const dbName = decodeURIComponent(target.pathname.slice(1));
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(dbName)) {
  console.error(`Nom de base invalide : "${dbName}".`);
  process.exit(1);
}

const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";

const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
if (existing.rowCount === 0) {
  await admin.query(`CREATE DATABASE "${dbName}"`);
  console.log(`Base "${dbName}" créée.`);
} else {
  console.log(`Base "${dbName}" déjà présente.`);
}
await admin.end();

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"));
const tables = await client.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
);
console.log("Tables :", tables.rows.map((r) => r.table_name).join(", "));
await client.end();
