import type { MetadataRoute } from "next";
import { absolute, PAGES } from "@/lib/seo";

/**
 * /sitemap.xml : uniquement les pages à indexer, à leur adresse canonique. L'application et la page
 * de connexion n'y sont pas (elles portent « noindex »). La date est celle de la dernière
 * modification du texte de chaque page (champ `updated` de src/lib/seo.ts) — Google ne s'y fie que
 * si elle est exacte ; la fréquence et la priorité, qu'il ignore, ne sont pas renseignées.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return Object.values(PAGES)
    .filter((page) => page.index)
    .map((page) => ({ url: absolute(page.path), lastModified: page.updated }));
}
