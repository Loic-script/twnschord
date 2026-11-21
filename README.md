# TwinsChord

Application web qui reconnaît les notes et les accords, et tire d'un morceau sa grille d'accords et son solfa.

Créé par **TwinsDev** — Razafimamonjy Faneva Loic et Razafimamonjy Fahendrena Marco. Fait à Madagascar.

- **Micro** — jouez une note ou un accord : l'application affiche « Do », « La♭ »… ou « C », « Am7 », « G7 »…, avec un accordeur et un clavier qui s'éclaire.
- **Morceau** — importez un fichier audio, ou une vidéo (MP4, MOV, WebM…) dont seul le son est gardé : tempo, tonalité, mesure, accords temps par temps et mélodie en solfa (d r m, do mobile), en Do Ré Mi ou en C D E. Lancez la lecture et suivez la partition qui défile. Les boutons − / + de tonalité transposent la partition et le son lui-même, jusqu'à 6 demi-tons, sans changer la vitesse.
- **Générer** — écrivez vos accords (`C G Am F` ou `Do Sol Lam Fa`) et composez un petit groupe : jusqu'à 5 pistes d'accompagnement parmi 10 instruments, une guitare basse et une batterie, chacune avec son type (16 jeux, 10 lignes de basse, 10 rythmes de batterie), son octave et son volume ; plus une mélodie générée d'après les accords ou écrite à la main. L'application fabrique le son, le joue en boucle et permet de le télécharger en WAV. Les instruments sont synthétisés par calcul, pas enregistrés.
- **Hors ligne** — toute la reconnaissance est calculée sur l'appareil ; rien n'est envoyé. Après une première visite, l'application s'ouvre et fonctionne sans Internet.
- **Compte** (facultatif) — pour enregistrer ses analyses dans PostgreSQL et les retrouver sur un autre appareil. Sans compte, tout fonctionne mais rien n'est gardé.

Le nom affiché et les crédits de la page « À propos » se changent dans `src/lib/app.ts` (et le nom d'installation dans `public/manifest.webmanifest`). La base de données garde son nom technique `diapason`.

## Démarrer

Prérequis : Node.js 20 ou plus, PostgreSQL démarré.

```bash
npm install
copy .env.example .env.local   # puis renseigner le mot de passe PostgreSQL
npm run db:init                # crée la base « diapason » et ses tables
npm run dev                    # http://localhost:3000
```

Pour l'usage réel, et pour le mode hors ligne (le service worker n'est actif qu'en production) :

```bash
npm run build
npm start
```

## Sur téléphone

Les navigateurs n'ouvrent le micro que sur une adresse sécurisée : `localhost` ou `https`.
Ouvrir `http://192.168.x.x:3000` depuis le téléphone affichera donc l'application, mais sans micro. Deux solutions :

- **Hébergement en https** (recommandé) : déployer l'application sur un serveur avec un certificat, puis l'ouvrir sur le téléphone et choisir « Ajouter à l'écran d'accueil » pour l'installer.
- **Essai sur le réseau local** : `npm run dev:https` sert l'application en https avec un certificat auto-signé (le téléphone affichera un avertissement à accepter).

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run dev:https` | Idem en https, pour tester le micro depuis un téléphone |
| `npm run build` / `npm start` | Version de production (avec mode hors ligne) |
| `npm test` | Tests du moteur audio sur des sons synthétiques |
| `npm run typecheck` | Vérification TypeScript |
| `npm run db:init` | Crée la base et applique `db/schema.sql` |

## Comment ça marche

Tout le moteur est dans `src/lib/audio/`, en TypeScript pur, sans bibliothèque externe :

| Fichier | Rôle |
| --- | --- |
| `pitch.ts` | Hauteur d'une note seule — algorithme YIN |
| `chroma.ts` | Énergie des 12 notes à partir des pics du spectre, estimation de l'accordage |
| `chords.ts` | Comparaison du chroma à des gabarits d'accords (majeur, mineur, 7, maj7, m7, dim, aug, sus2, sus4, quinte) |
| `live.ts` | Analyse en continu du micro : lissage, stabilité, seuil de silence |
| `beat.ts` | Tempo par autocorrélation, temps par programmation dynamique |
| `key.ts` | Tonalité — profils de Krumhansl |
| `melody.ts` | Mélodie par sommation d'harmoniques, ramenée sur la grille rythmique |
| `analyze.ts` | Chaîne complète pour un fichier (exécutée dans un Web Worker) |
| `solfa.ts` | Mise en mesures et écriture en solfa |
| `pitchShift.ts` | Changement de tonalité d'un enregistrement (vocodeur de phase), sans changer sa durée |
| `transpose.ts` | Relecture d'une analyse dans une autre tonalité (accords, mélodie) |
| `synth.ts` | Onglet Générer : lecture des accords saisis et assemblage des pistes en un son |
| `voices.ts` | Les sons : cordes frappées (piano, piano électrique, vibraphone), cordes pincées de Karplus-Strong (guitares), basse électrique à deux micros de type PJ (synthèse modale + préampli), sons entretenus à formants (orgue, saxophone, trompette, flûte, cordes), batterie |
| `styles.ts` | Les types : jeux d'accompagnement, rythmes de batterie, lignes de basse — pour en ajouter un, il suffit d'ajouter une entrée dans ces tables |
| `tune.ts` | La mélodie : génération d'après les accords, lecture et écriture de la notation saisie |

Côté serveur : routes `src/app/api/` (comptes, bibliothèque), `src/lib/auth.ts` (mots de passe hachés avec scrypt, session par cookie httpOnly), `src/lib/db.ts` (PostgreSQL). Le fichier audio lui-même n'est jamais envoyé au serveur : seule l'analyse est enregistrée.

## Limites connues

- Les accords et la mélodie sont **estimés par calcul**. Sur un piano ou une guitare seuls, le résultat est fiable ; sur un enregistrement chargé (voix, batterie, plusieurs instruments), les accords restent en général justes mais la mélodie devient approximative.
- La mesure est supposée à 3 ou 4 temps. Si les barres tombent à côté, les boutons « 3 temps / 4 temps » et « Décaler le 1er temps » la corrigent.
- La mélodie est quantifiée à la croche (deux subdivisions par temps).
- Internet n'apporte aujourd'hui que le compte et la bibliothèque : il n'y a pas encore d'analyse renforcée côté serveur.
