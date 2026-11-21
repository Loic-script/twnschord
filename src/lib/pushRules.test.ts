import { createECDH, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as webpush from "web-push";
import { buildPayload, isPushEndpoint, parseSubscription, readTarget } from "./pushRules";

// Bibliothèque de chiffrement utilisée par web-push : sert ici à jouer le rôle de l'appareil qui déchiffre.
const ece = createRequire(import.meta.url)("http_ece") as {
  decrypt(body: Buffer, options: { version: string; privateKey: unknown; authSecret: string }): Buffer;
};

/** Un abonnement comme en produit un navigateur, avec la clé privée que seul l'appareil détient. */
function device(endpoint = "https://fcm.googleapis.com/fcm/send/abc123") {
  const keys = createECDH("prime256v1");
  keys.generateKeys();
  const auth = randomBytes(16).toString("base64url");
  return { keys, subscription: { endpoint, keys: { p256dh: keys.getPublicKey().toString("base64url"), auth } } };
}

describe("adresses d'appareil acceptées", () => {
  it("accepte les services de notification des navigateurs", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/dXNlcg:APA91b",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAAA",
      "https://web.push.apple.com/QGuS1",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAD",
    ]) {
      expect(isPushEndpoint(endpoint), endpoint).toBe(true);
    }
  });

  it("refuse tout le reste, pour que le serveur n'appelle jamais une adresse choisie par un inconnu", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/abc", // pas en https
      "https://localhost:5432/",
      "https://127.0.0.1/admin",
      "https://192.168.1.1/",
      "https://evil.example/fcm.googleapis.com",
      "https://fcm.googleapis.com.evil.example/x",
      "https://fcm.googleapis.com:8443/x", // port inhabituel
      "https://push.apple.com.evil.example/",
      "file:///etc/passwd",
      "pas une adresse",
      "",
      null,
      42,
    ]) {
      expect(isPushEndpoint(endpoint), String(endpoint)).toBe(false);
    }
  });
});

describe("abonnement reçu du navigateur", () => {
  it("accepte un vrai abonnement et n'en garde que l'utile", () => {
    const { subscription } = device();
    expect(parseSubscription({ ...subscription, expirationTime: null, autre: "ignoré" })).toEqual(subscription);
  });

  it("refuse un abonnement incomplet ou trafiqué", () => {
    const { subscription } = device();
    expect(parseSubscription(null)).toBeNull();
    expect(parseSubscription({ endpoint: subscription.endpoint })).toBeNull();
    expect(parseSubscription({ ...subscription, endpoint: "https://evil.example/x" })).toBeNull();
    expect(parseSubscription({ ...subscription, keys: { ...subscription.keys, p256dh: "trop-court" } })).toBeNull();
    expect(parseSubscription({ ...subscription, keys: { ...subscription.keys, auth: "des espaces interdits !!" } })).toBeNull();
  });
});

describe("contenu d'une notification", () => {
  it("borne les longueurs", () => {
    const payload = JSON.parse(buildPayload({ title: "T".repeat(500), body: "B".repeat(5000), url: "/?morceau=1", tag: "x".repeat(200) }));
    expect(payload.title).toHaveLength(80);
    expect(payload.body).toHaveLength(240);
    expect(payload.tag).toHaveLength(60);
    expect(payload.url).toBe("/?morceau=1");
  });

  it("n'emmène jamais vers un autre site", () => {
    for (const url of ["https://evil.example/", "//evil.example/", "javascript:alert(1)", "evil"]) {
      expect(JSON.parse(buildPayload({ title: "t", body: "b", url })).url).toBe("/");
    }
  });
});

describe("ce que le clic ouvre", () => {
  const origin = "https://twinschord.example";
  it("un morceau de la bibliothèque, un onglet, ou l'accueil", () => {
    expect(readTarget("/?morceau=12", origin)).toEqual({ kind: "piece", id: "12" });
    expect(readTarget(`${origin}/?onglet=generate`, origin)).toEqual({ kind: "tab", tab: "generate" });
    expect(readTarget("/", origin)).toEqual({ kind: "home" });
  });

  it("ignore une adresse étrangère ou malformée", () => {
    expect(readTarget("https://evil.example/?morceau=12", origin)).toEqual({ kind: "home" });
    expect(readTarget("/?morceau=12;DROP", origin)).toEqual({ kind: "home" });
    expect(readTarget("/?onglet=<script>", origin)).toEqual({ kind: "home" });
  });
});

describe("envoi chiffré", () => {
  const vapid = webpush.generateVAPIDKeys();
  const options = { vapidDetails: { subject: "mailto:contact@example.com", publicKey: vapid.publicKey, privateKey: vapid.privateKey }, TTL: 3600 };
  const message = { title: "Nouveau morceau enregistré", body: "« Hymne 42 » est dans votre bibliothèque.", url: "/?morceau=7", tag: "morceau-7" };

  it("part vers l'appareil, signé par le serveur, et illisible en chemin", () => {
    const { subscription } = device();
    const request = webpush.generateRequestDetails(subscription, buildPayload(message), options);
    expect(request.endpoint).toBe(subscription.endpoint);
    expect(request.method).toBe("POST");
    expect(String(request.headers.Authorization)).toMatch(/^vapid t=.+, k=.+/);
    expect(request.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(request.headers.TTL).toBe(3600);
    const body = request.body as Buffer;
    // Le service qui transporte le message n'y trouve ni le titre, ni le texte, ni l'adresse.
    for (const secret of ["Nouveau morceau", "Hymne 42", "morceau=7"]) expect(body.includes(secret)).toBe(false);
  });

  it("seul l'appareil abonné peut le déchiffrer", () => {
    const target = device();
    const body = webpush.generateRequestDetails(target.subscription, buildPayload(message), options).body as Buffer;
    const clear = ece.decrypt(body, { version: "aes128gcm", privateKey: target.keys, authSecret: target.subscription.keys.auth });
    expect(JSON.parse(clear.toString("utf8"))).toEqual(message);

    const other = device();
    expect(() => ece.decrypt(body, { version: "aes128gcm", privateKey: other.keys, authSecret: other.subscription.keys.auth })).toThrow();
  });
});
