import Link from "next/link";
import DocShell from "@/components/DocShell";
import { APP_NAME } from "@/lib/app";
import { pageMetadata, PAGES } from "@/lib/seo";

const page = PAGES.song;
const HEADLINE = "Trouver les accords d'une chanson à partir d'un enregistrement";

export const metadata = pageMetadata(page);

export default function SongPage() {
  return (
    <DocShell page={page} headline={HEADLINE}>
      <article>
        <h1>{HEADLINE}</h1>
        <p className="doc-lead">
          Pour connaître les accords d&apos;une chanson sans partition, donnez son enregistrement à {APP_NAME} :
          l&apos;application en tire la <strong>grille d&apos;accords</strong>, le <strong>tempo</strong>, la{" "}
          <strong>tonalité</strong> et le <strong>solfa</strong> de la mélodie, puis les fait défiler pendant la lecture.
        </p>

        <h2>En quatre étapes</h2>
        <ol>
          <li>
            Ouvrez l&apos;onglet <Link href="/app?onglet=file">Morceau</Link>.
          </li>
          <li>
            Choisissez un fichier audio (MP3, WAV, M4A, OGG, FLAC) ou une vidéo (MP4, MOV, WebM) : seul le son de la vidéo
            est gardé. La durée maximale est de 20 minutes.
          </li>
          <li>Patientez pendant l&apos;analyse : de quelques secondes à une minute pour un morceau de quatre minutes.</li>
          <li>Lancez la lecture et suivez l&apos;accord en cours, mis en évidence mesure après mesure.</li>
        </ol>

        <h2>Ce que vous obtenez</h2>
        <ul>
          <li>
            <strong>La grille d&apos;accords</strong> — un accord par temps ou par mesure : majeurs, mineurs, septièmes,
            diminués, suspendus.
          </li>
          <li>
            <strong>Le tempo</strong>, en battements par minute, et le découpage en mesures à 3 ou 4 temps.
          </li>
          <li>
            <strong>La tonalité</strong> du morceau, par exemple Sol majeur ou La mineur.
          </li>
          <li>
            <strong>La mélodie</strong>, écrite en <Link href={PAGES.solfa.path}>solfa</Link> (d r m), en Do Ré Mi ou en C D E.
          </li>
        </ul>

        <h2>Adapter le morceau à sa voix ou à son instrument</h2>
        <p>
          La tonalité se monte ou se baisse demi-ton par demi-ton. Vous choisissez de changer seulement les notes
          affichées — pour jouer dans un autre ton — ou aussi le son de l&apos;enregistrement. La vitesse de lecture se
          ralentit pour travailler un passage, et le premier temps de la mesure se décale si l&apos;analyse l&apos;a mal placé.
        </p>

        <h2>Ce qu&apos;il faut savoir</h2>
        <ul>
          <li>
            Le résultat est une estimation calculée à partir du son. Il est le plus fiable sur un enregistrement net, où
            l&apos;accompagnement s&apos;entend bien ; un mixage très chargé peut donner des accords approximatifs.
          </li>
          <li>
            Le fichier reste sur votre appareil : il n&apos;est jamais envoyé sur Internet, et l&apos;analyse fonctionne hors
            ligne.
          </li>
          <li>
            Avec un compte, facultatif, la grille s&apos;enregistre dans votre bibliothèque et se retrouve sur un autre
            appareil. Le fichier audio, lui, n&apos;est jamais conservé.
          </li>
        </ul>

        <p className="doc-next">
          <Link className="btn btn-primary" href="/app?onglet=file">
            Analyser un morceau
          </Link>
          <Link href={PAGES.chords.path}>Lire les accords et connaître leurs notes</Link>
          <Link href={PAGES.solfa.path}>Comprendre le solfa</Link>
        </p>
      </article>
    </DocShell>
  );
}
