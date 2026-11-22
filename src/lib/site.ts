/**
 * Adresse publique du site, sans barre finale. Elle sert au sitemap, au
 * robots.txt et aux liens de partage. À définir à la mise en ligne avec la
 * variable d'environnement NEXT_PUBLIC_SITE_URL (exemple : https://twinschord.mg).
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

// Oubliée à la mise en ligne, cette variable ferait pointer le sitemap, les adresses canoniques et les
// aperçus de partage vers « localhost » : le site serait invisible pour les moteurs, sans aucune erreur.
// D'où cet avertissement à la construction (une seule fois, côté serveur).
const warned = globalThis as unknown as { __siteUrlWarned?: boolean };
if (typeof window === "undefined" && process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_SITE_URL && !warned.__siteUrlWarned) {
  warned.__siteUrlWarned = true;
  console.warn(
    "\n[référencement] NEXT_PUBLIC_SITE_URL n'est pas définie : sitemap, robots.txt et adresses canoniques pointent vers http://localhost:3000.\n" +
      "                Avant la mise en ligne, renseignez l'adresse publique du site dans .env.local (voir .env.example), puis reconstruisez.\n",
  );
}
