import type { Footballer, Position, RoomConfig } from '@fal/shared';
import { botSkill } from './botSkill.js';
import { loadFootballers, TOP_TIER_DRAFT_RATIO, TOP_TIER_OVR_THRESHOLD } from './pool.js';

/**
 * ============================================================================
 *  BOTUN HAVUZ TAHMİNİ — bot, sıradaki futbolcuları BİLMEZ
 * ----------------------------------------------------------------------------
 *  İnsan draft ekranında kalan havuzu görmez; yalnız kurulum kuralını
 *  (§3.1: mevki başına tam ihtiyaç kadar, %25'i GEN 90+ ve mevkisiz) ve
 *  şimdiye kadar satılanları (kadrolar) bilir. Kullanıcı kararı (27 Eylül
 *  2026): bot da insanın ekranda gördüğünden fazlasını bilmesin.
 *
 *  Bot bu yüzden gerçek havuz yerine bu fonksiyonun ürettiği TEMSİLİ havuzu
 *  kullanır:
 *   - Mevki başına kalan sayı KESİN: ihtiyaç − satılan (masadaki dahil).
 *   - Kalan yıldız sayısı KESİN: round(toplam × %25) − satılan yıldız.
 *     Hangi mevkide oldukları bilinmez: veri setinde o mevkide satılmamış
 *     yıldız sayısıyla orantılı paylaştırılır (mevkinin kalan yeriyle sınırlı).
 *   - GEN'ler bilinmez: veri setinin o mevki / o dilim dağılımından eşit
 *     aralıklı yüzdeliklerle (i + 0.5) / k temsil edilir. Veri setinin genel
 *     dağılımı, insanın gerçek futbolcuların reytinglerini kabaca bilmesine
 *     denk sayılır; hangi futbolcuların havuza düştüğü bilinmez.
 *   - Dip (bedava seviye) mevkideki sıradanların bir yüzdeliğinden aşağı
 *     inmez: zor botta medyan, kolaylaştıkça düşer (`botSkill`).
 *
 *  Deterministik: aynı durum → aynı tahmin (botun tavanı tur içinde oynamaz).
 *  Dönen futbolcular sentetiktir (`est-…` id'li), masadaki futbolcu HARİÇ.
 * ============================================================================
 */

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];

const isStar = (f: Footballer) => f.overall >= TOP_TIER_OVR_THRESHOLD;

/** Sıralı dizinin k eşit aralıklı yüzdeliği. Boşsa `fallback` tekrarlanır. */
function quantiles(sorted: number[], k: number, fallback: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    if (sorted.length === 0) {
      out.push(fallback);
      continue;
    }
    const idx = Math.min(sorted.length - 1, Math.floor(((i + 0.5) / k) * sorted.length));
    out.push(sorted[idx]!);
  }
  return out;
}

/**
 * Kalan `stars` yıldızı mevkilere dağıtır: ağırlıkla orantılı, en büyük
 * kalan yöntemi, her mevki `caps[pos]` ile sınırlı. Sınıra takılan pay
 * diğer mevkilere akar.
 */
function allocateStars(
  stars: number,
  weights: Record<Position, number>,
  caps: Record<Position, number>,
): Record<Position, number> {
  const alloc: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  let left = stars;
  while (left > 0) {
    const open = POSITIONS.filter((p) => alloc[p] < caps[p] && weights[p] > 0);
    if (open.length === 0) break;
    const total = open.reduce((a, p) => a + weights[p], 0);
    // Payı en çok açık olan mevkiye bir yıldız (en büyük kalan, tek tek).
    let best = open[0]!;
    let bestGap = -Infinity;
    for (const p of open) {
      const gap = (weights[p] / total) * stars - alloc[p];
      if (gap > bestGap) {
        bestGap = gap;
        best = p;
      }
    }
    alloc[best] += 1;
    left -= 1;
  }
  return alloc;
}

export function estimatePool(
  config: RoomConfig,
  participants: readonly { squad: readonly Footballer[] }[],
  current: Footballer,
): Footballer[] {
  const n = participants.length;
  const all = loadFootballers();

  const sold = new Set<string>([current.id]);
  const soldCount: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  let soldStars = 0;
  const count = (f: Footballer) => {
    soldCount[f.position] += 1;
    if (isStar(f)) soldStars += 1;
  };
  for (const p of participants) {
    for (const f of p.squad) {
      sold.add(f.id);
      count(f);
    }
  }
  count(current);

  const left: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  let totalNeed = 0;
  for (const pos of POSITIONS) {
    const need = config.squad[pos] * n;
    totalNeed += need;
    left[pos] = Math.max(0, need - soldCount[pos]);
  }

  // Kurulum kuralı (pool.ts buildDraftPool): yıldız sayısı toplamın %25'i.
  const unsold = all.filter((f) => !sold.has(f.id));
  const totalStars = Math.min(
    all.filter(isStar).length,
    Math.round(totalNeed * TOP_TIER_DRAFT_RATIO),
  );
  const starsLeft = Math.max(0, totalStars - soldStars);
  const starWeights: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const f of unsold) if (isStar(f)) starWeights[f.position] += 1;
  const starAlloc = allocateStars(starsLeft, starWeights, left);

  const out: Footballer[] = [];
  for (const pos of POSITIONS) {
    const starOvr = unsold
      .filter((f) => f.position === pos && isStar(f))
      .map((f) => f.overall)
      .sort((a, b) => a - b);
    const normalOvr = unsold
      .filter((f) => f.position === pos && !isStar(f))
      .map((f) => f.overall)
      .sort((a, b) => a - b);
    const kStar = starAlloc[pos];
    const kNormal = left[pos] - kStar;
    const normQ = quantiles(normalOvr, kNormal, TOP_TIER_OVR_THRESHOLD - 1);
    // BEDAVA SEVİYE: tahmini havuzun dibi mevkideki sıradanların
    // `freeLevelQuantile` yüzdeliğinden aşağı inmez. Zor bot medyan der —
    // "sırada kim var bilmiyorum ama ortalama birini nasılsa asgariye
    // bulurum", yalnız ortalamanın üstüne para verir. Ölçüm (measureBotIQ,
    // 8 takım, yalnız-yıldız insanı): dip = veri setinin dibi (78) → +1.2
    // güç, %25 dilim → +0.55, medyan → +0.26 (gerçek havuzu gören botla aynı).
    if (normQ.length > 0 && normalOvr.length > 0) {
      const q = botSkill(config).freeLevelQuantile;
      const freeLevel =
        normalOvr[Math.min(normalOvr.length - 1, Math.floor(normalOvr.length * q))]!;
      normQ[0] = Math.max(normQ[0]!, freeLevel);
    }
    const values = [...normQ, ...quantiles(starOvr, kStar, TOP_TIER_OVR_THRESHOLD)];
    values.forEach((overall, i) => {
      out.push({ id: `est-${pos}-${i}`, name: '(tahmin)', position: pos, overall });
    });
  }
  return out;
}
