import Link from "next/link";
import DocShell from "@/components/DocShell";
import { APP_NAME } from "@/lib/app";
import { QUALITIES } from "@/lib/audio/chords";
import { pcName } from "@/lib/audio/notes";
import { pageMetadata, PAGES } from "@/lib/seo";

const page = PAGES.chords;
const HEADLINE = "Les accords : lire leur nom, connaître leurs notes, les reconnaître";

export const metadata = pageMetadata(page);

// Les types d'accords que l'application reconnaît, dans l'ordre où on les apprend, avec leur nom français.
// Les notes viennent des mêmes définitions que le moteur de reconnaissance (src/lib/audio/chords.ts).
const TYPES: { id: keyof typeof QUALITIES; name: string }[] = [
  { id: "maj", name: "majeur" },
  { id: "min", name: "mineur" },
  { id: "dom7", name: "septième (de dominante)" },
  { id: "maj7", name: "septième majeure" },
  { id: "min7", name: "mineur septième" },
  { id: "dim", name: "diminué" },
  { id: "aug", name: "augmenté" },
  { id: "sus4", name: "suspendu 4" },
  { id: "sus2", name: "suspendu 2" },
  { id: "five", name: "quinte seule (« power chord »)" },
];

// Orthographe des notes d'un accord. Le moteur nomme chaque son d'une seule façon (La♭ plutôt que
// Sol♯) ; dans un accord, la bonne orthographe dépend de la place de la note : la tierce de Mi
// majeur est Sol♯, non La♭. On avance donc de lettre en lettre depuis la fondamentale.
const LETTERS = ["Do", "Ré", "Mi", "Fa", "Sol", "La", "Si"];
const LETTER_PITCH = [0, 2, 4, 5, 7, 9, 11];
/** Nombre de lettres à franchir pour un intervalle en demi-tons (4 → tierce : deux lettres plus loin). */
const STEPS: Record<number, number> = { 0: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 10: 6, 11: 6 };
const ACCIDENTALS: Record<number, string> = { [-2]: "𝄫", [-1]: "♭", 0: "", 1: "♯", 2: "𝄪" };

/** Notes d'un accord, de la fondamentale `root` (0 = Do … 11 = Si), en noms latins bien orthographiés. */
function notes(root: number, id: keyof typeof QUALITIES): string {
  const rootName = pcName(root, "latin");
  const rootLetter = LETTERS.findIndex((letter) => rootName.startsWith(letter) && (letter !== "Do" || !rootName.startsWith("Dom")));
  return QUALITIES[id].intervals
    .map((interval) => {
      const letter = (rootLetter + STEPS[interval]) % 7;
      // Écart, en demi-tons, entre la note voulue et la lettre sans altération : ramené entre −2 et +2.
      const shift = ((((root + interval - LETTER_PITCH[letter]) % 12) + 12 + 6) % 12) - 6;
      return LETTERS[letter] + ACCIDENTALS[shift];
    })
    .join(" – ");
}
const label = (root: number, id: keyof typeof QUALITIES) => pcName(root, "letter") + QUALITIES[id].suffix;
const ROOTS = Array.from({ length: 12 }, (_, root) => root);
const NATURALS = [0, 2, 4, 5, 7, 9, 11];

export default function ChordsPage() {
  return (
    <DocShell page={page} headline={HEADLINE}>
      <article>
        <h1>{HEADLINE}</h1>
        <p className="doc-lead">
          Un <strong>accord</strong> (<span lang="en">chord</span>), ce sont plusieurs notes jouées ensemble — au piano, à
          la guitare, à l&apos;orgue. Son nom tient en quelques signes : une lettre pour la note de base, puis un suffixe
          pour sa couleur. <strong>C</strong> est Do majeur, <strong>Cm</strong> Do mineur, <strong>C7</strong> Do septième.
        </p>

        <h2>Deux façons de nommer les notes</h2>
        <p>
          Les grilles d&apos;accords emploient les lettres anglo-saxonnes ; le solfège français emploie Do Ré Mi. Ce sont les
          mêmes notes.
        </p>
        <div className="doc-table">
          <table>
            <tbody>
              <tr>
                <th scope="row">Lettre</th>
                {NATURALS.map((pc) => (
                  <td key={pc}>{pcName(pc, "letter")}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Nom</th>
                {NATURALS.map((pc) => (
                  <td key={pc}>{pcName(pc, "latin")}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Le dièse (♯) hausse la note d&apos;un demi-ton, le bémol (♭) la baisse : F♯ est Fa dièse, B♭ est Si bémol.
        </p>

        <h2>Lire un nom d&apos;accord</h2>
        <p>Le suffixe placé après la lettre dit quelles notes s&apos;ajoutent à la note de base. Exemple sur Do (C) :</p>
        <div className="doc-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Accord</th>
                <th scope="col">Se lit</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {TYPES.map((type) => (
                <tr key={type.id}>
                  <th scope="row">{label(0, type.id)}</th>
                  <td>Do {type.name}</td>
                  <td>{notes(0, type.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Un accord majeur sonne clair, un accord mineur plus sombre : une seule note les sépare, la deuxième de
          l&apos;accord, plus basse d&apos;un demi-ton en mineur.
        </p>

        <h2>Les notes des accords majeurs, mineurs et de septième</h2>
        <p>Pour chacune des douze notes de base, les notes à jouer au piano ou à chercher sur le manche de la guitare.</p>
        <div className="doc-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Note de base</th>
                <th scope="col">Majeur</th>
                <th scope="col">Mineur</th>
                <th scope="col">Septième</th>
              </tr>
            </thead>
            <tbody>
              {ROOTS.map((root) => (
                <tr key={root}>
                  <th scope="row">
                    {pcName(root, "letter")} · {pcName(root, "latin")}
                  </th>
                  <td>
                    <strong>{label(root, "maj")}</strong> {notes(root, "maj")}
                  </td>
                  <td>
                    <strong>{label(root, "min")}</strong> {notes(root, "min")}
                  </td>
                  <td>
                    <strong>{label(root, "dom7")}</strong> {notes(root, "dom7")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Reconnaître un accord au micro</h2>
        <p>
          Quand on entend un accord sans savoir le nommer, {APP_NAME} l&apos;identifie à partir du son de l&apos;instrument :
        </p>
        <ol>
          <li>
            Ouvrez l&apos;onglet <Link href="/app?onglet=live">Micro</Link> et autorisez le micro.
          </li>
          <li>Choisissez « Accord », posez le téléphone près du piano ou de la guitare, et jouez.</li>
          <li>Le nom de l&apos;accord s&apos;affiche, avec ses notes allumées sur un clavier.</li>
        </ol>
        <p>
          En mode « Note », l&apos;application nomme une note seule et sert d&apos;accordeur : une aiguille montre si elle est
          trop basse, juste ou trop haute. Le son est analysé sur l&apos;appareil, sans rien envoyer.
        </p>

        <p className="doc-next">
          <Link className="btn btn-primary" href="/app?onglet=live">
            Reconnaître un accord
          </Link>
          <Link href={PAGES.song.path}>Trouver les accords d&apos;une chanson</Link>
          <Link href={PAGES.solfa.path}>Comprendre le solfa</Link>
        </p>
      </article>
    </DocShell>
  );
}
