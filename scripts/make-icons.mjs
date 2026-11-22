// Produit toutes les images dérivées du logo à partir des tracés vectoriels de public/logo/ :
// icônes d'installation, icône d'onglet, icône de notification, image de partage, et un jeu de PNG
// prêts à l'emploi (documents, réseaux sociaux, impression).
// Usage : node scripts/make-icons.mjs     — à relancer si les fichiers SVG du logo changent.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const file = (path) => new URL(path, root);
const colors = JSON.parse(await readFile(file("public/logo/couleurs.json"), "utf8"));
const WHITE = "#ffffff";
const done = [];

/** Le tracé `name` rendu à `width` pixels de large, sur fond transparent. */
const render = (name, width) => sharp(fileURLToPath(file(`public/logo/twinschord-${name}.svg`))).resize({ width }).png().toBuffer();

/** Le tracé centré sur une toile de `w`×`h`, occupant la fraction `fill` de sa largeur ; `bg` null = transparent. */
async function canvas(name, w, h, fill, bg) {
  const art = await render(name, Math.round(w * fill));
  const base = sharp({ create: { width: w, height: h, channels: 4, background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 } } });
  return base.composite([{ input: art, gravity: "centre" }]).png({ compressionLevel: 9 }).toBuffer();
}

async function save(path, buffer, note) {
  await mkdir(new URL("./", file(path)), { recursive: true });
  await writeFile(file(path), buffer);
  done.push(`${path} — ${note}`);
}

/**
 * Monogramme détouré, sur fond transparent : le logo posé sur sa propre silhouette élargie d'un liseré
 * clair. Sans carré de fond, il se lit sur n'importe quel fond d'écran — le T vert foncé disparaîtrait
 * sinon sur un bureau sombre. `fill` : part de la largeur occupée ; `ring` : épaisseur du liseré.
 */
