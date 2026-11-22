import { APP_NAME, MADE_IN, TEAM_MEMBERS, TEAM_NAME } from "@/lib/app";
import { absolute, FAQ, PAGES, SITE_DESCRIPTION } from "@/lib/seo";

// /llms.txt : présentation du site en texte simple, au format proposé par llmstxt.org.
// Aucun moteur ne déclare s'en servir à ce jour ; le fichier ne coûte rien et reste exact, car il
// est produit à partir des mêmes textes que les pages.
export const dynamic = "force-static";

export function GET() {
  const link = (page: (typeof PAGES)[keyof typeof PAGES]) => `- [${page.label}](${absolute(page.path)}): ${page.description}`;
  const lines = [
    `# ${APP_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `${APP_NAME} est une application web gratuite, en français, conçue et développée à ${MADE_IN} par ${TEAM_NAME} (${TEAM_MEMBERS.join(" et ")}). Elle s'utilise dans le navigateur, sans compte, sur Android, iPhone, iPad, Windows et Mac, et peut s'installer sur l'appareil. Le son est analysé sur l'appareil de l'utilisateur : rien n'est envoyé.`,
    "",
    ...FAQ.flatMap((entry) => [`${entry.question} ${entry.answer}`, ""]),
    "## Pages",
    "",
    ...[PAGES.home, PAGES.chords, PAGES.song, PAGES.solfa, PAGES.about].map(link),
    "",
    "## Application",
    "",
    `- [Ouvrir ${APP_NAME}](${absolute(PAGES.app.path)}): ${PAGES.app.description}`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
