import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
// Polices embarquées dans l'application : aucune requête externe, donc disponibles hors ligne.
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "./globals.css";
import { APP_NAME, TEAM_MEMBERS, TEAM_NAME } from "@/lib/app";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: `${APP_NAME} — notes, accords et solfa`,
  description:
    "Reconnaît les notes et les accords au micro, analyse un morceau et en tire la grille d'accords et le solfa. Fonctionne hors ligne.",
  applicationName: APP_NAME,
  creator: TEAM_NAME,
  authors: TEAM_MEMBERS.map((name) => ({ name })),
  // Aperçu du lien quand il est partagé ; l'image vient de src/app/opengraph-image.png.
  openGraph: { type: "website", locale: "fr_FR", siteName: APP_NAME, title: `${APP_NAME} — notes, accords et solfa`, url: "/" },
  twitter: { card: "summary_large_image" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
};

// Exécuté avant le premier affichage, pour que rien n'apparaisse puis disparaisse :
// 1. bandeau cookies déjà lu (même clé que dans src/components/CookieNotice.tsx) → masqué d'emblée ;
// 2. application installée (même test que isInstalled() dans src/lib/installedApp.ts) → l'attribut
//    data-installed adapte les styles, et la page d'accueil du site cède la place à l'application.
const BOOT_SCRIPT =
  `try{if(localStorage.getItem("twinschord.cookies")==="ok")document.documentElement.setAttribute("data-cookies","ok")}catch(e){}` +
  `try{var m=window.matchMedia;if(navigator.standalone===true||m("(display-mode: standalone)").matches||m("(display-mode: window-controls-overlay)").matches){document.documentElement.setAttribute("data-installed","");if(location.pathname==="/")location.replace("/app")}}catch(e){}`;

export const viewport: Viewport = {
  themeColor: "#031A19",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning : le script ci-dessous peut ajouter des attributs à <html> avant que React ne démarre.
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
