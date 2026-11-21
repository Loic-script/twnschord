import { APP_NAME, MADE_IN, TEAM_MEMBERS, TEAM_NAME } from "@/lib/app";

export default function AboutView() {
  return (
    <section className="panel about">
      <img className="about-logo" src="/logo/twinschord-mark-reverse.svg" alt="" width={449} height={267} />
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

      <div className="about-block">
        <h2 className="label">Confidentialité</h2>
        <ul className="about-privacy">
          <li>Le son du micro et les fichiers importés sont analysés sur votre appareil : ils ne sont ni enregistrés ni envoyés.</li>
          <li>Aucun cookie de publicité ni de mesure d&apos;audience, aucun traceur.</li>
          <li>
            Un seul cookie, déposé uniquement si vous vous connectez : il garde votre session ouverte pendant 30 jours et
            disparaît à la déconnexion.
          </li>
          <li>Vos réglages (nom des notes, records du jeu) restent dans la mémoire de votre navigateur.</li>
          <li>
            Si vous activez les notifications, le serveur garde l&apos;adresse technique de votre appareil pour pouvoir lui
            écrire. Chaque message est chiffré pour votre appareil seul : le service qui le transporte (celui de votre
            navigateur — Google, Mozilla, Apple ou Microsoft) ne peut pas le lire. Désactiver les notifications efface
            cette adresse.
          </li>
          <li>
            Avec un compte, sont conservés sur le serveur : votre adresse e-mail, votre prénom si vous l&apos;indiquez, votre
            mot de passe sous forme chiffrée, et les analyses que vous enregistrez — jamais les fichiers audio.
          </li>
        </ul>
      </div>

      <p className="about-origin">Fait à {MADE_IN}</p>
    </section>
  );
}
