/**
 * Limiteur de débit en mémoire : compte les essais par clé sur une fenêtre de
 * temps. Suffisant pour un serveur unique ; avec plusieurs serveurs, il
 * faudrait un compteur partagé (base de données ou Redis).
 */
const buckets = new Map<string, { count: number; reset: number }>();

/** Enregistre un essai pour `key` et dit si la limite de `max` essais par `windowMs` est dépassée. */
export function limited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    // Ménage occasionnel, pour que la table ne grossisse pas sans fin.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    }
    return false;
  }
  bucket.count++;
  return bucket.count > max;
}
