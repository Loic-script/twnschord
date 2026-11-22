// Service worker de TwinsChord. Trois rôles :
// 1. rendre l'application utilisable sans Internet —
//    la page et ses fichiers statiques sont mis en cache à l'installation,
//    les appels /api/ (comptes, bibliothèque) passent toujours par le réseau ;
// 2. recevoir les notifications push, même application fermée, et ouvrir le bon écran au clic ;
// 3. recevoir un fichier audio ou vidéo envoyé par le menu « Partager » du téléphone.
// Changer ce nom vide l'ancien cache à la prochaine visite (à faire quand le manifeste ou les icônes changent).
const CACHE = "twinschord-v8";
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
  "/icons/icon-192.png?v=2",
  "/icons/icon-512.png?v=2",
  "/icons/icon-maskable-192.png?v=2",
  "/icons/icon-maskable-512.png?v=2",
  "/icons/badge-96.png",
  "/logo/twinschord-logo-reverse.svg",
  "/logo/twinschord-mark-reverse.svg",
];
// En développement (enregistré sous /sw.js?dev), rien n'est mis en cache — on servirait des fichiers
// périmés à chaque modification du code : il ne reste que les notifications.
const DEV = new URL(self.location.href).searchParams.has("dev");

// Liste des fichiers /_next/static/ de la version en cours, gardée dans le cache lui-même : elle sert
// à reconnaître une nouvelle version du site et à retirer les fichiers de l'ancienne.
const KEEP_KEY = "/__fichiers";
// Réseau trop lent : au-delà de ce délai, la page déjà en cache est servie sans attendre.
const SLOW_MS = 4000;

/**
 * Polices à garder hors ligne : celles du sous-ensemble latin (tout le français). Les sous-ensembles
 * réservés à d'autres alphabets restent téléchargés à la demande, et ne pèsent pas dans l'application installée.
 */
function offlineFonts(css, base) {
  const fonts = [];
  for (const block of css.matchAll(/@font-face\s*\{[^}]*\}/g)) {
    const range = /unicode-range:\s*([^;}]+)/i.exec(block[0]);
    if (range && !/U\+0000-00FF/i.test(range[1])) continue;
    const file = /url\(["']?([^"')]+\.woff2)["']?\)/.exec(block[0]);
    if (file) fonts.push(new URL(file[1], base).pathname);
  }
  return fonts;
}

/** Met `url` en cache s'il n'y est pas ; `wanted`, s'il est donné, reçoit tous les fichiers concernés. */
async function cacheAsset(cache, url, wanted) {
  try {
    if (wanted) wanted.add(url);
    let response = await cache.match(url);
    if (!response) {
      response = await fetch(url);
      if (!response.ok) return;
      await cache.put(url, response.clone());
    }
    // Les polices ne sont référencées que depuis les feuilles de style.
    const base = new URL(url, self.location.origin);
    if (base.pathname.endsWith(".css")) {
      await Promise.all(offlineFonts(await response.text(), base).map((font) => cacheAsset(cache, font, wanted)));
    }
  } catch {
    // Un fichier manquant ne doit pas empêcher l'installation.
  }
}

/** Fichiers /_next/static/ dont une page a besoin, d'après son HTML. */
function assetsOf(html) {
  const assets = [];
  for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    // « nomodule » : script de compatibilité que seuls de très vieux navigateurs exécutent
    // (ils n'ont pas de service worker) — inutile de le garder.
    if (/\snomodule\b/i.test(tag[0])) continue;
    const match = /(?:src|href)="(\/_next\/static\/[^"]+)"/.exec(tag[0]);
    if (match) assets.push(match[1].replace(/&amp;/g, "&"));
  }
  return assets;
}

async function readKeep(cache) {
  try {
    const listed = await cache.match(KEEP_KEY);
    return listed ? new Set(await listed.json()) : null;
  } catch {
    return null;
  }
}

const writeKeep = (cache, keep) => cache.put(KEEP_KEY, new Response(JSON.stringify([...keep]), { headers: { "Content-Type": "application/json" } }));

