import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** /sitemap.xml : l'accueil, l'application (dont tous les écrans sont des onglets) et la page de connexion. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/app`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/connexion`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
