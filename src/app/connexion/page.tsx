import type { Metadata } from "next";
import { APP_NAME } from "@/lib/app";
import ConnexionClient from "./ConnexionClient";

// Page de formulaire : elle n'a rien à faire dans les résultats de recherche (« noindex »), mais ses
// liens restent suivis. Son adresse canonique est la sienne — et non plus celle de l'accueil, dont elle
// héritait. Les variantes (?mode=creer) renvoient à cette même adresse.
export const metadata: Metadata = {
  title: { absolute: `Connexion — ${APP_NAME}` },
  description: `Connectez-vous ou créez un compte ${APP_NAME} pour enregistrer vos analyses et les retrouver sur un autre appareil. Le compte est facultatif.`,
  alternates: { canonical: "/connexion" },
  robots: { index: false, follow: true },
};

export default function ConnexionPage() {
  return <ConnexionClient />;
}
