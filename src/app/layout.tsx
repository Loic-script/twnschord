import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { APP_NAME, TEAM_MEMBERS, TEAM_NAME } from "@/lib/app";
import { KEYWORDS, SITE_DESCRIPTION, SITE_TITLE } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

// Polices embarquées dans l'application (aucune requête externe, donc disponibles hors ligne), en
// sous-ensemble latin : tout le français. Elles passent par next/font, qui les précharge et règle la
// police de secours sur les mêmes proportions : le texte ne se recompose plus quand la police arrive
// (plus de saut de mise en page pendant le chargement).
const fontDisplay = localFont({
  src: "../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-display",
  display: "swap",
});
const fontBody = localFont({
  src: "../../node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-body",
  display: "swap",
});
// DM Mono (chiffres, noms de notes) : pas de préchargement, elle n'est jamais le premier texte affiché.
const fontMono = localFont({
  src: [
    { path: "../../node_modules/@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff2", weight: "500" },
  ],
  variable: "--font-mono",
  display: "swap",
  preload: false,
});

// Balises communes à tout le site. Le titre, la description, l'adresse canonique et la consigne
// d'indexation sont fixés page par page (pageMetadata, src/lib/seo.ts) : rien de cela n'est mis ici,
// sinon une page sans réglage propre se ferait passer pour une copie de l'accueil.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s — ${APP_NAME}` },
  description: SITE_DESCRIPTION,
  keywords: KEYWORDS,
  applicationName: APP_NAME,
  category: "music",
  creator: TEAM_NAME,
  publisher: TEAM_NAME,
  authors: TEAM_MEMBERS.map((name) => ({ name })),
  // Aperçu du lien quand il est partagé ; l'image vient de src/app/opengraph-image.png (et son .alt.txt).
  openGraph: { type: "website", locale: "fr_FR", siteName: APP_NAME, title: SITE_TITLE, description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  // Preuves de propriété pour Google Search Console et Bing Webmaster Tools : les codes se mettent
  // dans .env.local (voir .env.example) ; sans eux, aucune balise n'est émise.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
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
    <html lang="fr" className={`${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
