// Envoie une annonce à tous les appareils abonnés aux notifications.
// Usage : npm run notify -- "Titre" "Message" [adresse]
//   adresse (facultative) : ce qui s'ouvre au clic, par exemple "/?onglet=generate".
import pg from "pg";
import * as webpush from "web-push";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Variables déjà présentes dans l'environnement.
}

const [title, body, url = "/"] = process.argv.slice(2);
if (!title || !body) {
  console.error('Usage : npm run notify -- "Titre" "Message" [adresse]');
  process.exit(1);
}
if (!url.startsWith("/")) {
  console.error("L'adresse doit commencer par « / » : elle désigne un écran de l'application.");
  process.exit(1);
}
const { NEXT_PUBLIC_VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject, DATABASE_URL } = process.env;
if (!publicKey || !privateKey || !subject) {
  console.error("Clés de notification absentes : lancez d'abord `npm run push:init`.");
  process.exit(1);
}
webpush.setVapidDetails(subject, publicKey, privateKey);

const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();
const { rows } = await db.query("SELECT endpoint, p256dh, auth FROM push_subscriptions");
const payload = JSON.stringify({ title: title.slice(0, 80), body: body.slice(0, 240), url, tag: "annonce" });

let sent = 0;
let expired = 0;
let failed = 0;
for (const row of rows) {
  try {
    await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, { TTL: 24 * 3600, urgency: "normal" });
    sent++;
  } catch (err) {
    // 404 ou 410 : l'appareil s'est désabonné, son abonnement n'a plus lieu d'être.
    if (err.statusCode === 404 || err.statusCode === 410) {
      await db.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [row.endpoint]);
      expired++;
    } else {
      failed++;
      console.error(`Échec (${err.statusCode ?? err.code ?? "réseau"}) pour un appareil.`);
    }
  }
}
await db.end();
console.log(`${rows.length} appareil(s) abonné(s) : ${sent} notifié(s), ${expired} abonnement(s) expiré(s) retiré(s), ${failed} échec(s).`);
