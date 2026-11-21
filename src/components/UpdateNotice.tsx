"use client";

import { useEffect, useState } from "react";
import { APP_NAME } from "@/lib/app";

/**
 * Mises à jour, comme dans un logiciel : la nouvelle version se télécharge en arrière-plan, puis ce
 * bandeau propose de redémarrer. Rien ne change sous les doigts de quelqu'un en train de jouer.
 */
export default function UpdateNotice() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let stopped = false;
    let registration: ServiceWorkerRegistration | undefined;

    const watch = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const check = () => {
        // « installed » avec une version déjà aux commandes : c'est une mise à jour, pas la première installation.
        if (!stopped && worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker);
      };
      check();
      worker.addEventListener("statechange", check);
    };
    const onFound = () => watch(registration?.installing ?? null);

    void navigator.serviceWorker.ready.then((ready) => {
      if (stopped) return;
      registration = ready;
      watch(ready.waiting);
      watch(ready.installing);
      ready.addEventListener("updatefound", onFound);
    });

    // Une application installée reste ouverte des jours : on regarde s'il y a du nouveau à chaque retour dessus.
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) registration?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      registration?.removeEventListener("updatefound", onFound);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!waiting) return null;

  const restart = () => {
    // La nouvelle version prend la main, puis la page se recharge avec elle.
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    waiting.postMessage({ type: "activate" });
  };

  return (
    <div className="update" role="status">
      <p>
        <strong>Mise à jour prête.</strong> Une nouvelle version de {APP_NAME} a été téléchargée.
      </p>
      <button type="button" className="btn btn-primary" onClick={restart}>
        Redémarrer
      </button>
    </div>
  );
}
