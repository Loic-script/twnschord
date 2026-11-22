import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Adresses de service, sans intérêt pour un moteur et à ne pas explorer : comptes, bibliothèque,
// notifications (/api/), et réception d'un fichier partagé.
// La page de connexion n'y figure pas exprès : elle porte une balise « noindex », qu'un robot ne
// peut lire que s'il a le droit de visiter la page.
const PRIVATE = ["/api/", "/app/recevoir"];

// Robots nommés d'après la documentation de chaque éditeur (vérifiée en novembre 2026).
/** Moteurs de recherche classiques. */
const SEARCH = ["Googlebot", "Bingbot", "Applebot"];
/** Recherche des assistants : c'est par eux qu'un site peut être cité dans une réponse. */
const AI_SEARCH = ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot"];
/** Lecture d'une page à la demande d'un utilisateur qui pose une question à l'assistant. */
const AI_USER = ["ChatGPT-User", "Claude-User", "Perplexity-User"];
/**
 * Collecte pour l'entraînement des modèles. Autorisée : être connu des modèles sert l'objectif d'être
 * mentionné. Pour la refuser sans toucher au référencement, passer ALLOW_TRAINING à false.
 */
const AI_TRAINING = ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended"];
const ALLOW_TRAINING = true;

/**
 * /robots.txt : les pages publiques sont ouvertes à tous les robots, de recherche comme d'IA.
 * Un robot qui trouve un groupe à son nom ignore le groupe général : les adresses privées sont donc
 * répétées dans chaque groupe.
 */
export default function robots(): MetadataRoute.Robots {
  const open = { allow: "/", disallow: PRIVATE };
  return {
    rules: [
      { userAgent: [...SEARCH, ...AI_SEARCH, ...AI_USER], ...open },
      ALLOW_TRAINING ? { userAgent: AI_TRAINING, ...open } : { userAgent: AI_TRAINING, disallow: "/" },
      { userAgent: "*", ...open },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
