// Service worker de TwinsChord. Trois rôles :
// 1. rendre l'application utilisable sans Internet —
//    la page et ses fichiers statiques sont mis en cache à l'installation,
//    les appels /api/ (comptes, bibliothèque) passent toujours par le réseau ;
// 2. recevoir les notifications push, même application fermée, et ouvrir le bon écran au clic ;
// 3. recevoir un fichier audio ou vidéo envoyé par le menu « Partager » du téléphone.
// Changer ce nom vide l'ancien cache à la prochaine visite (à faire quand le manifeste ou les icônes changent).
const CACHE = "twinschord-v6";
// Fichier reçu par « Partager », gardé le temps que l'application le lise (mêmes noms dans src/lib/installedApp.ts).
const SHARED_CACHE = "twinschord-recu";
const SHARED_KEY = "/__recu";
// Adresse où le système envoie le fichier partagé (share_target du manifeste).
const RECEIVE = "/app/recevoir";
// Pages servies sans réseau : l'application (là où s'ouvre l'application installée), l'accueil et la connexion.
const SHELL = "/app";
const SHELLS = [SHELL, "/", "/connexion"];
// Fichiers hors de /_next/ dont la page a besoin sans réseau : manifeste, icônes, logo de l'en-tête.
const EXTRA = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/badge-96.png",
  "/logo/twinschord-logo-reverse.svg",
  "/logo/twinschord-mark-reverse.svg",
];
// En développement (enregistré sous /sw.js?dev), rien n'est mis en cache — on servirait des fichiers
// périmés à chaque modification du code : il ne reste que les notifications.
const DEV = new URL(self.location.href).searchParams.has("dev");

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
  const assets = new Set(EXTRA);
  for (const page of SHELLS) {
    const response = await fetch(page, { cache: "reload" });
    // Sans la page de l'application, l'installation échoue ; l'accueil et la connexion sont un plus.
    if (!response.ok) {
      if (page === SHELL) throw new Error("Application indisponible");
      continue;
    }
    await cache.put(page, response.clone());
    const html = await response.text();
    for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) {
      assets.add(match[1].replace(/&amp;/g, "&"));
    }
  }
  await Promise.all([...assets].map((url) => cacheAsset(cache, url)));
}

// Première installation : le service worker prend la main aussitôt. Mise à jour : la nouvelle version
// attend que l'utilisateur clique sur « Redémarrer » (message « activate ») ou ferme l'application —
// l'ancienne version et ses fichiers restent en place tant qu'une fenêtre s'en sert.
self.addEventListener("install", (event) => {
  event.waitUntil(DEV ? self.skipWaiting() : precache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHARED_CACHE && (DEV || key !== CACHE)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// ——— Notifications push ———

// Une notification arrive (application ouverte, en arrière-plan ou fermée) : on l'affiche dans le système.
self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof message.title === "string" && message.title ? message.title : "TwinsChord";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof message.body === "string" ? message.body : "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      lang: "fr",
      // Deux notifications de même étiquette se remplacent ; « renotify » refait sonner et vibrer.
      tag: typeof message.tag === "string" ? message.tag : undefined,
      renotify: typeof message.tag === "string",
      // Vibration demandée (Android) ; le son est celui que l'appareil réserve aux notifications.
      vibrate: [180, 90, 180],
      silent: false,
      timestamp: Date.now(),
      data: { url: typeof message.url === "string" && message.url.startsWith("/") ? message.url : "/app" },
    }),
  );
});

// Clic sur la notification : on amène l'application au premier plan, sur le contenu concerné.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/app", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        // Déjà ouverte : elle va d'elle-même au bon écran, sans se recharger.
        open.postMessage({ type: "open", url: target });
        try {
          await open.focus();
        } catch {
          // Certains navigateurs refusent de reprendre le premier plan : le contenu est tout de même affiché.
        }
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// Le navigateur a renouvelé l'abonnement de lui-même : on en informe le serveur.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const subscription = event.newSubscription || (await self.registration.pushManager.getSubscription());
      if (!subscription) return;
      await fetch("/api/push", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
    })(),
  );
});

// ——— Mode hors ligne ———

// La page signale les fichiers qu'elle a chargés avant que le service worker ne prenne la main.
self.addEventListener("message", (event) => {
  const data = event.data;
  // « Redémarrer » dans le bandeau de mise à jour : la version en attente prend la main.
  if (data && data.type === "activate") {
    self.skipWaiting();
    return;
  }
  if (DEV || !data || data.type !== "cache" || !Array.isArray(data.urls)) return;
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
    const path = new URL(request.url).pathname;
    if (response.ok && SHELLS.includes(path)) cache.put(path, response.clone());
    return response;
  } catch {
    // Hors ligne : la page demandée si elle est en cache, sinon l'application.
    const cached = (await cache.match(new URL(request.url).pathname)) || (await cache.match(SHELL));
    if (cached) return cached;
    throw new Error("Hors ligne et page absente du cache");
  }
}

// « Partager → TwinsChord » : le système envoie le fichier ici. Il est mis de côté sur l'appareil
// (jamais transmis au serveur), puis l'application s'ouvre sur l'onglet Morceau et le lit.
async function receiveShare(request) {
  try {
    const form = await request.formData();
    const file = form.getAll("fichier").find((value) => value instanceof File && value.size > 0);
    if (file) {
      const cache = await caches.open(SHARED_CACHE);
      await cache.put(
        SHARED_KEY,
        new Response(file, { headers: { "Content-Type": file.type || "application/octet-stream", "X-Nom": encodeURIComponent(file.name || "") } }),
      );
      return Response.redirect("/app?onglet=file&recu=1", 303);
    }
  } catch {
    // Envoi illisible : on ouvre simplement l'onglet Morceau.
  }
  return Response.redirect("/app?onglet=file", 303);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method === "POST" && url.origin === self.location.origin && url.pathname === RECEIVE) {
    event.respondWith(receiveShare(request));
    return;
  }
  if (DEV || request.method !== "GET") return;
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/logo/") || EXTRA.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
