"use client";

import { useEffect, useState } from "react";
import { APP_NAME } from "@/lib/app";

/** Clé du navigateur qui retient que le bandeau a été lu. La même clé est lue par le script de `layout.tsx`. */
export const COOKIES_KEY = "twinschord.cookies";

/**
 * Bandeau d'information sur les cookies. L'application ne dépose aucun cookie
 * de suivi ni de publicité : il n'y a donc rien à refuser, seulement à savoir.
 * Si un outil de mesure d'audience ou de publicité était ajouté un jour, ce
 * bandeau devrait proposer un vrai choix (accepter / refuser) avant tout dépôt.
 *
 * Il fait partie de la page dès le premier affichage, pour ne rien décaler en
 * arrivant après coup ; pour qui l'a déjà lu, un court script placé dans
 * `layout.tsx` le masque avant même que la page ne soit dessinée.
 */
interface Props {
  /** Dans l'application : ouvre l'écran « À propos ». */
  onLearnMore?: () => void;
  /** Hors de l'application (page d'accueil) : adresse où lire les explications. */
  learnMoreHref?: string;
}

export default function CookieNotice({ onLearnMore, learnMoreHref }: Props) {
  const [state, setState] = useState<"shown" | "leaving" | "hidden">("shown");

  useEffect(() => {
    try {
      if (localStorage.getItem(COOKIES_KEY) === "ok") setState("hidden");
    } catch {
      // Stockage indisponible : le bandeau reste affiché, il reviendra à la prochaine visite.
    }
  }, []);

  useEffect(() => {
    if (state !== "leaving") return;
    const timer = setTimeout(() => setState("hidden"), 220);
    return () => clearTimeout(timer);
  }, [state]);

  if (state === "hidden") return null;

  const dismiss = () => {
    try {
      localStorage.setItem(COOKIES_KEY, "ok");
    } catch {
      // Sans stockage, le bandeau reviendra à la prochaine visite.
    }
    setState("leaving");
  };

  return (
    <section className="cookies" data-state={state} aria-label="Cookies et données personnelles">
      <p>
        <strong>{APP_NAME} ne vous suit pas.</strong> Aucun cookie de publicité ni de mesure d&apos;audience. Un seul cookie
        sert à vous garder connecté si vous créez un compte ; vos réglages et vos records restent sur cet appareil.
      </p>
      <div className="cookies-actions">
        <button type="button" className="btn btn-primary" onClick={dismiss}>
          J&apos;ai compris
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            dismiss();
            if (onLearnMore) onLearnMore();
            else if (learnMoreHref) window.location.assign(learnMoreHref);
          }}
        >
          En savoir plus
        </button>
      </div>
    </section>
  );
}
