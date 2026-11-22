/**
 * Données structurées Schema.org, lues par les moteurs de recherche et les assistants.
 * Le caractère « < » est échappé pour qu'aucun texte ne puisse refermer la balise.
 */
export default function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
