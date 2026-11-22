// Signale les pages du site à Bing (et aux moteurs associés : Yandex, Seznam, Naver…) par le
// protocole IndexNow, pour qu'elles soient explorées sans attendre. Google n'y participe pas :
// pour lui, c'est Search Console.
//
// Usage, une fois le site en ligne :
//   1. dans .env.local : NEXT_PUBLIC_SITE_URL=https://votre-domaine   et   INDEXNOW_KEY=<clé>
//      (clé au choix : 8 à 128 lettres, chiffres ou tirets — `npm run seo:indexnow -- --cle` en propose une) ;
//   2. `npm run seo:indexnow` crée le fichier public/<clé>.txt ; reconstruire et redéployer le site ;
//   3. relancer `npm run seo:indexnow` : les adresses du sitemap sont envoyées.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (process.argv.includes("--cle")) {
  console.log(`Clé proposée, à copier dans .env.local :\nINDEXNOW_KEY=${randomBytes(16).toString("hex")}`);
  process.exit(0);
}

const env = Object.fromEntries(
  (existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "")
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const site = (env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
const key = env.INDEXNOW_KEY || "";

const stop = (message) => {
  console.error(message);
  process.exit(1);
};
if (!/^https:\/\//.test(site) || /localhost|127\.0\.0\.1/.test(site)) stop("NEXT_PUBLIC_SITE_URL doit être l'adresse publique du site, en https (dans .env.local).");
if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) stop("INDEXNOW_KEY manque dans .env.local (8 à 128 lettres, chiffres ou tirets). `npm run seo:indexnow -- --cle` en propose une.");

// Le moteur vérifie que la clé appartient bien au site : elle doit être servie à la racine.
const keyFile = `public/${key}.txt`;
if (!existsSync(keyFile)) {
  writeFileSync(keyFile, key);
  console.log(`Fichier ${keyFile} créé. Reconstruisez et redéployez le site, puis relancez cette commande.`);
  process.exit(0);
}
const served = await fetch(`${site}/${key}.txt`).then((r) => (r.ok ? r.text() : ""), () => "");
if (served.trim() !== key) stop(`${site}/${key}.txt ne renvoie pas la clé : le site en ligne n'a pas encore ce fichier. Redéployez, puis relancez.`);

// Les adresses à signaler sont celles du sitemap en ligne : exactement les pages à indexer.
const sitemap = await fetch(`${site}/sitemap.xml`).then((r) => r.text());
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (urlList.length === 0) stop("Le sitemap en ligne ne contient aucune adresse.");

const response = await fetch("https://www.bing.com/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/${key}.txt`, urlList }),
});
const meaning = { 200: "adresses reçues", 202: "adresses reçues, clé en cours de vérification", 400: "requête mal formée", 403: "clé refusée", 422: "adresses hors du site ou clé non concordante", 429: "trop de requêtes" };
console.log(`${urlList.length} adresse(s) envoyée(s) — réponse ${response.status} : ${meaning[response.status] ?? "inattendue"}`);
for (const url of urlList) console.log(`  ${url}`);
process.exit(response.status === 200 || response.status === 202 ? 0 : 1);
