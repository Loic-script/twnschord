"use client";

import { APP_NAME } from "@/lib/app";
import { PLATFORMS, useInstall } from "./useInstall";

/** Les quatre boutons d'installation du bas de la page d'accueil (la logique est dans useInstall). */
export default function InstallButtons() {
  const { installed, choose, dialog } = useInstall();

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
      {dialog}
    </>
  );
}
