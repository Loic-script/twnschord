import type { Metadata } from "next";
import App from "@/components/App";
import { APP_NAME } from "@/lib/app";

// Le titre est le seul nom de l'application : c'est lui qui s'affiche dans la barre de sa fenêtre une fois installée.
export const metadata: Metadata = { title: APP_NAME, alternates: { canonical: "/app" } };

/** L'application elle-même (micro, jeu, morceau, générateur…). La page d'accueil est à la racine du site. */
export default function AppPage() {
  return <App />;
}
