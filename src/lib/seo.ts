/**
 * Référencement : titres, descriptions, mots-clés, questions fréquentes et données structurées
 * (Schema.org). Tout est ici pour que les balises, le sitemap, llms.txt et le texte visible des
 * pages disent la même chose.
 */
import type { Metadata } from "next";
import { APP_NAME, MADE_IN, TEAM_MEMBERS, TEAM_NAME } from "./app";
import { SITE_URL } from "./site";

/** Adresse complète d'un chemin du site. */
export const absolute = (path: string) => `${SITE_URL}${path}`;

export const SITE_TITLE = `${APP_NAME} — reconnaître notes et accords, grille et solfa`;

export const SITE_DESCRIPTION = `${APP_NAME} reconnaît les notes et les accords au micro, et tire d'un morceau sa grille d'accords, son tempo et son solfa. Gratuit, sans compte, hors ligne.`;

/**
 * Mots-clés du site, pour la balise <meta name="keywords">. Google n'en tient aucun compte et Bing
 * se méfie des longues listes : la liste reste courte. Le vrai travail de mots-clés est dans les
 * titres et les textes des pages (accords, chord, solfa, piano, guitare, musique…).
 */
export const KEYWORDS = ["TwinsChord", "TwinsDev", "solfa", "accords", "chord", "piano", "guitare", "musique", "reconnaissance d'accords", "grille d'accords", "accordeur", "tonic sol-fa"];

export interface SitePage {
  path: string;
  /** Titre court, pour les liens et le fil d'Ariane. */
  label: string;
  title: string;
  description: string;
  /** Date de la dernière modification du contenu (AAAA-MM-JJ) : à changer quand le texte change. */
  updated: string;
  /** Faux : la page reste accessible et suivie par les robots, mais n'entre ni dans l'index ni dans le sitemap. */
  index: boolean;
}

/** Les pages publiques, indexables. La connexion et les adresses de service n'en font pas partie. */
export const PAGES: Record<"home" | "app" | "chords" | "song" | "solfa" | "about", SitePage> = {
  home: {
    path: "/",
    label: "Accueil",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    updated: "2026-11-22",
    index: true,
  },
  app: {
    path: "/app",
    label: "Application",
    // Le titre est le seul nom de l'application : c'est celui de sa fenêtre une fois installée.
    title: APP_NAME,
    description: `Ouvrez ${APP_NAME} : accordeur et reconnaissance d'accords au micro, analyse d'un morceau, générateur d'accompagnement, jeu de chant et piano.`,
    updated: "2026-11-22",
    // Presque pas de texte lisible par un robot : l'accueil et les guides portent le référencement.
    index: false,
  },
  song: {
    path: "/accords-d-une-chanson",
    label: "Accords d'une chanson",
    title: "Trouver les accords d'une chanson en ligne",
    description: "Importez un MP3 ou une vidéo : la grille d'accords, le tempo, la tonalité et le solfa s'affichent, à suivre pendant la lecture. Gratuit, hors ligne.",
    updated: "2026-11-22",
    index: true,
  },
  solfa: {
    path: "/solfa",
    label: "Le solfa",
    title: "Le solfa (tonic sol-fa) : lire d r m f s l t",
    description: "Le solfa expliqué simplement : les syllabes d r m f s l t, le do mobile, les octaves, le rythme — et comment obtenir le solfa d'un morceau.",
    updated: "2026-11-22",
    index: true,
  },
  chords: {
    path: "/accords",
    label: "Les accords",
    title: "Accords de piano et de guitare : notes et noms",
    description: "Lire un nom d'accord (C, Cm, C7, Cmaj7…), connaître les notes de chaque accord en Do Ré Mi et en C D E, et le reconnaître au micro.",
    updated: "2026-11-22",
    index: true,
  },
  about: {
    path: "/a-propos",
    label: "À propos",
    title: `À propos de ${APP_NAME} et de ${TEAM_NAME}`,
    description: `${APP_NAME} est créé par ${TEAM_NAME} (${TEAM_MEMBERS.join(" et ")}), à ${MADE_IN}. L'équipe et la confidentialité.`,
    updated: "2026-11-22",
    index: true,
  },
};

