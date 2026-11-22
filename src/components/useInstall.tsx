"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { APP_NAME } from "@/lib/app";
import { isInstalled } from "@/lib/installedApp";

export type Platform = "android" | "windows" | "iphone" | "mac";

// TwinsChord est une application web installable : il n'y a ni fichier à télécharger ni magasin
// d'applications. Choisir une plateforme lance l'installation du navigateur quand il la propose pour
// cet appareil, et montre sinon les étapes à suivre.
export const PLATFORMS: { id: Platform; name: string; hint: string; icon: string; steps: string[] }[] = [
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

// L'invitation d'installation du navigateur n'arrive qu'une fois par page et ne sert qu'une fois :
// elle est gardée ici, commune au menu de l'en-tête et aux boutons du bas de page.
let deferred: InstallPrompt | null = null;
let listening = false;
const installedListeners = new Set<() => void>();

function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPrompt;
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedListeners.forEach((notify) => notify());
  });
}

/**
 * Installation de l'application : `choose(plateforme)` installe ou explique comment faire,
 * `dialog` est la fenêtre d'explications à placer dans le rendu, `device` la plateforme de cet appareil.
 */
export function useInstall(): { installed: boolean; device: Platform | null; choose: (platform: Platform) => Promise<void>; dialog: ReactNode } {
  const [open, setOpen] = useState<Platform | null>(null);
  const [installed, setInstalled] = useState(false);
  const [device, setDevice] = useState<Platform | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    // Le service worker rend l'application installable et utilisable hors ligne.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev").catch(() => {});
    }
    listen();
    setInstalled(isInstalled());
    setDevice(currentPlatform());
    const done = () => setInstalled(true);
    installedListeners.add(done);
    return () => {
      installedListeners.delete(done);
    };
  }, []);

  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);

  const choose = async (platform: Platform) => {
    // Sur l'appareil concerné, si le navigateur sait installer tout seul, on lui laisse la main.
    if (deferred && platform === currentPlatform()) {
      const event = deferred;
      deferred = null;
      try {
        await event.prompt();
        if ((await event.userChoice).outcome === "accepted") return;
      } catch {
        // Invitation déjà utilisée ou refusée par le navigateur : on montre les étapes.
      }
    }
    setOpen(platform);
  };

  const shown = PLATFORMS.find((p) => p.id === open);

  return {
    installed,
    device,
    choose,
    dialog: (
      <dialog ref={dialog} className="lp-dialog" onClose={() => setOpen(null)} aria-labelledby={titleId}>
        {shown && (
          <>
            <h2 id={titleId} className="panel-sub">
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
    ),
  };
}
