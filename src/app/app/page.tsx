import type { Metadata } from "next";
import App from "@/components/App";
import { pageMetadata, PAGES } from "@/lib/seo";

// Titre = le seul nom de l'application (celui de sa fenêtre une fois installée). La page n'est pas
// indexée : elle n'a presque pas de texte, l'accueil et les guides portent le référencement.
export const metadata: Metadata = pageMetadata(PAGES.app);

/** L'application elle-même (micro, jeu, morceau, générateur…). La page d'accueil est à la racine du site. */
export default function AppPage() {
  return <App />;
}
