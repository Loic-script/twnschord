"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { APP_NAME } from "@/lib/app";
import { PLATFORMS, useInstall, type Platform } from "./useInstall";

/**
 * En-tête de la page d'accueil : logo, accès à l'application, menu « Télécharger » (une plateforme
 * au choix) et connexion. Il reste en haut de l'écran et se resserre en barre flottante dès qu'on défile.
 */
export default function LandingHeader() {
  const { device, choose, dialog } = useInstall();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Menu ouvert : un clic ailleurs ou Échap le referme ; le premier choix reçoit le focus.
  useEffect(() => {
    if (!open) return;
    const items = menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]");
    const preferred = PLATFORMS.findIndex((p) => p.id === device);
    items?.[Math.max(0, preferred)]?.focus({ preventScroll: true });
    const onDown = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, device]);

  // Flèches haut / bas, Début et Fin pour parcourir le menu au clavier ; Tab le quitte.
  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (at + 1) % items.length;
    else if (event.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Tab") setOpen(false);
    if (next < 0) return;
    event.preventDefault();
    items[next]?.focus();
  };

  // Une pastille claire glisse sous l'élément survolé (ou atteint au clavier).
  const glide = (target: HTMLElement | null) => {
    const bar = nav.current;
    if (!bar) return;
    if (!target) {
      bar.style.setProperty("--pill-o", "0");
      return;
    }
    const box = target.getBoundingClientRect();
    const origin = bar.getBoundingClientRect();
    bar.style.setProperty("--pill-x", `${box.left - origin.left}px`);
    bar.style.setProperty("--pill-w", `${box.width}px`);
    bar.style.setProperty("--pill-o", "1");
  };

  const pick = (platform: Platform) => {
    setOpen(false);
    void choose(platform);
  };

  return (
    <>
    <header className="hd" data-scrolled={scrolled || undefined}>
      <div className="hd-bar">
        {/* Logo complet, ou monogramme seul quand la place manque (téléphone). */}
        {/* Une seule des deux images est affichée à la fois : la seconde n'a pas de texte, pour que le nom ne soit pas lu deux fois. */}
        <Link className="hd-brand" href="/" aria-label={`${APP_NAME} — accueil`}>
          <img className="brand-logo hd-logo-full" src="/logo/twinschord-logo-reverse.svg" alt={APP_NAME} width={1267} height={267} fetchPriority="high" />
          <img className="brand-logo hd-logo-mark" src="/logo/twinschord-mark-reverse.svg" alt="" width={449} height={267} />
        </Link>

        <nav className="hd-nav" ref={nav} aria-label="Accès" onPointerLeave={() => glide(null)}>
          <span className="hd-pill" aria-hidden="true" />
          <Link className="hd-link hd-link-app" href="/app" onPointerEnter={(e) => glide(e.currentTarget)} onFocus={(e) => glide(e.currentTarget)} onBlur={() => glide(null)}>
            Application
          </Link>

          <div className="dl" ref={menu} data-open={open || undefined} onKeyDown={onMenuKey}>
            <button
              ref={trigger}
              type="button"
              className="hd-link dl-btn"
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((o) => !o)}
              onPointerEnter={(e) => glide(e.currentTarget)}
              onFocus={(e) => glide(e.currentTarget)}
              onBlur={() => glide(null)}
            >
              <svg className="dl-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path className="dl-arrow-shaft" d="M12 4v11M7 11l5 5 5-5" />
                <path d="M5 20h14" />
              </svg>
              <span>Télécharger</span>
              <svg className="dl-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 6l4 4 4-4" />
              </svg>
            </button>

            <div id={panelId} className="dl-panel" role="menu" aria-label={`Télécharger ${APP_NAME} pour`}>
              <p className="dl-title">Installer {APP_NAME} sur</p>
              {PLATFORMS.map((p, i) => (
                <button key={p.id} type="button" role="menuitem" className="dl-item" tabIndex={open ? 0 : -1} style={{ "--i": i } as CSSProperties} onClick={() => pick(p.id)}>
                  <span className="dl-ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={p.icon} pathLength={1} />
                    </svg>
                  </span>
                  <span className="dl-text">
                    <strong>{p.name}</strong>
                    <small>{p.hint}</small>
                  </span>
                  {device === p.id ? (
                    <em className="dl-here">Cet appareil</em>
                  ) : (
                    <svg className="dl-go" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 3l5 5-5 5" />
                    </svg>
                  )}
                </button>
              ))}
              <p className="dl-foot">Gratuit · fonctionne sans Internet</p>
            </div>
          </div>

          {/* Deux libellés, un seul affiché selon la largeur : le nom lu par les aides techniques est
              celui qu'on voit (pas d'aria-label, qui pourrait différer du texte affiché). */}
          <Link className="hd-cta" href="/connexion">
            <span className="hd-cta-long">Se connecter</span>
            <span className="hd-cta-short">Connexion</span>
          </Link>
        </nav>
      </div>
    </header>
    {/* Hors de l'en-tête : celui-ci laisse passer les clics autour de la barre, et la fenêtre en hériterait. */}
    {dialog}
    </>
  );
}
