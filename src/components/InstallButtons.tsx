"use client";

import { useEffect, useRef, useState } from "react";
import { APP_NAME } from "@/lib/app";

type Platform = "android" | "windows" | "iphone" | "mac";

// TwinsChord est une application web installable : il n'y a ni fichier à télécharger ni magasin
// d'applications. Chaque bouton lance l'installation du navigateur quand il la propose pour cet
// appareil, et montre sinon les étapes à suivre.
const PLATFORMS: { id: Platform; name: string; hint: string; icon: string; steps: string[] }[] = [
  {
    id: "android",
    name: "Android",
    hint: "Téléphone et tablette",
    icon: "M7 10h10v7a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-7zM7 10a5 5 0 0 1 10 0M9 4.5l1.2 2M15 4.5l-1.2 2M4.5 10.5v5M19.5 10.5v5M10 18v2.5M14 18v2.5",
    steps: [
      "Ouvrez cette page dans Chrome.",
      "Touchez le menu ⋮ en haut à droite.",
      "Choisissez « Installer l'application » (ou « Ajouter à l'écran d'accueil »).",
      `Validez : l'icône ${APP_NAME} apparaît sur votre écran d'accueil.`,
    ],
  },
  {
    id: "windows",
    name: "Windows",
    hint: "Ordinateur",
    icon: "M4 5.5l7-1v7H4v-6zM13 4.2l7-1v8.3h-7V4.2zM4 13h7v7l-7-1v-6zM13 13h7v8.3l-7-1V13z",
    steps: [
      "Ouvrez cette page dans Chrome ou Edge.",
      "Cliquez sur l'icône d'installation à droite de la barre d'adresse — ou ouvrez le menu, puis « Installer TwinsChord ».",
      "Validez : l'application s'ouvre dans sa propre fenêtre et se retrouve dans le menu Démarrer.",
    ],
  },
  {
    id: "iphone",
    name: "iPhone",
    hint: "et iPad",
    icon: "M8 3.5h8a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5zM10.5 6h3M11 18h2",
    steps: [
      "Ouvrez cette page dans Safari.",
      "Touchez le bouton Partager (le carré avec une flèche vers le haut).",
      "Faites défiler et choisissez « Sur l'écran d'accueil ».",
      "Touchez « Ajouter » : l'icône apparaît sur votre écran d'accueil.",
    ],
  },
  {
    id: "mac",
    name: "Mac",
    hint: "Ordinateur",
    icon: "M4.5 5.5h15a1 1 0 0 1 1 1V16h-17V6.5a1 1 0 0 1 1-1zM2.5 16h19l-1 2.5h-17l-1-2.5zM10 18.5h4",
    steps: [
      "Dans Safari : menu Fichier, puis « Ajouter au Dock ».",
      "Dans Chrome ou Edge : cliquez sur l'icône d'installation à droite de la barre d'adresse.",
      "Validez : l'application s'ouvre dans sa propre fenêtre, depuis le Dock ou le Launchpad.",
    ],
  },
];

/** L'événement que Chrome et Edge émettent quand l'installation est possible. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function currentPlatform(): Platform | null {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iphone";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh/i.test(ua)) return "mac";
  return null;
}

export default function InstallButtons() {
  const [open, setOpen] = useState<Platform | null>(null);
  const [installed, setInstalled] = useState(false);
  const prompt = useRef<InstallPrompt | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // Le service worker rend l'application installable et utilisable hors ligne.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev").catch(() => {});
    }
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const ready = (event: Event) => {
      event.preventDefault();
      prompt.current = event as InstallPrompt;
    };
    const done = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);

  const choose = async (platform: Platform) => {
    // Sur l'appareil concerné, si le navigateur sait installer tout seul, on lui laisse la main.
    if (prompt.current && platform === currentPlatform()) {
      const event = prompt.current;
      prompt.current = null;
      await event.prompt();
      if ((await event.userChoice).outcome === "accepted") return;
    }
    setOpen(platform);
  };

  const shown = PLATFORMS.find((p) => p.id === open);

  return (
    <>
      <div className="lp-dl">
        {PLATFORMS.map((p) => (
          <button key={p.id} type="button" className="lp-dl-btn" onClick={() => void choose(p.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={p.icon} />
            </svg>
            <span>
              <small>Installer sur</small>
              <strong>{p.name}</strong>
            </span>
          </button>
        ))}
      </div>
      <p className="note">
        {installed
          ? `${APP_NAME} est déjà installée sur cet appareil.`
          : `${APP_NAME} s'installe depuis le navigateur, sans passer par un magasin d'applications : elle prend peu de place, se met à jour toute seule et fonctionne hors ligne.`}
      </p>

      <dialog ref={dialog} className="lp-dialog" onClose={() => setOpen(null)} aria-labelledby="install-title">
        {shown && (
          <>
            <h2 id="install-title" className="panel-sub">
              Installer sur {shown.name}
            </h2>
            <ol>
              {shown.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <form method="dialog" className="actions">
              <button className="btn btn-primary">J&apos;ai compris</button>
            </form>
          </>
        )}
      </dialog>
    </>
  );
}
