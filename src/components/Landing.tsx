import Link from "next/link";
import { APP_NAME } from "@/lib/app";
import { applicationLd, FAQ, faqLd, graph, organizationLd, PAGES, websiteLd } from "@/lib/seo";
import InstallButtons from "./InstallButtons";
import JsonLd from "./JsonLd";
import LandingHeader from "./LandingHeader";
import SiteFooter from "./SiteFooter";

const TOOLS: { tab: string; title: string; text: string }[] = [
  { tab: "live", title: "Micro", text: "Jouez : le nom de la note ou de l'accord s'affiche. Un accordeur est intégré." },
  { tab: "file", title: "Morceau", text: "Importez un son ou une vidéo. Suivez les accords et le solfa pendant la lecture, changez la tonalité." },
  { tab: "generate", title: "Générer", text: "Écrivez une suite d'accords, choisissez piano, guitare, basse, batterie, et écoutez-la tourner." },
  { tab: "game", title: "Jeu", text: "Chantez la note demandée pour ouvrir les portes, ou jouez du piano sur l'écran." },
];

// Les guides : de vraies pages de texte, que les moteurs de recherche et les assistants peuvent lire.
const GUIDES = [PAGES.chords, PAGES.song, PAGES.solfa];

// Touches blanches de la maquette ; celles de l'accord de La mineur 7 sont allumées.
const KEYS = [true, false, true, false, true, true, false];

/** Page d'accueil : ce que fait l'application, et les trois façons d'y entrer. */
export default function Landing() {
  return (
    <div className="hm">
      {/* Données structurées : qui publie, quel site, quelle application, et les questions affichées plus bas. */}
      <JsonLd data={graph(organizationLd(), websiteLd(), applicationLd(), faqLd())} />
      <LandingHeader />

      <main>
        <section className="hm-hero hm-wrap">
          <div className="hm-copy">
            {/* Le titre principal dit d'abord ce qu'est l'application, puis porte le slogan. */}
            <h1 className="hm-title">
              <span className="hm-kicker">Reconnaissance d&apos;accords et de notes · piano, guitare, voix</span>{" "}
              <span className="hm-h1">L&apos;accord juste, au moment où vous le jouez.</span>
            </h1>
            <p className="hm-lead">
              Posez votre téléphone sur le piano : {APP_NAME} nomme la note ou l&apos;accord que vous jouez. Donnez-lui un
              enregistrement : il en sort la grille d&apos;accords, le tempo et le solfa.
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

        <section className="hm-guides hm-wrap" aria-labelledby="hm-guides">
          <h2 id="hm-guides" className="hm-h2">
            Comprendre ce que l&apos;on joue.
          </h2>
          <ul>
            {GUIDES.map((guide) => (
              <li key={guide.path}>
                <Link href={guide.path}>
                  <h3>{guide.label}</h3>
                  <p>{guide.description}</p>
                  <span className="hm-go">Lire</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="hm-faq hm-wrap" id="questions" aria-labelledby="hm-faq">
          <h2 id="hm-faq" className="hm-h2">
            Questions fréquentes
          </h2>
          <div className="faq">
            {FAQ.map((entry, index) => (
              <details key={entry.question} open={index === 0}>
                <summary>
                  <h3>{entry.question}</h3>
                </summary>
                <p>{entry.answer}</p>
                {entry.more && (
                  <p>
                    <Link className="hm-link" href={entry.more.href}>
                      {entry.more.label}
                    </Link>
                  </p>
                )}
              </details>
            ))}
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

      <SiteFooter />
    </div>
  );
}
