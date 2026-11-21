"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type User } from "@/lib/api";

type Mode = "login" | "register";

interface Props {
  user: User | null;
  online: boolean;
  onUser: (user: User | null) => void;
  /** Formulaire affiché en premier : connexion (par défaut) ou inscription. */
  initialMode?: Mode;
}

const TITLES: Record<Mode, string> = { login: "Se connecter", register: "Créer un compte" };

// Œil ouvert / œil barré du bouton qui montre ou cache le mot de passe.
const EYE = "M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z";
const EYE_OFF = "M4 4l16 16M10.5 5.6A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.5M6.5 7.5A17 17 0 0 0 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4-1M10 10a3 3 0 0 0 4 4";

export default function AccountView({ user, online, onUser, initialMode = "login" }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Anti-spam : un champ piège que seuls les robots remplissent, et l'heure d'affichage du formulaire.
  const [website, setWebsite] = useState("");
  const shownAt = useRef(0);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [mode]);

  const choose = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onUser(
        mode === "login"
          ? await api.login(email, password)
          : await api.register(email, password, name, { website, elapsed: Date.now() - shownAt.current }),
      );
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
      <section className="panel account">
        <div className="account-id">
          <span className="account-avatar" aria-hidden="true">
            {(user.name || user.email).trim().charAt(0).toUpperCase()}
          </span>
          <div>
            <h1 className="panel-title">{user.name ? `Bonjour ${user.name}` : "Votre compte"}</h1>
            <p className="note account-mail">{user.email}</p>
          </div>
        </div>
        <p>Les analyses que vous enregistrez sont gardées dans votre bibliothèque.</p>
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
    <section className="panel account">
      <h1 className="panel-title">{TITLES[mode]}</h1>

      {/* Le repère de l'onglet choisi glisse d'un côté à l'autre (data-mode). */}
      <div className="seg seg-fill" role="group" aria-label="Connexion ou inscription" data-mode={mode}>
        <button type="button" className={`seg-btn ${mode === "login" ? "is-on" : ""}`} aria-pressed={mode === "login"} onClick={() => choose("login")}>
          Connexion
        </button>
        <button type="button" className={`seg-btn ${mode === "register" ? "is-on" : ""}`} aria-pressed={mode === "register"} onClick={() => choose("register")}>
          Inscription
        </button>
      </div>

      {!online && <p className="note">Hors ligne : la connexion au compte demande Internet.</p>}

      <form className="form" onSubmit={submit}>
        {mode === "register" && (
          <div className="hp" aria-hidden="true">
            <label>
              Ne remplissez pas ce champ
              <input name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
            </label>
          </div>
        )}
        {mode === "register" && (
          <label className="field field-in">
            <span>Prénom (facultatif)</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={80} />
          </label>
        )}
        <label className="field">
          <span>Adresse e-mail</span>
          <input className="input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" spellCheck={false} required />
        </label>
        <div className="field">
          <label htmlFor="account-password">Mot de passe</label>
          <div className="pw">
            <input
              id="account-password"
              className="input"
              type={visible ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              autoCapitalize="none"
              spellCheck={false}
              minLength={mode === "register" ? 8 : undefined}
              aria-describedby={mode === "register" ? "account-password-hint" : undefined}
              required
            />
            <button type="button" className="pw-toggle" aria-pressed={visible} aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"} onClick={() => setVisible((v) => !v)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={visible ? EYE_OFF : EYE} />
              </svg>
            </button>
          </div>
          {mode === "register" && (
            <small id="account-password-hint" className="field-hint">
              8 caractères au moins.
            </small>
          )}
        </div>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !online}>
            {busy ? "Un instant…" : TITLES[mode]}
          </button>
        </div>
      </form>
    </section>
  );
}
