import type { Footballer, Participant, Position, RoomConfig } from '@fal/shared';
import { positionCount } from './validateBid.js';

/**
 * ============================================================================
 *  BOT TEKLİF MOTORU
 * ----------------------------------------------------------------------------
 *  Bot "akıllı" olsun diye üç şeye birden bakar:
 *
 *  1. İHTİYAÇ    — o pozisyonda hâlâ boş slotu var mı?
 *  2. REZERV     — kalan zorunlu slotları en ucuz fiyatlardan doldurmaya
 *                  yetecek parayı kenara ayırır. Böylece bir yıldıza tüm
 *                  bütçesini yatırıp kadrosunu yarım bırakmaz.
 *  3. DEĞERLEME  — futbolcunun `overall` değerine göre ödemeye razı olduğu
 *                  tavan fiyatı belirler; kıtlık arttıkça (az slot kaldıkça)
 *                  daha agresif olur.
 *
 *  Teklifi hemen değil, insansı bir gecikmeyle verir (bkz. botBidDelayMs).
 * ============================================================================
 */

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];

/** Bot düşünme süresi — turun sonuna yakınsa daha çabuk davranır. */
export function botBidDelayMs(remainingMs: number): number {
  const base = 700 + Math.random() * 1800;
  // Süre azaldıysa acele et (turun kaçmasına izin verme).
  if (remainingMs < 3000) return Math.min(base, 400 + Math.random() * 600);
  return base;
}

/**
 * Kalan zorunlu slotları doldurmak için gereken minimum para.
 * `pool` = henüz artırmaya çıkmamış futbolcular (fiyat referansı).
 */
function reserveNeeded(
  bot: Participant,
  config: RoomConfig,
  pool: Footballer[],
  excludePosition?: Position,
  excludeOne = false,
): number {
  // Pozisyon başına havuzdaki en ucuz fiyatlar
  const cheapest = new Map<Position, number[]>();
  for (const pos of POSITIONS) {
    const prices = pool
      .filter((f) => f.position === pos)
      .map((f) => f.basePrice)
      .sort((a, b) => a - b);
    cheapest.set(pos, prices);
  }

  let total = 0;
  for (const pos of POSITIONS) {
    let need = config.squad[pos] - positionCount(bot, pos);
    // Bu turda alacağı futbolcuyu ihtiyaçtan düş
    if (excludeOne && pos === excludePosition) need -= 1;
    if (need <= 0) continue;

    const prices = cheapest.get(pos) ?? [];
    for (let i = 0; i < need; i++) {
      // Havuzda o pozisyondan yeterli futbolcu yoksa taban tahmini kullan
      total += prices[i] ?? 12;
    }
  }
  return total;
}

/**
 * Botun bu futbolcu için ödemeye razı olduğu tavan fiyat.
 * Dönen değer 0 ise bot bu futbolcuyla ilgilenmiyor demektir.
 */
export function botMaxBid(
  bot: Participant,
  footballer: Footballer,
  config: RoomConfig,
  pool: Footballer[],
): number {
  const pos = footballer.position;

  // 1. İHTİYAÇ — bu pozisyon dolmuşsa hiç teklif verme
  const have = positionCount(bot, pos);
  const want = config.squad[pos];
  if (have >= want) return 0;
  if (bot.squad.length >= config.squadSize) return 0;

  // 2. REZERV — bu futbolcuyu aldıktan sonra kalan slotlara yetecek para
  const reserve = reserveNeeded(bot, config, pool, pos, true);
  const affordable = bot.budget - reserve;
  if (affordable < footballer.basePrice) return 0;

  // 3. DEĞERLEME — overall'a göre taban fiyatın üstüne prim
  //    overall 60 -> ~1.0x, 75 -> ~1.35x, 90 -> ~1.7x
  const quality = Math.max(0, (footballer.overall - 60) / 30); // 0..1
  let valuation = footballer.basePrice * (1 + quality * 0.7);

  // KITLIK — son slotlarını doldururken daha agresif ol
  const slotsLeft = config.squadSize - bot.squad.length;
  const poolForPos = pool.filter((f) => f.position === pos).length;
  if (poolForPos <= want - have) {
    // Havuzda ihtiyacı kadar ya da daha az kaldı: kaçırmayı göze alamaz
    valuation = affordable;
  } else if (slotsLeft <= 2) {
    valuation *= 1.15;
  }

  // Kişilik — her bot biraz farklı davransın (%±8)
  valuation *= 0.92 + Math.random() * 0.16;

  return Math.max(0, Math.min(Math.floor(valuation), affordable));
}

/**
 * Botun bu tur vereceği teklif miktarı. Teklif vermeyecekse null.
 *
 * @param currentHighest mevcut en yüksek teklif (yoksa null)
 * @param floor          geçerli minimum teklif (taban fiyat ya da +artış)
 */
export function decideBotBid(
  bot: Participant,
  footballer: Footballer,
  config: RoomConfig,
  pool: Footballer[],
  currentHighest: { playerId: string; amount: number } | null,
  floor: number,
): number | null {
  // Kendi teklifinin üstüne çıkma
  if (currentHighest?.playerId === bot.id) return null;

  const max = botMaxBid(bot, footballer, config, pool);
  if (max <= 0) return null;
  if (floor > max) return null;

  // Genelde tabanı ver; ara sıra caydırmak için biraz üstüne çık.
  const bump = Math.random() < 0.35 ? Math.ceil(Math.random() * 3) : 0;
  return Math.min(floor + bump, max);
}
