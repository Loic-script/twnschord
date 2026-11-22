import Link from "next/link";
import { MADE_IN, TEAM_MEMBERS, TEAM_NAME } from "@/lib/app";
import { PAGES } from "@/lib/seo";

/** Pied de page du site : chaque page publique y est reliée, pour les visiteurs comme pour les moteurs. */
export default function SiteFooter() {
  return (
    <footer className="site-foot hm-wrap">
      <nav aria-label="Pages du site">
        <ul>
          {[PAGES.home, PAGES.app, PAGES.chords, PAGES.song, PAGES.solfa, PAGES.about].map((page) => (
            <li key={page.path}>
              <Link href={page.path}>{page.label}</Link>
            </li>
          ))}
          <li>
            <Link href="/connexion">Se connecter</Link>
          </li>
        </ul>
      </nav>
      <p>
        Conçu et développé à {MADE_IN} par {TEAM_NAME} — {TEAM_MEMBERS.join(" et ")}.
      </p>
    </footer>
  );
}
