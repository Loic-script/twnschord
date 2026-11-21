import { APP_NAME, MADE_IN, TEAM_MEMBERS, TEAM_NAME } from "@/lib/app";

export default function AboutView() {
  return (
    <section className="panel about">
      <h1 className="panel-title">À propos de {APP_NAME}</h1>
      <p>
        {APP_NAME} reconnaît les notes et les accords au micro, et tire d&apos;un morceau sa grille d&apos;accords et son
        solfa. Tout est calculé sur votre appareil, avec ou sans Internet.
      </p>

      <div className="about-block">
        <h2 className="label">Créé par</h2>
        <p className="about-team">{TEAM_NAME}</p>
      </div>

      <div className="about-block">
        <h2 className="label">Composé de</h2>
        <ul className="about-people">
          {TEAM_MEMBERS.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>

      <p className="about-origin">Fait à {MADE_IN}</p>
    </section>
  );
}
