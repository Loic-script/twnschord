import AboutView from "@/components/AboutView";
import DocShell from "@/components/DocShell";
import { APP_NAME } from "@/lib/app";
import { pageMetadata, PAGES } from "@/lib/seo";

const page = PAGES.about;

export const metadata = pageMetadata(page);

/** L'équipe et la confidentialité, à une adresse que les moteurs peuvent lire (dans l'application, c'est un onglet). */
export default function AboutPage() {
  return (
    <DocShell page={page} headline={`À propos de ${APP_NAME}`} article={false}>
      <AboutView />
    </DocShell>
  );
}
