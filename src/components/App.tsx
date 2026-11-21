"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type User } from "@/lib/api";
import { APP_NAME, TEAM_NAME } from "@/lib/app";
import { prewarmAnalysis } from "@/lib/audio/analyzeClient";
import type { NoteNaming } from "@/lib/audio/notes";
import type { Analysis } from "@/lib/audio/types";
import AboutView from "./AboutView";
import AccountView from "./AccountView";
import FileView from "./FileView";
import GenerateView from "./GenerateView";
import LibraryView from "./LibraryView";
import LiveView from "./LiveView";
import SingView from "./SingView";

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
type Tab = "live" | "sing" | "file" | "generate" | "library" | "account" | "about";

// `short` : libellé de remplacement quand la barre d'onglets est à l'étroit (téléphone).
const TABS: { id: Tab; label: string; short?: string; icon: string }[] = [
  { id: "live", label: "Micro", icon: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" },
  { id: "sing", label: "Chant", icon: "M4 10v4M8 6v12M12 9v6M16 4v16M20 10v4" },
  { id: "file", label: "Morceau", icon: "M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z" },
  { id: "generate", label: "Générer", icon: "M4 5h16v14H4zM8 5v8h2.7V5M13.3 5v8H16V5M9.35 13v6M14.65 13v6" },
  { id: "library", label: "Bibliothèque", short: "Biblio", icon: "M5 4v16M10 4v16M14.5 5.5l4 14.5M3 20h18" },
  { id: "account", label: "Compte", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0" },
];

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
          <span className="brand-name">{APP_NAME}</span>
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

      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`tab ${tab === t.id ? "is-on" : ""}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
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

      <main className="main">
        {tab === "live" && <LiveView naming={naming} />}
        {tab === "sing" && <SingView naming={naming} />}
        {tab === "file" && (
          <FileView track={track} naming={naming} user={user} online={online} onTrack={openTrack} onGoAccount={() => setTab("account")} />
        )}
        {tab === "generate" && <GenerateView naming={naming} />}
        {tab === "library" && (
          <LibraryView
            user={user}
            online={online}
            naming={naming}
            onOpen={(t) => {
              openTrack(t);
              setTab("file");
            }}
            onGoAccount={() => setTab("account")}
            onGoFile={() => setTab("file")}
          />
        )}
        {tab === "account" && <AccountView user={user} online={online} onUser={setUser} />}
        {tab === "about" && <AboutView />}
      </main>

      <footer className="foot">
        <span>
          {APP_NAME} · créé par {TEAM_NAME}
        </span>
        <button type="button" className="foot-link" aria-current={tab === "about" ? "page" : undefined} onClick={() => setTab("about")}>
          À propos
        </button>
      </footer>
    </div>
  );
}
