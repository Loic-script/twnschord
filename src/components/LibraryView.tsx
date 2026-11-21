"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type SavedSummary, type User } from "@/lib/api";
import { keyLabel, type NoteNaming } from "@/lib/audio/notes";
import type { Track } from "./App";

interface Props {
  user: User | null;
  online: boolean;
  naming: NoteNaming;
  onOpen: (track: Track) => void;
  onGoAccount: () => void;
  onGoFile: () => void;
}

const dateText = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

const durationText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

export default function LibraryView({ user, online, naming, onOpen, onGoAccount, onGoFile }: Props) {
  const [items, setItems] = useState<SavedSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await api.listAnalyses());
    } catch (err) {
      setError(err instanceof Error ? err.message : "La bibliothèque n'a pas pu être chargée.");
    }
  }, []);

  useEffect(() => {
    if (user && online) void load();
  }, [user, online, load]);

  if (!user) {
    return (
      <section className="panel">
        <h1 className="panel-title">Vos morceaux, sur tous vos appareils</h1>
        <p>
          Avec un compte, chaque analyse que vous enregistrez — accords, tempo, solfa — se retrouve ici, sur votre
          ordinateur comme sur votre téléphone.
        </p>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={onGoAccount}>
            Créer un compte ou se connecter
          </button>
        </div>
      </section>
    );
  }

  const open = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const saved = await api.getAnalysis(id);
      onOpen({ id: Date.now(), title: saved.title, analysis: saved.analysis, audioUrl: null, savedId: saved.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ce morceau n'a pas pu être ouvert.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await api.deleteAnalysis(id);
      setItems((list) => list?.filter((item) => item.id !== id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "La suppression a échoué.");
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  return (
    <section className="panel">
      <h1 className="panel-title">Bibliothèque</h1>
      {!online && <p className="note">Hors ligne : la bibliothèque sera de nouveau accessible avec Internet.</p>}
      {error && (
        <p className="alert" role="alert">
          {error}{" "}
          <button type="button" className="btn btn-quiet" onClick={load}>
            Réessayer
          </button>
        </p>
      )}
      {online && items === null && !error && <p className="note">Chargement…</p>}
      {items !== null && items.length === 0 && (
        <>
          <p>Aucun morceau enregistré pour l&apos;instant. Analysez un fichier, puis enregistrez-le pour le retrouver ici.</p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={onGoFile}>
              Analyser un morceau
            </button>
          </div>
        </>
      )}
      {items !== null && items.length > 0 && (
        <ul className="rows">
          {items.map((item) => (
            <li key={item.id} className="row">
              <button type="button" className="row-open" onClick={() => open(item.id)} disabled={busy === item.id}>
                <span className="row-title">{item.title}</span>
                <span className="row-meta">
                  {keyLabel(item.key.tonic, item.key.mode, naming)} · {Math.round(item.tempo)} bpm · {durationText(item.duration)} ·{" "}
                  {dateText(item.createdAt)}
                </span>
              </button>
              {confirming === item.id ? (
                <span className="actions">
                  <button type="button" className="btn btn-danger" onClick={() => remove(item.id)} disabled={busy === item.id}>
                    Supprimer définitivement
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={() => setConfirming(null)}>
                    Annuler
                  </button>
                </span>
              ) : (
                <button type="button" className="btn btn-quiet" onClick={() => setConfirming(item.id)}>
                  Supprimer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
