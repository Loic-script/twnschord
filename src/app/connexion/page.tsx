"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AccountView from "@/components/AccountView";
import { api, type User } from "@/lib/api";
import { APP_NAME } from "@/lib/app";
import { isInstalled } from "@/lib/installedApp";

/** Page de connexion et de création de compte ; une fois connecté, on entre dans l'application. */
export default function ConnexionPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [online, setOnline] = useState(true);
  /** Dans l'application installée, il n'y a pas de page d'accueil où retourner. */
  const [installed, setInstalled] = useState(false);
  /** /connexion?mode=creer ouvre directement le formulaire d'inscription. */
  const [initialMode, setInitialMode] = useState<"login" | "register">("login");

  useEffect(() => {
    setInstalled(isInstalled());
    if (new URLSearchParams(window.location.search).get("mode") === "creer") setInitialMode("register");
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    // Déjà connecté : la page l'indique et propose d'entrer.
    api.me().then(setUser, () => {});
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <div className="auth">
      <Link href={installed ? "/app" : "/"} aria-label={installed ? `${APP_NAME} — ouvrir l'application` : `${APP_NAME} — retour à l'accueil`}>
        <img className="brand-logo" src="/logo/twinschord-logo-reverse.svg" alt={APP_NAME} width={1267} height={267} />
      </Link>
      <AccountView
        key={initialMode}
        initialMode={initialMode}
        user={user}
        online={online}
        onUser={(next) => {
          setUser(next);
          if (next) router.push("/app");
        }}
      />
      <div className="actions">
        {/* Jaune seulement une fois connecté : avant, c'est le bouton de la carte qui est l'action principale. */}
        <Link className={user ? "btn btn-primary" : "btn"} href="/app">
          {user ? "Ouvrir l'application" : "Continuer sans compte"}
        </Link>
        {/* « web-only » : masqué dans l'application installée, qui n'a pas de page d'accueil. */}
        <Link className="btn btn-quiet web-only" href="/">
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
