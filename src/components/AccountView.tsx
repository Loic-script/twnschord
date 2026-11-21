"use client";

import { useState, type FormEvent } from "react";
import { api, type User } from "@/lib/api";

interface Props {
  user: User | null;
  online: boolean;
  onUser: (user: User | null) => void;
}

export default function AccountView({ user, online, onUser }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onUser(mode === "login" ? await api.login(email, password) : await api.register(email, password, name));
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "La connexion a échoué.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.logout();
      onUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "La déconnexion a échoué.");
    } finally {
      setBusy(false);
    }
  };

  if (user) {
    return (
      <section className="panel">
        <h1 className="panel-title">{user.name ? `Bonjour ${user.name}` : "Votre compte"}</h1>
        <p>
          Connecté avec <strong>{user.email}</strong>. Les analyses que vous enregistrez sont gardées dans votre
          bibliothèque.
        </p>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={logout} disabled={busy || !online}>
            Se déconnecter
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <h1 className="panel-title">{mode === "login" ? "Se connecter" : "Créer un compte"}</h1>
      <p className="note">
        Le compte sert uniquement à enregistrer vos analyses. La reconnaissance des notes et des accords fonctionne sans
        compte et sans Internet.
      </p>
      <div className="seg" role="group" aria-label="Connexion ou création de compte">
        <button type="button" className={`seg-btn ${mode === "login" ? "is-on" : ""}`} aria-pressed={mode === "login"} onClick={() => setMode("login")}>
          J&apos;ai un compte
        </button>
        <button type="button" className={`seg-btn ${mode === "register" ? "is-on" : ""}`} aria-pressed={mode === "register"} onClick={() => setMode("register")}>
          Nouveau compte
        </button>
      </div>

      {!online && <p className="note">Hors ligne : la connexion au compte demande Internet.</p>}

      <form className="form" onSubmit={submit}>
        {mode === "register" && (
          <label className="field">
            <span>Prénom (facultatif)</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={80} />
          </label>
        )}
        <label className="field">
          <span>Adresse e-mail</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field">
          <span>Mot de passe{mode === "register" ? " (8 caractères au moins)" : ""}</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "register" ? 8 : undefined}
            required
          />
        </label>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !online}>
            {busy ? "Un instant…" : mode === "login" ? "Se connecter" : "Créer le compte"}
          </button>
        </div>
      </form>
    </section>
  );
}