async function outlined(size, fill, ring) {
  const pad = Math.ceil(size * ring) + 2;
  const art = await render("mark", Math.round(size * fill) - 2 * pad);
  const { width, height } = await sharp(art).metadata();
  const W = width + pad * 2;
  const H = height + pad * 2;
  const clear = { r: 0, g: 0, b: 0, alpha: 0 };
  const placed = await sharp({ create: { width: W, height: H, channels: 4, background: clear } }).composite([{ input: art, left: pad, top: pad }]).png().toBuffer();
  // Silhouette élargie d'un disque de rayon r, puis bord adouci.
  const alpha = await sharp(placed).extractChannel("alpha").raw().toBuffer();
  const r = Math.max(1, Math.round(size * ring));
  const disc = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) disc.push([dx, dy]);
  const grown = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let best = 0;
      for (const [dx, dy] of disc) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const a = alpha[yy * W + xx];
        if (a > best) {
          best = a;
          if (best === 255) break;
        }
      }
      grown[y * W + x] = best;
    }
  }
  // extractChannel(0) : le flou rend trois canaux, il n'en faut qu'un pour la transparence.
  const soft = await sharp(grown, { raw: { width: W, height: H, channels: 1 } }).blur(Math.max(0.6, size / 512)).extractChannel(0).raw().toBuffer();
  const halo = await sharp({ create: { width: W, height: H, channels: 3, background: colors.clair } }).joinChannel(soft, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
  const badge = await sharp(halo).composite([{ input: placed }]).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: clear } })
    .composite([{ input: badge, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// ——— Icônes de l'application installée ———
// « any » (Windows, Mac, Chrome OS) : monogramme détouré, sans fond.
// « maskable » (Android) et iPhone : ces systèmes imposent un fond à l'icône (Android la rogne en rond
// ou en carré arrondi et comble la transparence en blanc ; iOS la comble en noir). Ce fond est donc le
// vert de la marque, avec le monogramme clair, plutôt qu'un carré blanc.
for (const size of [192, 512]) {
  await save(`public/icons/icon-${size}.png`, await outlined(size, 0.92, 0.035), `icône d'installation ${size} px, sans fond`);
  await save(`public/icons/icon-maskable-${size}.png`, await canvas("mark-reverse", size, size, 0.54, colors.vert), `icône rognable ${size} px (Android)`);
}
await save("src/app/apple-icon.png", await canvas("mark-reverse", 180, 180, 0.7, colors.vert), "icône iPhone / iPad");

// Pictogramme de notification : silhouette blanche sur fond transparent (le système n'en garde que la forme).
await save("public/icons/badge-96.png", await canvas("mark-mono-white", 96, 96, 0.9, null), "pictogramme de notification");

// ——— Icône d'onglet du navigateur, format .ico (16, 32 et 48 px) pour les navigateurs anciens ———
{
  const sizes = [16, 32, 48];
  const svg = await readFile(file("src/app/icon.svg"));
  const images = await Promise.all(sizes.map((s) => sharp(svg).resize(s, s).png().toBuffer()));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2); // type : icône
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  images.forEach((image, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(sizes[i], entry); // largeur
    header.writeUInt8(sizes[i], entry + 1); // hauteur
    header.writeUInt16LE(1, entry + 4); // plans
    header.writeUInt16LE(32, entry + 6); // bits par pixel
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  await save("src/app/favicon.ico", Buffer.concat([header, ...images]), "icône d'onglet (16, 32, 48 px)");
}

// ——— Image de partage (aperçu du lien sur WhatsApp, Facebook, etc.) : 1200×630 ———
{
  const logo = await render("logo", 780);
  const { height } = await sharp(logo).metadata();
  const text = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
      <rect width="1200" height="630" fill="${colors.clair}"/>
      <rect y="606" width="1200" height="24" fill="${colors.vert}"/>
      <rect y="606" width="300" height="24" fill="${colors.jaune}"/>
      <text x="600" y="${Math.round(315 + height / 2 + 70)}" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="34" font-weight="600" fill="${colors.vert}">Notes, accords et solfa — au micro, sur un morceau, même hors ligne</text>
    </svg>`,
  );
  const image = await sharp(text)
    .composite([{ input: logo, left: Math.round((1200 - 780) / 2), top: Math.round(315 - height / 2 - 30) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await save("src/app/opengraph-image.png", image, "image de partage 1200×630");
  await save("src/app/twitter-image.png", image, "image de partage (X / Twitter)");
}

// ——— Jeu de PNG prêts à l'emploi ———
const out = "public/logo/png";
for (const width of [600, 1200, 2400]) await save(`${out}/twinschord-logo-${width}.png`, await render("logo", width), `logo complet, fond transparent, ${width} px`);
await save(`${out}/twinschord-logo-fond-blanc-1200.png`, await canvas("logo", 1400, 500, 0.82, WHITE), "logo complet sur fond blanc");
await save(`${out}/twinschord-logo-fond-sombre-1200.png`, await canvas("logo-reverse", 1400, 500, 0.82, colors.vert), "logo pour fond sombre");
await save(`${out}/twinschord-logo-blanc-1200.png`, await render("logo-mono-white", 1200), "logo tout blanc, fond transparent");
await save(`${out}/twinschord-logo-vert-1200.png`, await render("logo-mono-dark", 1200), "logo tout vert, fond transparent");
for (const size of [256, 512, 1024]) await save(`${out}/twinschord-monogramme-${size}.png`, await canvas("mark", size, size, 0.9, null), `monogramme, fond transparent, ${size} px`);
await save(`${out}/twinschord-monogramme-fond-sombre-512.png`, await canvas("mark-reverse", 512, 512, 0.72, colors.vert), "monogramme sur fond sombre");
await save(`${out}/twinschord-monogramme-blanc-512.png`, await canvas("mark-mono-white", 512, 512, 0.9, null), "monogramme tout blanc");
await save(`${out}/twinschord-nom-800.png`, await render("wordmark", 800), "nom seul, fond transparent");
// Photo de profil (réseaux sociaux) : carrée, le monogramme bien au centre pour résister au rognage en rond.
await save(`${out}/twinschord-profil-800.png`, await canvas("mark", 800, 800, 0.6, WHITE), "photo de profil, fond blanc");
await save(`${out}/twinschord-profil-sombre-800.png`, await canvas("mark-reverse", 800, 800, 0.6, colors.vert), "photo de profil, fond vert");

// ——— Planche de contrôle : toutes les variantes côte à côte ———
{
  const cell = { w: 700, h: 260 };
  const rows = [
    ["logo", WHITE],
    ["logo-reverse", colors.vert],
    ["logo-mono-dark", colors.clair],
    ["logo-mono-white", "#1b1b1b"],
  ];
  const tiles = [];
  for (let r = 0; r < rows.length; r++) {
    const [variant, bg] = rows[r];
    tiles.push({ input: await canvas(variant, cell.w, cell.h, 0.8, bg), left: 0, top: r * cell.h });
    tiles.push({ input: await canvas(variant.replace("logo", "mark"), cell.h, cell.h, 0.62, bg), left: cell.w, top: r * cell.h });
  }
  const sheet = await sharp({ create: { width: cell.w + cell.h, height: cell.h * rows.length, channels: 4, background: WHITE } })
    .composite(tiles)
    .png()
    .toBuffer();
  await save("public/logo/planche-logo.png", sheet, "planche de toutes les variantes");
}

console.log(done.map((line) => `  ${line}`).join("\n"));
console.log(`${done.length} images produites.`);
