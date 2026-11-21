/**
 * Adresse publique du site, sans barre finale. Elle sert au sitemap, au
 * robots.txt et aux liens de partage. À définir à la mise en ligne avec la
 * variable d'environnement NEXT_PUBLIC_SITE_URL (exemple : https://twinschord.mg).
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
