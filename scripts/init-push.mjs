// Prépare l'envoi des notifications push : génère la paire de clés (dites « VAPID »)
// qui identifie ce serveur auprès des services de notification, et l'écrit dans .env.local.
// Usage : npm run push:init   — sans effet si les clés existent déjà.
import { appendFile, readFile } from "node:fs/promises";
import * as webpush from "web-push";

const FILE = ".env.local";
let current = "";
try {
  current = await readFile(FILE, "utf8");
} catch {
  // Pas encore de .env.local : il sera créé.
}

if (/^VAPID_PRIVATE_KEY=.+/m.test(current) && /^NEXT_PUBLIC_VAPID_PUBLIC_KEY=.+/m.test(current)) {
  console.log("Les clés de notification existent déjà dans .env.local : rien à faire.");
  process.exit(0);
}

const keys = webpush.generateVAPIDKeys();
const lines = [
  "",
  "# Notifications push — clés générées par `npm run push:init`.",
  "# La clé privée ne doit jamais être publiée. En changer désabonne tous les appareils.",
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`,
  `VAPID_PRIVATE_KEY=${keys.privateKey}`,
];
if (!/^VAPID_SUBJECT=/m.test(current)) {
  lines.push(
    "# Contact transmis aux services de notification (Google, Mozilla, Apple, Microsoft) pour vous joindre",
    "# en cas de problème : mettez-y votre vraie adresse, sous la forme mailto:vous@domaine.",
    "VAPID_SUBJECT=mailto:contact@example.com",
  );
}
await appendFile(FILE, `${lines.join("\n")}\n`);
// Seul le début de la clé publique est affiché ; la clé privée ne l'est jamais.
console.log(`Clés de notification écrites dans .env.local (clé publique : ${keys.publicKey.slice(0, 12)}…).`);
console.log("Pensez à remplacer VAPID_SUBJECT par votre adresse de contact, puis redémarrez le serveur.");
