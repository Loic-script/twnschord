// Service worker de TwinsChord : rend l'application utilisable sans Internet.
// - la page et ses fichiers statiques sont mis en cache à l'installation ;
// - les appels /api/ (comptes, bibliothèque) passent toujours par le réseau.
// Changer ce nom vide l'ancien cache à la prochaine visite (à faire quand le manifeste ou les icônes changent).
const CACHE = "twinschord-v1";
const SHELL = "/";
const EXTRA = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

async function cacheAsset(cache, url) {
  try {
    if (await cache.match(url)) return;
    const response = await fetch(url);
    if (!response.ok) return;
    await cache.put(url, response.clone());
    // Les polices ne sont référencées que depuis les feuilles de style.
    if (new URL(url, self.location.origin).pathname.endsWith(".css")) {
      const css = await response.text();
      const base = new URL(url, self.location.origin);
      const fonts = [...css.matchAll(/url\(["']?([^"')]+\.woff2)["']?\)/g)].map((m) => new URL(m[1], base).pathname);
      await Promise.all(fonts.map((font) => cacheAsset(cache, font)));
    }
  } catch {
    // Un fichier manquant ne doit pas empêcher l'installation.
  }
}

async function precache() {
  const cache = await caches.open(CACHE);
  const response = await fetch(SHELL, { cache: "reload" });
  if (!response.ok) throw new Error("Page d'accueil indisponible");
  await cache.put(SHELL, response.clone());
  const html = await response.text();
  const assets = new Set(EXTRA);
  for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) {
    assets.add(match[1].replace(/&amp;/g, "&"));
  }
  await Promise.all([...assets].map((url) => cacheAsset(cache, url)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// La page signale les fichiers qu'elle a chargés avant que le service worker ne prenne la main.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "cache" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        data.urls
          .filter((url) => typeof url === "string")
          .map((url) => new URL(url, self.location.origin))
          .filter((url) => url.origin === self.location.origin && url.pathname.startsWith("/_next/static/"))
          .map((url) => cacheAsset(cache, url.pathname + url.search)),
      ),
    ),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirstShell(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && new URL(request.url).pathname === SHELL) cache.put(SHELL, response.clone());
    return response;
  } catch {
    const cached = await cache.match(SHELL);
    if (cached) return cached;
    throw new Error("Hors ligne et page absente du cache");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || EXTRA.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
