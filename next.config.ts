import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le badge de développement de Next recouvrait le premier onglet sur téléphone.
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // Le micro n'est accordé qu'à l'application elle-même.
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
        ],
      },
      {
        // Adresses de service (comptes, bibliothèque, notifications) : jamais dans un index de recherche,
        // même si un lien y menait. S'ajoute à l'interdiction d'exploration de robots.txt.
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // Le service worker doit toujours être revalidé pour que les mises à jour passent.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
