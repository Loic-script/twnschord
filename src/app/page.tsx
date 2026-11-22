import CookieNotice from "@/components/CookieNotice";
import InstalledGate from "@/components/InstalledGate";
import Landing from "@/components/Landing";
import { pageMetadata, PAGES } from "@/lib/seo";

export const metadata = pageMetadata(PAGES.home);

/** Page d'accueil du site. L'application est à l'adresse /app ; installée, elle ne montre jamais cette page. */
export default function Page() {
  return (
    <>
      <InstalledGate />
      <div className="lp-notice">
        <CookieNotice learnMoreHref={PAGES.about.path} />
      </div>
      <Landing />
    </>
  );
}
