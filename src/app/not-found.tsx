import Link from "next/link";
import { APP_NAME } from "@/lib/app";

export const metadata = { title: `Page introuvable — ${APP_NAME}` };

/** Affichée pour toute adresse qui n'existe pas. */
export default function NotFound() {
  return (
    <div className="app">
      <main className="main">
        <section className="panel">
          <h1 className="panel-title">Cette page n&apos;existe pas</h1>
          <p>
            L&apos;adresse demandée ne mène nulle part. {APP_NAME} tient en une seule page : le micro, le jeu, l&apos;analyse
            d&apos;un morceau et le générateur s&apos;y trouvent tous.
          </p>
          <div className="actions">
            <Link className="btn btn-primary" href="/">
              Revenir à {APP_NAME}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
