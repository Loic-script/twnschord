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
  register: (email: string, password: string, name: string) =>
    call<{ user: User }>("/api/auth/register", "POST", { email, password, name }).then((r) => r.user),
  login: (email: string, password: string) =>
    call<{ user: User }>("/api/auth/login", "POST", { email, password }).then((r) => r.user),
  logout: () => call<{ ok: true }>("/api/auth/logout", "POST", {}),
  listAnalyses: () => call<{ analyses: SavedSummary[] }>("/api/analyses").then((r) => r.analyses),
  saveAnalysis: (title: string, analysis: Analysis) =>
    call<{ analysis: SavedSummary }>("/api/analyses", "POST", { title, analysis }).then((r) => r.analysis),
  getAnalysis: (id: string) =>
    call<{ id: string; title: string; analysis: Analysis }>(`/api/analyses/${encodeURIComponent(id)}`),
  deleteAnalysis: (id: string) => call<{ ok: true }>(`/api/analyses/${encodeURIComponent(id)}`, "DELETE"),
};
