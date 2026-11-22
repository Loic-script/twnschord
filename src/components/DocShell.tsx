import Link from "next/link";
import type { ReactNode } from "react";
import { articleLd, breadcrumbLd, graph, organizationLd, PAGES, websiteLd, type SitePage } from "@/lib/seo";
import JsonLd from "./JsonLd";
import LandingHeader from "./LandingHeader";
import SiteFooter from "./SiteFooter";

/**
 * Gabarit d'une page de contenu (guide, à propos) : en-tête du site, fil d'Ariane, texte, pied de
 * page, et les données structurées correspondantes. `headline` est le titre principal de la page.
 */
export default function DocShell({ page, headline, article = true, children }: { page: SitePage; headline: string; article?: boolean; children: ReactNode }) {
  return (
    <div className="site">
      <JsonLd data={graph(organizationLd(), websiteLd(), breadcrumbLd(page), ...(article ? [articleLd(page, headline)] : []))} />
      <LandingHeader />
      <main className="doc hm-wrap">
        <nav className="crumbs" aria-label="Fil d'Ariane">
          <Link href={PAGES.home.path}>{PAGES.home.label}</Link>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{page.label}</span>
        </nav>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
