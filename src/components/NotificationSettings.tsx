"use client";

import { useEffect, useState } from "react";
import { APP_NAME } from "@/lib/app";
import { disablePush, enablePush, pushState, sendTestPush, type PushState } from "@/lib/pushClient";

interface Props {
  online: boolean;
  /** Un compte est connecté : l'appareil reçoit alors aussi ce qui concerne ce compte. */
  signedIn: boolean;
}

/** Réglage des notifications pour cet appareil. */
export default function NotificationSettings({ online, signedIn }: Props) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    pushState().then(setState, () => setState("unsupported"));
  }, []);

  const run = async (action: () => Promise<PushState | void>, done?: string) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const next = await action();
      if (next) setState(next);
      if (done && (!next || next === "on")) setInfo(done);
      if (next === "blocked") setError("Les notifications ont été refusées. Pour changer d'avis, autorisez-les pour ce site dans les réglages du navigateur.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'opération a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2 className="panel-sub">Notifications</h2>
      <p>
        {APP_NAME} peut prévenir cet appareil même quand l&apos;application est fermée : quand un morceau est enregistré dans
        votre bibliothèque depuis un autre appareil, et lors des annonces de {APP_NAME}. Toucher la notification ouvre
        directement ce dont elle parle.
      </p>

      {state === null && <p className="note">Vérification…</p>}

      {state === "unsupported" && <p className="note">Ce navigateur ne sait pas recevoir de notifications. Essayez avec Chrome, Edge, Firefox ou Safari récent.</p>}

      {state === "needs-install" && (
        <p className="note">
          Sur iPhone et iPad, les notifications ne sont possibles qu&apos;une fois l&apos;application installée : dans Safari,
          touchez « Partager » puis « Sur l&apos;écran d&apos;accueil », ouvrez {APP_NAME} depuis son icône, et revenez ici.
        </p>
      )}

      {state === "blocked" && (
        <p className="note">
          Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur (icône à gauche de
          l&apos;adresse), puis rechargez la page.
        </p>
      )}

      {state === "off" && (
        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={busy || !online} onClick={() => run(enablePush, "Notifications activées sur cet appareil.")}>
            {busy ? "Un instant…" : "Activer les notifications"}
          </button>
          {!online && <p className="note">Hors ligne : l&apos;activation demande Internet.</p>}
        </div>
      )}

      {state === "on" && (
        <>
          <p className="note" role="status">
            Activées sur cet appareil.{" "}
            {signedIn ? "Il est rattaché à votre compte." : "Connectez-vous pour être prévenu aussi de ce qui arrive dans votre bibliothèque."}
          </p>
          <div className="actions">
            <button type="button" className="btn" disabled={busy || !online} onClick={() => run(sendTestPush, "Notification d'essai envoyée : elle arrive dans quelques secondes.")}>
              Envoyer une notification d&apos;essai
            </button>
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => run(disablePush)}>
              Désactiver
            </button>
          </div>
        </>
      )}

      {info && (
        <p className="note" role="status">
          {info}
        </p>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <p className="note">
        Le son et la vibration sont ceux que votre appareil réserve aux notifications : ils se règlent dans ses paramètres,
        pas dans l&apos;application.
      </p>
    </section>
  );
}
