import { readFileSync } from 'node:fs';
import type { Footballer, Position } from '@fal/shared';

/** data/players.json — dist/auction/ ve src/auction/ için de aynı göreli yol. */
const DATA_URL = new URL('../../data/players.json', import.meta.url);
const VALID_POSITIONS: readonly Position[] = ['GK', 'DEF', 'MID', 'FWD'];

let cache: Footballer[] | null = null;

/** Futbolcu havuzunu diskten okur, doğrular ve önbelleğe alır. */
export function loadFootballers(): Footballer[] {
  if (cache) return cache;

  const parsed = JSON.parse(readFileSync(DATA_URL, 'utf8')) as { players?: unknown };
  if (!Array.isArray(parsed.players)) {
    throw new Error('players.json: "players" bir dizi değil');
  }
  const list = parsed.players.map((entry, i) => parseFootballer(entry, i));
  if (list.length === 0) throw new Error('players.json boş — futbolcu yok');

  cache = list;
  return list;
}

export function findFootballer(id: string): Footballer | undefined {
  return loadFootballers().find((f) => f.id === id);
}

/** Fisher–Yates — havuzu kopyalayıp karıştırır. */
export function shuffled<T>(input: readonly T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function parseFootballer(entry: unknown, index: number): Footballer {
  const o = entry as Record<string, unknown>;
  const num = (key: string): number => {
    const n = Number(o[key]);
    if (!Number.isFinite(n)) throw new Error(`players.json[${index}].${key} sayı değil`);
    return n;
  };
  const position = String(o.position) as Position;
  if (!VALID_POSITIONS.includes(position)) {
    throw new Error(`players.json[${index}].position geçersiz: ${String(o.position)}`);
  }
  const id = String(o.id ?? '').trim();
  const name = String(o.name ?? '').trim();
  if (!id || !name) throw new Error(`players.json[${index}] id/name eksik`);

  return {
    id,
    name,
    position,
    attack: num('attack'),
    defense: num('defense'),
    overall: num('overall'),
    ...(o.basePrice !== undefined && o.basePrice !== null ? { basePrice: num('basePrice') } : {}),
  };
}