/** Met en cache les pages et tous leurs fichiers, puis retire les fichiers de la version précédente. */
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
    for (const asset of assetsOf(await response.text())) assets.add(asset);
  }
  const wanted = new Set();
  await Promise.all([...assets].map((url) => cacheAsset(cache, url, wanted)));

  // Ménage : ce que l'ancienne version utilisait et que la nouvelle n'utilise plus s'en va, pour que
  // l'application installée ne grossisse pas à chaque mise à jour du site.
  const previous = await readKeep(cache);
  await writeKeep(cache, wanted);
  for (const request of await cache.keys()) {
    const url = new URL(request.url);
    const key = url.pathname + url.search;
    if (url.pathname.startsWith("/_next/static/") && !wanted.has(key) && (previous === null || previous.has(key))) await cache.delete(request);
  }
}

/** La page de l'application vient d'arriver du réseau : si le site a changé de version, le cache suit. */
async function followBuild(response) {
  try {
    const assets = assetsOf(await response.text());
    const keep = await readKeep(await caches.open(CACHE));
    if (keep && assets.every((asset) => keep.has(asset))) return;
    await precache();
  } catch {
    // Le prochain chargement réessaiera.
  }
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
      const windows = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).filter((client) => new URL(client.url).origin === self.location.origin);
      const open = windows.find((client) => new URL(client.url).pathname.startsWith(SHELL));
      if (open) {
        // Application déjà ouverte : elle va d'elle-même au bon écran, sans se recharger.
        open.postMessage({ type: "open", url: target });
        try {
          await open.focus();
        } catch {
          // Certains navigateurs refusent de reprendre le premier plan : le contenu est tout de même affiché.
        }
        return;
      }
      // Seule une autre page du site est ouverte (accueil, connexion) : elle n'écoute pas ce message,
      // on l'amène donc à l'adresse du contenu.
      const other = windows[0];
      if (other && "navigate" in other) {
        try {
          const moved = await other.navigate(target);
          await (moved || other).focus();
          return;
        } catch {
          // Page non pilotée par ce service worker : on ouvre une fenêtre à la place.
        }
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
    (async () => {
      const cache = await caches.open(CACHE);
      const urls = data.urls
        .filter((url) => typeof url === "string")
        .map((url) => new URL(url, self.location.origin))
        .filter((url) => url.origin === self.location.origin && url.pathname.startsWith("/_next/static/"))
        .map((url) => url.pathname + url.search);
      await Promise.all(urls.map((url) => cacheAsset(cache, url)));
      // Ces fichiers (chargés après coup, comme le moteur d'analyse) rejoignent la liste de la version
      // en cours : le ménage de la prochaine mise à jour saura les retirer.
      const keep = await readKeep(cache);
      if (keep && urls.some((url) => !keep.has(url))) {
        for (const url of urls) keep.add(url);
        await writeKeep(cache, keep);
      }
    })(),
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

async function networkFirstShell(event) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const path = new URL(request.url).pathname;
  const network = fetch(request).then((response) => {
    if (response.ok && SHELLS.includes(path)) {
      cache.put(path, response.clone());
      if (path === SHELL) {
        const copy = response.clone();
        try {
          event.waitUntil(followBuild(copy));
        } catch {
          // L'événement est déjà clos : la vérification se fera au prochain chargement.
        }
      }
    }
    return response;
  });
  const own = await cache.match(path);
  try {
    if (!own) return await network;
    // Réseau présent mais très lent (signal faible) : plutôt qu'un écran blanc, la page déjà en cache
    // s'affiche au bout de quelques secondes ; la réponse du réseau, quand elle arrive, met le cache à jour.
    const first = await Promise.race([network, new Promise((resolve) => setTimeout(() => resolve(null), SLOW_MS))]);
    if (first) return first;
    event.waitUntil(network.catch(() => {}));
    return own;
  } catch {
    // Hors ligne : la page demandée si elle est en cache, sinon l'application.
    const cached = own || (await cache.match(SHELL));
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
    event.respondWith(networkFirstShell(event));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/logo/") || EXTRA.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
