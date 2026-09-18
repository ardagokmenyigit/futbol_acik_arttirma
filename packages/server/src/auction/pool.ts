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
 * 90+ GEN olan süperstar futbolcuları belirler.
 */
export const TOP_TIER_OVR_THRESHOLD = 90;

/**
 * Draft havuzundaki üst seviye oyuncu oranı (%25).
 * 4 katılımcılı 28 turluk bir oyunda tam 7 üst seviye futbolcu gelir.
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
 * YILDIZ PAYI: havuzun %25'i (28'de 7) üst seviye (GEN 90+) futbolcudur ve bu
 * 7 kişi **mevkiye bakılmaksızın** tüm 90+'lar arasından rastgele seçilir —
 * bir oyunda 4 yıldız forvet gelebilir, başka bir oyunda 2 yıldız kaleci.
 * Tek sınır mevkinin toplam ihtiyacı (4 GK'nin hepsi yıldız olabilir, 5'i
 * olamaz). Kalan yerler mevki başına 90 altından rastgele doldurulur. Eskiden
 * yıldızlar mevkiye dağıtılıyordu (1 GK, 2 DEF, 2 MID, 2 FWD — her oyunda aynı
 * kalıp); kullanıcı 18 Eylül 2026'da "oran korunsun, mevkiye göre olmasın"
 * dedi — böylece hangi mevkinin kıymetli olacağı oyundan oyuna değişir.
 *
 * Pozisyonda yeterli futbolcu yoksa hata verir — veri seti bunu karşılamalıdır.
 */
export function buildDraftPool(config: RoomConfig, participantCount: number): Footballer[] {
  const all = loadFootballers();
  const need: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  let totalNeed = 0;
  for (const position of VALID_POSITIONS) {
    need[position] = config.squad[position] * participantCount;
    totalNeed += need[position];
    const available = all.filter((f) => f.position === position).length;
    if (available < need[position]) {
      throw new Error(
        `players.json: ${position} için ${need[position]} futbolcu gerekiyor, havuzda ${available} var`,
      );
    }
  }

  // 1) Yıldızlar: tüm 90+'lar arasından, mevki ihtiyacını aşmadan, rastgele.
  const topAll = shuffled(all.filter((f) => f.overall >= TOP_TIER_OVR_THRESHOLD));
  const topNeed = Math.min(topAll.length, Math.round(totalNeed * TOP_TIER_DRAFT_RATIO));
  const picked: Footballer[] = [];
  const count: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const f of topAll) {
    if (picked.length >= topNeed) break;
    if (count[f.position] >= need[f.position]) continue;
    picked.push(f);
    count[f.position]++;
  }

  // 2) Kalan yerler: mevki başına 90 altından rastgele (yetmezse yıldızlardan tamamlanır).
  const pickedIds = new Set(picked.map((f) => f.id));
  for (const position of VALID_POSITIONS) {
    const remaining = need[position] - count[position];
    if (remaining <= 0) continue;
    const normal = shuffled(
      all.filter((f) => f.position === position && f.overall < TOP_TIER_OVR_THRESHOLD),
    );
    const extra = shuffled(
      all.filter(
        (f) =>
          f.position === position && !pickedIds.has(f.id) && f.overall >= TOP_TIER_OVR_THRESHOLD,
      ),
    );
    picked.push(...[...normal, ...extra].slice(0, remaining));
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
    overall: num('overall'),
  };
}