/**
 * Balises d'une page : titre et description propres à elle, adresse canonique, consigne d'indexation,
 * aperçu de partage. Chaque page publique passe par ici, pour qu'aucune n'hérite des balises d'une autre.
 */
export function pageMetadata(page: SitePage): Metadata {
  const title = page.title.includes(APP_NAME) ? page.title : `${page.title} — ${APP_NAME}`;
  // L'image de partage est citée explicitement : celle que Next ajoute d'après le fichier
  // src/app/opengraph-image.png ne vaut que pour l'accueil, pas pour les pages intérieures.
  const images = [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: `Logo de ${APP_NAME} : reconnaître les notes et les accords, grille d'accords et solfa` }];
  return {
    title: { absolute: title },
    description: page.description,
    alternates: { canonical: page.path },
    robots: page.index ? { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" } : { index: false, follow: true },
    openGraph: { type: "website", locale: "fr_FR", siteName: APP_NAME, title, description: page.description, url: page.path, images },
    twitter: { card: "summary_large_image", title, description: page.description, images },
  };
}

export interface FaqEntry {
  question: string;
  answer: string;
  /** Lien « pour aller plus loin », affiché sous la réponse. */
  more?: { href: string; label: string };
}

/** Questions fréquentes : affichées sur la page d'accueil et déclarées telles quelles en données structurées. */
export const FAQ: FaqEntry[] = [
  {
    question: `Qu'est-ce que ${APP_NAME} ?`,
    answer: `${APP_NAME} est une application web gratuite qui reconnaît les notes et les accords joués au piano, à la guitare ou chantés, et qui tire d'un enregistrement sa grille d'accords, son tempo, sa tonalité et le solfa de sa mélodie.`,
  },
  {
    question: "Comment reconnaître un accord joué au piano ou à la guitare ?",
    answer:
      "Ouvrez l'onglet Micro, autorisez le micro, choisissez « Accord » et jouez : le nom de l'accord s'affiche aussitôt (majeur, mineur, 7, maj7, m7, dim, aug, sus2, sus4), avec les notes qui le composent. En mode « Note », un accordeur indique si la note est juste.",
    more: { href: "/accords", label: "Lire les accords et connaître leurs notes" },
  },
  {
    question: "Comment trouver les accords et le solfa d'une chanson ?",
    answer:
      "Dans l'onglet Morceau, importez un fichier audio (MP3, WAV, M4A, OGG) ou une vidéo (MP4, MOV, WebM) de 20 minutes au plus. L'application affiche la grille d'accords, le tempo, la tonalité et le solfa de la mélodie, à suivre pendant la lecture. La tonalité peut être montée ou baissée.",
  },
  {
    question: "Qu'est-ce que le solfa ?",
    answer:
      "Le solfa (tonic sol-fa) est une notation musicale à do mobile : les notes s'écrivent d, r, m, f, s, l, t d'après leur place dans la gamme, et non d'après leur hauteur absolue. Il est très utilisé par les chorales, notamment à Madagascar.",
    more: { href: "/solfa", label: "Comprendre le solfa" },
  },
  {
    question: "Peut-on créer un accompagnement à partir d'une suite d'accords ?",
    answer:
      "Oui. Dans l'onglet Générer, écrivez vos accords (par exemple C G Am F) : l'application les joue en boucle avec jusqu'à cinq pistes — piano, guitare, orgue, cordes, saxophone, basse, batterie — dans le style choisi (pop, gospel, ballade, jazz…), et le son se télécharge en WAV.",
  },
  {
    question: `${APP_NAME} fonctionne-t-il sans Internet ?`,
    answer:
      "Oui. Après une première visite, l'application s'ouvre et fonctionne hors ligne : micro, analyse d'un morceau, générateur, jeu de chant et piano. Seuls le compte et la bibliothèque demandent une connexion.",
  },
  {
    question: `${APP_NAME} est-il gratuit ? Faut-il un compte ?`,
    answer:
      "L'application est gratuite et s'utilise sans compte. Le compte, facultatif, sert uniquement à enregistrer ses analyses pour les retrouver sur un autre appareil.",
  },
  {
    question: "Sur quels appareils l'utiliser ?",
    answer:
      "Dans le navigateur d'un téléphone Android, d'un iPhone, d'un iPad ou d'un ordinateur Windows ou Mac. L'application peut aussi s'installer sur l'appareil : elle s'ouvre alors depuis son icône, dans sa propre fenêtre.",
  },
  {
    question: "Mes enregistrements sont-ils envoyés sur Internet ?",
    answer:
      "Non. Le son du micro et les fichiers importés sont analysés sur votre appareil : ils ne sont ni enregistrés ni envoyés. Avec un compte, seul le résultat de l'analyse est conservé, jamais le fichier audio.",
    more: { href: "/a-propos", label: "Confidentialité" },
  },
  {
    question: `Qui a créé ${APP_NAME} ?`,
    answer: `${APP_NAME} est conçu et développé à ${MADE_IN} par ${TEAM_NAME}, composé de ${TEAM_MEMBERS.join(" et ")}.`,
  },
];

