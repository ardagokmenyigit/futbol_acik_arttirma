/**
 * Mulberry32 deterministik PRNG (Pseudo-Random Number Generator).
 * Verilen bir tohum (seed) için her zaman aynı rastgele sayı dizisini (0 <= x < 1) üretir.
 */
export function createPRNG(seed: number): () => number {
  let s = Math.floor(seed) >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * String bir metinden (örneğin matchId + roundId) deterministik 32-bit tamsayı tohumu üretir.
 */
export function stringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // 32-bit int
  }
  return hash >>> 0;
}
