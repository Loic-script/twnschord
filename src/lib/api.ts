import type { Analysis, KeyMode } from "./audio/types";

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface SavedSummary {
  id: string;
  title: string;
  duration: number;
  tempo: number;
  key: { tonic: number; mode: KeyMode };
  createdAt: string;
}

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Serveur injoignable. Vérifiez votre connexion Internet.");
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || data === null) {
    throw new Error(data?.error ?? `Le serveur a répondu par une erreur (${response.status}).`);
  }
  return data;
}

export const api = {
  me: () => call<{ user: User | null }>("/api/auth/me").then((r) => r.user),
  /** `website` (champ piège, vide pour une personne) et `elapsed` (temps passé sur le formulaire) servent à l'anti-spam. */
  register: (email: string, password: string, name: string, guard: { website: string; elapsed: number }) =>
    call<{ user: User }>("/api/auth/register", "POST", { email, password, name, ...guard }).then((r) => r.user),
  login: (email: string, password: string) =>
    call<{ user: User }>("/api/auth/login", "POST", { email, password }).then((r) => r.user),
  logout: () => call<{ ok: true }>("/api/auth/logout", "POST", {}),
  listAnalyses: () => call<{ analyses: SavedSummary[] }>("/api/analyses").then((r) => r.analyses),
  /**
   * `pushEndpoint` : l'abonnement aux notifications de cet appareil, s'il en a un. Le serveur prévient
   * les autres appareils du compte, pas celui qui vient d'enregistrer.
   */
  saveAnalysis: (title: string, analysis: Analysis, pushEndpoint?: string | null) =>
    call<{ analysis: SavedSummary }>("/api/analyses", "POST", { title, analysis, pushEndpoint: pushEndpoint ?? undefined }).then((r) => r.analysis),
  getAnalysis: (id: string) =>
    call<{ id: string; title: string; analysis: Analysis }>(`/api/analyses/${encodeURIComponent(id)}`),
  deleteAnalysis: (id: string) => call<{ ok: true }>(`/api/analyses/${encodeURIComponent(id)}`, "DELETE"),
};