// ——— Données structurées (Schema.org, JSON-LD) ———

const ORG_ID = absolute("/#organisation");
const SITE_ID = absolute("/#site");
const APP_ID = absolute("/#application");

/** L'équipe qui publie le site. */
export function organizationLd() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: TEAM_NAME,
    url: absolute(PAGES.about.path),
    logo: { "@type": "ImageObject", url: absolute("/logo/png/twinschord-monogramme-512.png"), width: 512, height: 512 },
    founder: TEAM_MEMBERS.map((name) => ({ "@type": "Person", name })),
    foundingLocation: { "@type": "Country", name: MADE_IN },
  };
}

export function websiteLd() {
  return {
    "@type": "WebSite",
    "@id": SITE_ID,
    name: APP_NAME,
    url: absolute("/"),
    description: SITE_DESCRIPTION,
    inLanguage: "fr",
    publisher: { "@id": ORG_ID },
  };
}

/** L'application elle-même : gratuite, dans le navigateur, sur tous les systèmes. */
export function applicationLd() {
  return {
    "@type": "WebApplication",
    "@id": APP_ID,
    name: APP_NAME,
    url: absolute(PAGES.home.path),
    description: SITE_DESCRIPTION,
    applicationCategory: "MultimediaApplication",
    applicationSubCategory: "Musique",
    operatingSystem: "Android, iOS, Windows, macOS",
    browserRequirements: "Navigateur récent avec JavaScript ; micro facultatif.",
    inLanguage: "fr",
    isAccessibleForFree: true,
    // Pas de note ni d'avis : il n'en existe pas, et en inventer serait une tromperie.
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    featureList: [
      "Reconnaissance des notes au micro, avec accordeur",
      "Reconnaissance des accords au micro (piano, guitare)",
      "Grille d'accords, tempo et tonalité d'un fichier audio ou vidéo",
      "Solfa (tonic sol-fa) de la mélodie",
      "Transposition des notes et du son",
      "Générateur d'accompagnement à partir d'une suite d'accords",
      "Jeu de chant pour travailler la justesse",
      "Piano jouable, en plein écran",
      "Fonctionne hors ligne, installable",
    ],
    screenshot: [absolute("/captures/ordinateur.png"), absolute("/captures/telephone.png")],
    image: absolute("/logo/png/twinschord-logo-1200.png"),
    creator: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
  };
}

export function faqLd() {
  return {
    "@type": "FAQPage",
    "@id": absolute("/#questions"),
    inLanguage: "fr",
    mainEntity: FAQ.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

/** Fil d'Ariane d'une page intérieure : Accueil › page. */
export function breadcrumbLd(page: SitePage) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [PAGES.home, page].map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: absolute(item.path),
    })),
  };
}

/** Une page de contenu (guide). */
export function articleLd(page: SitePage, headline: string) {
  return {
    "@type": "Article",
    "@id": absolute(`${page.path}#article`),
    headline,
    description: page.description,
    inLanguage: "fr",
    url: absolute(page.path),
    mainEntityOfPage: absolute(page.path),
    datePublished: page.updated,
    dateModified: page.updated,
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    image: absolute("/opengraph-image.png"),
    isPartOf: { "@id": SITE_ID },
    about: { "@id": APP_ID },
  };
}

/** Assemble plusieurs objets en un seul document JSON-LD. */
export const graph = (...nodes: object[]) => ({ "@context": "https://schema.org", "@graph": nodes });
