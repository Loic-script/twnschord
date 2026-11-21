"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { api, type User } from "@/lib/api";
import { APP_NAME, APP_NAME_PARTS, TEAM_NAME } from "@/lib/app";
import { prewarmAnalysis } from "@/lib/audio/analyzeClient";
import type { NoteNaming } from "@/lib/audio/notes";
import type { Analysis } from "@/lib/audio/types";
import AboutView from "./AboutView";
import AccountView from "./AccountView";
import CookieNotice from "./CookieNotice";
import FileView from "./FileView";
import GameView from "./GameView";
import GenerateView from "./GenerateView";
import LibraryView from "./LibraryView";
import LiveView from "./LiveView";

export interface Track {
  /** Identifiant local : change à chaque morceau ouvert. */
  id: number;
  title: string;
  analysis: Analysis;
  /** URL locale du fichier audio, ou null si le morceau est ouvert sans son. */
  audioUrl: string | null;
  /** Identifiant en bibliothèque, ou null si l'analyse n'est pas enregistrée. */
  savedId: string | null;
}

// « about » n'a pas d'onglet : on y accède par le lien en pied de page.
type Tab = "live" | "game" | "file" | "generate" | "library" | "account" | "about";

// `short` : libellé de remplacement quand la barre d'onglets est à l'étroit (téléphone).
const TABS: { id: Tab; label: string; short?: string; icon: string }[] = [
  { id: "live", label: "Micro", icon: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" },
  { id: "game", label: "Jeu", icon: "M7 8h10a5 5 0 0 1 5 5v1a3 3 0 0 1-5.3 1.9L15.5 14h-7l-1.2 1.9A3 3 0 0 1 2 14v-1a5 5 0 0 1 5-5zM7 10.5v3M5.5 12h3M16.5 12h.01" },
  { id: "file", label: "Morceau", icon: "M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z" },
  { id: "generate", label: "Générer", icon: "M4 5h16v14H4zM8 5v8h2.7V5M13.3 5v8H16V5M9.35 13v6M14.65 13v6" },
  { id: "library", label: "Bibliothèque", short: "Biblio", icon: "M5 4v16M10 4v16M14.5 5.5l4 14.5M3 20h18" },
  { id: "account", label: "Compte", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0" },
];

/** Rang d'un onglet dans la barre (« À propos », hors barre, vient après tous les autres). */
const tabOrder = (tab: Tab) => {
  const index = TABS.findIndex((t) => t.id === tab);
  return index < 0 ? TABS.length : index;
};

const NAMING_KEY = "diapason.naming";

/** Prépare le mode hors ligne ; en développement, retire tout service worker resté d'un essai précédent. */
function setUpOffline(): void {
  if (!("serviceWorker" in navigator)) {
    prewarmAnalysis();
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    void navigator.serviceWorker.getRegistrations().then((list) => list.forEach((r) => r.unregister()));
    if ("caches" in window) void caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
    prewarmAnalysis();
    return;
  }
  navigator.serviceWorker.register("/sw.js").catch(() => {});
  void navigator.serviceWorker.ready.then((registration) => {
    // Les fichiers chargés avant que le service worker ne prenne la main lui sont signalés.
    const report = () => {
      const urls = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => name.includes("/_next/static/"));
      registration.active?.postMessage({ type: "cache", urls });
    };
    report();
    prewarmAnalysis();
    setTimeout(report, 4000);
  });
}

export default function App() {
  const [tab, setTab] = useState<Tab>("live");
  const [user, setUser] = useState<User | null>(null);
  const [online, setOnline] = useState(true);
  const [naming, setNaming] = useState<NoteNaming>("latin");
  const [track, setTrack] = useState<Track | null>(null);
  /** Sens du dernier changement d'onglet : 1 vers la droite, −1 vers la gauche. */
  const [direction, setDirection] = useState(1);
  const nav = useRef<HTMLElement>(null);

  const goTo = (next: Tab) => {
    if (next === tab) return;
    setDirection(tabOrder(next) > tabOrder(tab) ? 1 : -1);
    setTab(next);
  };

  // Le repère de l'onglet actif est un seul élément qui glisse d'un onglet à l'autre :
  // on lui donne la position et la largeur de l'onglet choisi.
  useLayoutEffect(() => {
    const bar = nav.current;
    if (!bar) return;
    const place = () => {
      const active = bar.querySelector<HTMLElement>(".tab.is-on");
      bar.style.setProperty("--ind-o", active ? "1" : "0");
      if (!active) return;
      bar.style.setProperty("--ind-x", `${active.offsetLeft}px`);
      bar.style.setProperty("--ind-w", `${active.offsetWidth}px`);
    };
    place();
    // Pas de glissement au tout premier affichage, seulement ensuite.
    const frame = requestAnimationFrame(() => bar.setAttribute("data-ready", ""));
    const observer = new ResizeObserver(place);
    observer.observe(bar);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [tab]);

  useEffect(() => {
    setUpOffline();
    try {
      if (localStorage.getItem(NAMING_KEY) === "letter") setNaming("letter");
    } catch {
      // Stockage indisponible (navigation privée) : on garde le réglage par défaut.
    }
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // La session est relue au démarrage et à chaque retour de la connexion.
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    api.me().then(
      (u) => {
        if (!cancelled) setUser(u);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [online]);

  const chooseNaming = (next: NoteNaming) => {
    setNaming(next);
    try {
      localStorage.setItem(NAMING_KEY, next);
    } catch {
      // Sans stockage, le choix vaut pour cette visite seulement.
    }
  };

  const openTrack = useCallback((next: Track | null) => {
    setTrack((previous) => {
      if (previous?.audioUrl && previous.audioUrl !== next?.audioUrl) URL.revokeObjectURL(previous.audioUrl);
      return next;
    });
  }, []);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 22 30" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
            <path d="M6 2.5v11a5 5 0 0 0 10 0v-11M11 18.5v9" />
          </svg>
          <span className="brand-name">
            {APP_NAME_PARTS[0]}
            <span className="brand-accent">{APP_NAME_PARTS[1]}</span>
          </span>
        </div>
        <div className="top-tools">
          <div className="seg" role="group" aria-label="Nom des notes">
            <button type="button" className={`seg-btn ${naming === "latin" ? "is-on" : ""}`} aria-pressed={naming === "latin"} onClick={() => chooseNaming("latin")}>
              Do Ré Mi
            </button>
            <button type="button" className={`seg-btn ${naming === "letter" ? "is-on" : ""}`} aria-pressed={naming === "letter"} onClick={() => chooseNaming("letter")}>
              C D E
            </button>
          </div>
          <span className="status" data-online={online}>
            <i className="status-dot" />
            <span className="sr-only">État du réseau : </span>
            <span className="status-text">{online ? "En ligne" : "Hors ligne"}</span>
          </span>
        </div>
      </header>

      <nav className="tabs" aria-label="Sections" ref={nav}>
        <span className="tabs-indicator" aria-hidden="true" />
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`tab ${tab === t.id ? "is-on" : ""}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => goTo(t.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            {t.short ? (
              <>
                <span className="tab-long">{t.label}</span>
                <span className="tab-short" aria-hidden="true">
                  {t.short}
                </span>
              </>
            ) : (
              <span>{t.label}</span>
            )}
          </button>
        ))}
      </nav>

      <CookieNotice onLearnMore={() => goTo("about")} />

      <main className="main">
        {/* La clé change avec l'onglet : le nouvel écran entre en fondu, en glissant dans le sens du déplacement. */}
        <div key={tab} className="view" style={{ "--dir": direction } as CSSProperties}>
          {tab === "live" && <LiveView naming={naming} />}
          {tab === "game" && <GameView naming={naming} />}
          {tab === "file" && (
            <FileView track={track} naming={naming} user={user} online={online} onTrack={openTrack} onGoAccount={() => goTo("account")} />
          )}
          {tab === "generate" && <GenerateView naming={naming} />}
          {tab === "library" && (
            <LibraryView
              user={user}
              online={online}
              naming={naming}
              onOpen={(t) => {
                openTrack(t);
                goTo("file");
              }}
              onGoAccount={() => goTo("account")}
              onGoFile={() => goTo("file")}
            />
          )}
          {tab === "account" && <AccountView user={user} online={online} onUser={setUser} />}
          {tab === "about" && <AboutView />}
        </div>
      </main>

      <footer className="foot">
        <span>
          {APP_NAME} · créé par {TEAM_NAME}
        </span>
        <button type="button" className="foot-link" aria-current={tab === "about" ? "page" : undefined} onClick={() => goTo("about")}>
          À propos
        </button>
      </footer>
    </div>
  );
}
