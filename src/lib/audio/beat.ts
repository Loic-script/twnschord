/**
 * Prépare l'enveloppe d'attaques : retire la moyenne locale (≈ 1 s),
 * ne garde que la partie positive, puis normalise par l'écart type.
 */
export function normalizeOnsets(env: Float32Array, fps: number): Float32Array {
  const n = env.length;
  const out = new Float32Array(n);
  const half = Math.max(1, Math.round(fps * 0.5));
  // Moyenne glissante sur la fenêtre [i − half, i + half], bornée au signal.
  let sum = 0;
  let count = 0;
  for (let i = 0; i <= half && i < n; i++) {
    sum += env[i];
    count++;
  }
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const add = i + half;
      if (add < n) {
        sum += env[add];
        count++;
      }
      const drop = i - half - 1;
      if (drop >= 0) {
        sum -= env[drop];
        count--;
      }
    }
    const v = env[i] - sum / count;
    out[i] = v > 0 ? v : 0;
  }
  let sq = 0;
  for (let i = 0; i < n; i++) sq += out[i] * out[i];
  const std = Math.sqrt(sq / Math.max(1, n));
  if (std > 1e-9) for (let i = 0; i < n; i++) out[i] /= std;
  return out;
}

/**
 * Tempo par autocorrélation de l'enveloppe d'attaques, pondérée par une
 * préférence douce autour de 110 bpm pour trancher entre tempo simple et double.
 * Renvoie 0 si le signal ne contient aucune pulsation exploitable.
 */
export function estimateTempo(env: Float32Array, fps: number, minBpm = 55, maxBpm = 210): number {
  const n = env.length;
  const maxLag = Math.min(n - 1, Math.ceil((fps * 60) / minBpm) * 2 + 2);
  if (maxLag < 4) return 0;
  const ac = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let s = 0;
    for (let t = 0; t + lag < n; t++) s += env[t] * env[t + lag];
    ac[lag] = s / (n - lag);
  }
  const at = (lag: number) => {
    const i = Math.floor(lag);
    if (i + 1 > maxLag) return 0;
    const f = lag - i;
    return ac[i] * (1 - f) + ac[i + 1] * f;
  };

  const pMin = (fps * 60) / maxBpm;
  const pMax = (fps * 60) / minBpm;
  let best = 0;
  let bestScore = 0;
  for (let p = pMin; p <= pMax; p += 0.1) {
    const bpm = (fps * 60) / p;
    const z = Math.log2(bpm / 110);
    const prior = Math.exp(-0.5 * z * z);
    const score = (at(p) + 0.5 * at(2 * p)) * prior;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best > 0 ? (fps * 60) / best : 0;
}

/**
 * Suivi des temps par programmation dynamique (Ellis, 2007) : on cherche la
 * suite d'instants qui tombe sur les attaques tout en restant régulière.
 * Renvoie les index de trames des temps.
 */
export function trackBeats(env: Float32Array, fps: number, bpm: number, tightness = 100): number[] {
  const n = env.length;
  const period = (fps * 60) / bpm;
  if (n < period * 2) return [];

  // Lissage gaussien léger de l'enveloppe.
  const sigma = Math.max(1, period / 32);
  const radius = Math.ceil(sigma * 3);
  const kernel = new Float32Array(2 * radius + 1);
  for (let i = -radius; i <= radius; i++) kernel[i + radius] = Math.exp(-0.5 * (i / sigma) ** 2);
  const local = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    let s = 0;
    for (let i = -radius; i <= radius; i++) {
      const u = t + i;
      if (u >= 0 && u < n) s += env[u] * kernel[i + radius];
    }
    local[t] = s;
  }

  const lo = Math.max(1, Math.round(period / 2));
  const hi = Math.round(period * 2);
  const cost = new Float32Array(hi + 1);
  for (let d = lo; d <= hi; d++) cost[d] = -tightness * Math.log(d / period) ** 2;

  const score = new Float32Array(n);
  const back = new Int32Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    let bestVal = -Infinity;
    let bestPrev = -1;
    for (let d = lo; d <= hi; d++) {
      const p = t - d;
      if (p < 0) break;
      const v = score[p] + cost[d];
      if (v > bestVal) {
        bestVal = v;
        bestPrev = p;
      }
    }
    if (bestPrev >= 0) {
      score[t] = local[t] + bestVal;
      back[t] = bestPrev;
    } else {
      score[t] = local[t];
    }
  }

  let last = n - 1;
  for (let t = Math.max(0, n - Math.round(period)); t < n; t++) if (score[t] > score[last]) last = t;
  const beats: number[] = [];
  for (let t = last; t >= 0; t = back[t]) beats.push(t);
  beats.reverse();
  return beats;
}
