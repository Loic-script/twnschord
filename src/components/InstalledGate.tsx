"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isInstalled } from "@/lib/installedApp";

/**
 * Dans l'application installée, la page d'accueil du site n'a pas lieu d'être : on entre directement
 * dans l'application. (Le script de layout.tsx fait de même dès le chargement ; ce composant couvre
 * les arrivées par un lien interne, sans rechargement.)
 */
export default function InstalledGate() {
  const router = useRouter();
  useEffect(() => {
    if (isInstalled()) router.replace("/app");
  }, [router]);
  return null;
}
