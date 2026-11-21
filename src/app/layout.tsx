import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
// Polices embarquées dans l'application : aucune requête externe, donc disponibles hors ligne.
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "./globals.css";
import { APP_NAME, TEAM_MEMBERS, TEAM_NAME } from "@/lib/app";

export const metadata: Metadata = {
  title: `${APP_NAME} — notes, accords et solfa`,
  description:
    "Reconnaît les notes et les accords au micro, analyse un morceau et en tire la grille d'accords et le solfa. Fonctionne hors ligne.",
  applicationName: APP_NAME,
  creator: TEAM_NAME,
  authors: TEAM_MEMBERS.map((name) => ({ name })),
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0F3B33",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
