import Link from "next/link";
import { APP_NAME, MADE_IN, TEAM_MEMBERS, TEAM_NAME } from "@/lib/app";
import InstallButtons from "./InstallButtons";

const TOOLS: { tab: string; title: string; text: string }[] = [
  { tab: "live", title: "Micro", text: "Jouez : le nom de la note ou de l'accord s'affiche. Un accordeur est intégré." },
  { tab: "file", title: "Morceau", text: "Importez un son ou une vidéo. Suivez les accords et le solfa pendant la lecture, changez la tonalité." },
  { tab: "generate", title: "Générer", text: "Écrivez une suite d'accords, choisissez piano, guitare, basse, batterie, et écoutez-la tourner." },
  { tab: "game", title: "Jeu", text: "Chantez la note demandée pour ouvrir les portes, ou jouez du piano sur l'écran." },
];

// Touches blanches de la maquette ; celles de l'accord de La mineur 7 sont allumées.
const KEYS = [true, false, true, false, true, true, false];

/** Page d'accueil : ce que fait l'application, et les trois façons d'y entrer. */
export default function Landing() {
  return (
    <div className="hm">
      <header className="hm-top hm-wrap">
        <img className="brand-logo" src="/logo/twinschord-logo-reverse.svg" alt={APP_NAME} width={1267} height={267} />
        <nav className="hm-nav" aria-label="Accès">
          <Link href="/app">Application</Link>
          <Link href="/connexion">Se connecter</Link>
        </nav>
      </header>

      <main>
        <section className="hm-hero hm-wrap">
          <div className="hm-copy">
            <p className="hm-kicker">Pour pianistes, guitaristes et choristes</p>
            <h1 className="hm-h1">L&apos;accord juste, au moment où vous le jouez.</h1>
            <p className="hm-lead">
              Posez votre téléphone sur le piano : {APP_NAME} nomme la note ou l&apos;accord que vous jouez. Donnez-lui un
              enregistrement : il en sort la grille, le tempo et le solfa.
            </p>
            <div className="hm-cta">
              <Link className="btn btn-lg btn-primary" href="/app">
                Ouvrir l&apos;application
              </Link>
              <Link className="hm-link" href="/connexion?mode=creer">
                Créer un compte
              </Link>
            </div>
            <p className="hm-fine">Gratuit, sans compte obligatoire. Fonctionne sans Internet.</p>
          </div>

          {/* Maquette de l'écran « Micro », dessinée ici même : pas une image d'illustration. */}
          <div className="hm-art" aria-hidden="true">
            <span className="hm-disc" />
            <span className="hm-ring" />
            <div className="hm-phone">
              <span className="hm-phone-mode">Accord</span>
              <span className="hm-phone-chord">
                A<small>m7</small>
              </span>
              <span className="hm-phone-notes">La · Do · Mi · Sol</span>
              <span className="hm-phone-keys">
                {KEYS.map((on, i) => (
                  <i key={i} data-on={on || undefined} />
                ))}
              </span>
            </div>
            <span className="hm-tag">La mineur · 96 bpm</span>
          </div>
        </section>

        <section className="hm-band" aria-labelledby="hm-tools">
          <div className="hm-wrap">
            <h2 id="hm-tools" className="hm-h2">
              Quatre outils, une seule application.
            </h2>
            <ul className="hm-rows">
              {TOOLS.map((tool) => (
                <li key={tool.tab}>
                  <Link href={`/app?onglet=${tool.tab}`}>
                    <h3>{tool.title}</h3>
                    <p>{tool.text}</p>
                    <span className="hm-go">Ouvrir</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="hm-install hm-wrap" aria-labelledby="hm-install">
          <div>
            <h2 id="hm-install" className="hm-h2">
              Télécharger l&apos;application
            </h2>
            <p className="hm-lead">
              Une fois installée, elle s&apos;ouvre depuis son icône comme n&apos;importe quelle application, et continue de
              marcher quand le réseau manque.
            </p>
          </div>
          <div className="hm-install-buttons">
            <InstallButtons />
          </div>
        </section>
      </main>

      <footer className="hm-foot hm-wrap">
        <p>
          Conçu et développé à {MADE_IN} par {TEAM_NAME} — {TEAM_MEMBERS.join(" et ")}.
        </p>
        <Link href="/app?onglet=about">À propos et confidentialité</Link>
      </footer>
    </div>
  );
}
