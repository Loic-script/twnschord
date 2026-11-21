import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** /robots.txt : tout est ouvert aux moteurs de recherche, sauf les adresses de service (comptes, bibliothèque). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
