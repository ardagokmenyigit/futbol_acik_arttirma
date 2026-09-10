import { readFileSync } from 'node:fs';
import type { Footballer, Position, RoomConfig } from '@fal/shared';

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

/**
 * Üst seviye oyuncu eşik değeri:
 * Orijinal veri setinde 87+ GEN olan 49 süperstar (%9.72'lik grup), %7 istatistik
 * artışından sonra >= 93 GEN olmuştur.
 */
export const TOP_TIER_OVR_THRESHOLD = 93;

/**
 * Draft havuzundaki üst seviye oyuncu oranı (%25).
 * 4 katılımcılı 28 turluk bir oyunda tam 7 adet (1 GK, 2 DEF, 2 MID, 2 FWD)
 * üst seviye oyuncunun gelmesini sağlar.
 */
export const TOP_TIER_DRAFT_RATIO = 0.25;

/**
 * Draft havuzunu kurar: pozisyon başına TAM OLARAK ihtiyaç kadar futbolcu.
 *
 * 4 katılımcı × (1 GK, 2 DEF, 2 MID, 2 FWD) → 4 kaleci, 8 defans, 8 orta saha,
 * 8 forvet = 28 futbolcu, 28 tur. Arz talebe tam denk olduğu için:
 *
 *  - her tur MUTLAKA satılır ve her katılımcı tam kadroyla biter (aritmetik
 *    zorunluluk: 28 satış, kişi başı tavan 7),
 *  - "beklersem ucuza kaparım" artık bedava değil — beklerken iyi futbolcular
 *    tükeniyor, elde kalan gerçekten kimsenin istemediği oluyor. Eski geniş
 *    havuzda (28 slot için 108 futbolcu) beklemenin hiçbir maliyeti yoktu.
 *
 * Seçim sırasında mevkisel olarak %25 oranında üst seviye (93+ GEN) futbolcular
 * dahil edilir (4 kişilik oyunda tam 7 adet: 1 GK, 2 DEF, 2 MID, 2 FWD).
 *
 * Pozisyonda yeterli futbolcu yoksa hata verir — veri seti bunu karşılamalıdır.
 */
export function buildDraftPool(config: RoomConfig, participantCount: number): Footballer[] {
  const all = loadFootballers();
  const picked: Footballer[] = [];

  for (const position of VALID_POSITIONS) {
    const need = config.squad[position] * participantCount;
    if (need <= 0) continue;
    const candidates = all.filter((f) => f.position === position);
    if (candidates.length < need) {
      throw new Error(
        `players.json: ${position} için ${need} futbolcu gerekiyor, havuzda ${candidates.length} var`,
      );
    }

    const topCandidates = candidates.filter((f) => f.overall >= TOP_TIER_OVR_THRESHOLD);
    const normalCandidates = candidates.filter((f) => f.overall < TOP_TIER_OVR_THRESHOLD);

    // Her mevkide ihtiyacın %25'i kadar üst seviye oyuncu seç (örn. 4 GK için 1, 8 DEF için 2).
    const topNeed = Math.min(topCandidates.length, Math.round(need * TOP_TIER_DRAFT_RATIO));
    const normalNeed = need - topNeed;

    if (normalCandidates.length < normalNeed) {
      picked.push(...shuffled(candidates).slice(0, need));
    } else {
      picked.push(...shuffled(topCandidates).slice(0, topNeed));
      picked.push(...shuffled(normalCandidates).slice(0, normalNeed));
    }
  }
  // Turların sırası da rastgele olsun — pozisyonlar bloklar hâlinde gelmesin.
  return shuffled(picked);
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
  };
}
