// Dessine l'icône de l'application (un diapason en laiton sur feutre vert)
// et l'écrit en PNG, sans dépendance. Usage : node scripts/make-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { crc32, deflateSync } from "node:zlib";

const FELT = [15, 59, 51];
const BRASS = [233, 188, 98];

// Formes en coordonnées 0…1.
const HALF = 0.036;
const inCapsule = (x, y, cx, y0, y1) => {
  const cy = Math.max(y0, Math.min(y1, y));
  return Math.hypot(x - cx, y - cy) <= HALF;
};
function inFork(x, y) {
  if (inCapsule(x, y, 0.4, 0.2, 0.5)) return true; // branche gauche
  if (inCapsule(x, y, 0.6, 0.2, 0.5)) return true; // branche droite
  if (y >= 0.5) {
    const r = Math.hypot(x - 0.5, y - 0.5); // coude en U
    if (r >= 0.1 - HALF && r <= 0.1 + HALF) return true;
  }
  return inCapsule(x, y, 0.5, 0.6, 0.8); // manche
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

function png(size) {
  const SS = 4; // suréchantillonnage pour des bords lisses
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    const row = py * (size * 4 + 1);
    raw[row] = 0;
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          if (inFork((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size)) hits++;
        }
      }
      const a = hits / (SS * SS);
      const o = row + 1 + px * 4;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(FELT[c] + (BRASS[c] - FELT[c]) * a);
      raw[o + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RVBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

await mkdir(new URL("../public/icons/", import.meta.url), { recursive: true });
for (const [file, size] of [
  ["../public/icons/icon-192.png", 192],
  ["../public/icons/icon-512.png", 512],
  ["../src/app/apple-icon.png", 180],
]) {
  await writeFile(new URL(file, import.meta.url), png(size));
  console.log(`${file} (${size}×${size})`);
}
