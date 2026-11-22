import Link from "next/link";
import DocShell from "@/components/DocShell";
import { APP_NAME } from "@/lib/app";
import { pcName } from "@/lib/audio/notes";
import { pageMetadata, PAGES } from "@/lib/seo";

const page = PAGES.solfa;
const HEADLINE = "Le solfa : lire et écrire la musique avec d r m f s l t";

export const metadata = pageMetadata(page);

// Les sept degrés de la gamme majeure, en demi-tons depuis la tonique.
const DEGREES: { syllable: string; name: string; semitones: number }[] = [
  { syllable: "d", name: "do", semitones: 0 },
  { syllable: "r", name: "ré", semitones: 2 },
  { syllable: "m", name: "mi", semitones: 4 },
  { syllable: "f", name: "fa", semitones: 5 },
  { syllable: "s", name: "sol", semitones: 7 },
  { syllable: "l", name: "la", semitones: 9 },
  { syllable: "t", name: "ti", semitones: 11 },
];
// Tonalités données en exemple : Do, Sol et Fa majeur.
const KEYS = [0, 7, 5];

export default function SolfaPage() {
  return (
    <DocShell page={page} headline={HEADLINE}>
      <article>
        <h1>{HEADLINE}</h1>
        <p className="doc-lead">
          Le <strong>solfa</strong> (ou solfa tonique, <span lang="en">tonic sol-fa</span>) est une notation musicale à{" "}
          <strong>do mobile</strong> : chaque note s&apos;écrit par une lettre — d, r, m, f, s, l, t — qui dit sa place dans
          la gamme, et non sa hauteur absolue. Un même chant se lit donc de la même façon dans toutes les tonalités.
        </p>

        <h2>Les sept syllabes</h2>
        <p>
          La gamme majeure compte sept notes. Le solfa les nomme do, ré, mi, fa, sol, la, ti, et les écrit par leur
          première lettre. Le tableau montre ce que valent ces lettres dans trois tonalités.
        </p>
        <div className="doc-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Solfa</th>
                <th scope="col">Se dit</th>
                {KEYS.map((key) => (
                  <th scope="col" key={key}>
                    En {pcName(key, "latin")} majeur
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEGREES.map((degree) => (
                <tr key={degree.syllable}>
                  <th scope="row">{degree.syllable}</th>
                  <td>{degree.name}</td>
                  {KEYS.map((key) => (
                    <td key={key}>{pcName(key + degree.semitones, "latin")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Le do mobile</h2>
        <p>
          Dans le solfège à do fixe, « do » désigne toujours la même touche du piano. En solfa, <strong>d</strong> est la
          première note de la gamme du morceau : en Sol majeur, d vaut Sol ; en Fa majeur, d vaut Fa. C&apos;est pourquoi une
          partition en solfa indique toujours la tonalité en tête, par exemple « do = Sol ».
        </p>
        <p>
          Dans une tonalité mineure, la note principale est <strong>l</strong> (la) : le do reste celui de la gamme majeure
          relative. En La mineur, l vaut La et d vaut Do.
        </p>

        <h2>Octaves, notes altérées et durées</h2>
        <ul>
          <li>
            <strong>Octaves</strong> — une apostrophe en haut marque l&apos;octave supérieure (d&apos;), une virgule en bas
            l&apos;octave inférieure (d,).
          </li>
          <li>
            <strong>Notes altérées</strong> — une note haussée d&apos;un demi-ton prend la voyelle « e » : de, re, fe, se. Le
            ti baissé d&apos;un demi-ton s&apos;écrit ta.
          </li>
          <li>
            <strong>Durées</strong> — chaque temps a sa case. Un tiret (–) prolonge la note précédente, une case vide est un
            silence, et un temps partagé contient plusieurs notes.
          </li>
        </ul>

        <h2>D&apos;où vient le solfa ?</h2>
        <p>
          Le solfa tonique a été mis au point en Angleterre au XIX<sup>e</sup> siècle par Sarah Glover, puis diffusé par
          John Curwen, pour apprendre à chanter sans instrument. Il s&apos;est répandu avec le chant choral et reste très
          vivant dans les chorales, notamment à Madagascar, où les recueils de chants sont couramment notés en solfa.
        </p>

        <h2>Obtenir le solfa d&apos;un morceau avec {APP_NAME}</h2>
        <ol>
          <li>
            Ouvrez l&apos;onglet <Link href="/app?onglet=file">Morceau</Link> de l&apos;application.
          </li>
          <li>Importez un fichier audio (MP3, WAV, M4A, OGG) ou une vidéo (MP4, MOV, WebM) de 20 minutes au plus.</li>
          <li>
            L&apos;application détermine la tonalité, puis affiche la mélodie en solfa, mesure par mesure, avec le do de
            référence (« do = … »).
          </li>
          <li>Lancez la lecture : la note en cours est mise en évidence, avec les accords au-dessus.</li>
        </ol>
        <p>
          La même mélodie peut s&apos;afficher en noms fixes — Do Ré Mi ou C D E — et la tonalité peut être montée ou
          baissée. Tout le calcul se fait sur votre appareil : le fichier n&apos;est envoyé nulle part.
        </p>

        <p className="doc-next">
          <Link className="btn btn-primary" href="/app?onglet=file">
            Obtenir le solfa d&apos;un morceau
          </Link>
          <Link href={PAGES.song.path}>Trouver les accords d&apos;une chanson</Link>
          <Link href={PAGES.chords.path}>Les accords et leurs notes</Link>
        </p>
      </article>
    </DocShell>
  );
}
