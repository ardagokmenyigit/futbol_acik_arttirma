import type { Footballer, Participant, Position, RoomConfig } from '@fal/shared';
import { calculateTeamStats } from '../simulation/teamStats.js';
import { positionCount } from './validateBid.js';

/**
 * ============================================================================
 *  BOT TEKLİF MOTORU
 * ----------------------------------------------------------------------------
 *  Temel fikir: bir futbolcunun değeri `overall` değil, **benim takımıma
 *  kattığı güç**. Maç simülasyonu takım gücünü pozisyon ağırlıklı hesapladığı
 *  için (calculateTeamStats: hücumda FWD %45 / MID %35, savunmada DEF %45 /
 *  GK %25) bot da aynı ölçüyü kullanır. Böylece hücumu zayıf bot forvete,
 *  savunması zayıf bot stopere daha çok öder — kadrolar farklılaşır.
 *
 *  Fiyatlama "yedek seviyesine göre artı değer" mantığıyla:
 *
 *      tavan = yedeğin maliyeti + prim × (bu oyuncunun katkısı − yedeğin katkısı)
 *
 *  Yedek = havuzda o pozisyonda kalan, ulaşılabilir sıradan futbolcu.
 *  Yani bot, "zaten benzerini ucuza bulurum" dediği oyuncuya fazla ödemez;
 *  gerçekten fark yaratan oyuncu için cebini açar.
 *
 *  Üç kısıt her zaman geçerli:
 *   1. İHTİYAÇ  — pozisyon dolduysa teklif yok.
 *   2. REZERV   — kalan zorunlu slotları doldurmaya yetecek para kenarda kalır
 *                 (emniyet payıyla). Bot kadrosunu asla yarım bırakmaz.
 *   3. KİŞİLİK  — her botun sabit bir karakteri var (agresiflik, yıldız
 *                 avcılığı, sabır). id'den türetilir, oyun boyunca değişmez.
 * ============================================================================
 */

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];

/** Rezerv emniyet payı — ucuz futbolcuları rakip kapabilir. */
const RESERVE_SAFETY = 1.2;

/* --------------------------- deterministik gürültü --------------------------- */

/** Stabil hash — aynı girdi hep aynı sayı (kararlı değerleme için şart). */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296; // 0..1
}

/** Botun sabit karakteri — id'den türer, oyun boyunca değişmez. */
export interface BotPersona {
  /** Adil fiyatın üstüne ne kadar çıkar (0.85 = pazarlıkçı, 1.30 = agresif). */
  aggression: number;
  /** Yıldız avcısı mı, bütçeyi yayan mı (0 = yayar, 1 = yıldıza yüklenir). */
  starHunter: number;
  /** Teklif adımı büyüklüğü — bazıları çekiştirir, bazıları resti görür. */
  decisiveness: number;
  /** Tek futbolcuya yatırabileceği bütçe oranı — kişiliğin asıl strateji etkisi. */
  maxSingleShare: number;
}

export function botPersona(botId: string): BotPersona {
  const star = hash(`${botId}#star7`);
  return {
    // Dağılımı ortaya toplamamak için iki hash'in ortalaması yerine tek,
    // farklı tuzlu hash kullanılır.
    aggression: 0.82 + hash(`${botId}#agg3`) * 0.5,
    starHunter: star,
    decisiveness: hash(`${botId}#dec5`),
    /**
     * Tek bir futbolcuya toplam bütçenin en fazla yüzde kaçını yatırır.
     * Yıldız avcısı bir oyuncuya yüklenip gerisini pazarlıkla toplar;
     * "yayıcı" bot ise hiçbir oyuncuya fazla vermez. Asıl strateji farkı bu.
     */
    maxSingleShare: 0.26 + star * 0.34,
  };
}

/** Bot düşünme süresi — turun sonuna yakınsa daha çabuk davranır. */
export function botBidDelayMs(remainingMs: number): number {
  const base = 700 + Math.random() * 1800;
  if (remainingMs < 3000) return Math.min(base, 400 + Math.random() * 600);
  return base;
}

/* ------------------------------ takım gücü ------------------------------ */

/** Kadronun tek sayıya indirgenmiş gücü (simülasyonun kullandığı ölçü). */
function strengthOf(squad: Footballer[]): number {
  const { attack, defense } = calculateTeamStats(squad);
  return (attack + defense) / 2;
}

/** Bu futbolcuyu alırsam takım gücüm ne kadar artar? */
function marginalGain(squad: Footballer[], candidate: Footballer): number {
  return strengthOf([...squad, candidate]) - strengthOf(squad);
}

/**
 * "Yedek seviyesi": havuzda o pozisyonda kalanların ortancası.
 * Bot bunu referans alır — yedekten farkı kadar prim öder.
 */
function replacementFor(pool: Footballer[], pos: Position): Footballer | null {
  const same = pool.filter((f) => f.position === pos).sort((a, b) => a.overall - b.overall);
  if (same.length === 0) return null;
  return same[Math.floor(same.length / 2)] ?? null;
}

/* -------------------------------- rezerv -------------------------------- */

/**
 * Kalan zorunlu slotları doldurmak için gereken minimum para.
 * `excludeOne` verilen pozisyondan bir slotu (bu turda alacağını) düşer.
 */
function reserveNeeded(
  bot: Participant,
  config: RoomConfig,
  pool: Footballer[],
  excludePosition?: Position,
  excludeOne = false,
): number {
  let total = 0;
  for (const pos of POSITIONS) {
    let need = config.squad[pos] - positionCount(bot, pos);
    if (excludeOne && pos === excludePosition) need -= 1;
    if (need <= 0) continue;

    const prices = pool
      .filter((f) => f.position === pos)
      .map((f) => f.basePrice)
      .sort((a, b) => a - b);

    for (let i = 0; i < need; i++) {
      // Havuz tükenmişse temkinli bir tahmin kullan.
      total += prices[i] ?? 20;
    }
  }
  return Math.ceil(total * RESERVE_SAFETY);
}

/* ------------------------------ değerleme ------------------------------ */

/**
 * Botun bu futbolcu için ödemeye razı olduğu tavan fiyat.
 * 0 dönerse bot ilgilenmiyor demektir.
 *
 * Aynı (bot, futbolcu) çifti için HER ZAMAN aynı değeri döndürür — tavanın
 * tur içinde oynamaması kritik (yoksa bot kendi kararıyla çelişir).
 */
export function botMaxBid(
  bot: Participant,
  footballer: Footballer,
  config: RoomConfig,
  pool: Footballer[],
): number {
  const pos = footballer.position;

  // 1. İHTİYAÇ
  if (positionCount(bot, pos) >= config.squad[pos]) return 0;
  if (bot.squad.length >= config.squadSize) return 0;

  // 2. REZERV — bu alımdan sonra kalan slotlara para kalmalı
  const reserve = reserveNeeded(bot, config, pool, pos, true);
  const affordable = bot.budget - reserve;
  if (affordable < footballer.basePrice) return 0;

  const persona = botPersona(bot.id);
  const slotsLeft = config.squadSize - bot.squad.length;
  const fairShare = bot.budget / Math.max(1, slotsLeft);

  // 3a. ORTAK DEĞER — futbolcu kendi pozisyonunda ne kadar iyi?
  //     Gerçek açık artırmada yıldız, herkes istediği için pahalıdır.
  //     Havuzda kalan aynı pozisyondakiler arasındaki yüzdelik dilimi.
  const posPool = pool.filter((f) => f.position === pos);
  const better = posPool.filter((f) => f.overall < footballer.overall).length;
  const qualityPct = posPool.length > 0 ? better / posPool.length : 0.5; // 0..1

  // 3b. ÖZEL DEĞER — bu oyuncu BENİM kadromu ne kadar güçlendiriyor?
  //     Yedeğine göre artı değeri. Hücumu zayıf bot forvete daha çok öder.
  const myGain = marginalGain(bot.squad, footballer);
  const replacement = replacementFor(pool, pos);
  const replGain = replacement ? marginalGain(bot.squad, replacement) : 0;
  const edge = Math.max(0, myGain - replGain);
  // Tipik artı değer ~1-3 puan; 3 puanı "tam uyum" say.
  const fitScore = Math.min(1, edge / 3);

  // İkisini harmanla. starHunter yüksek bot kaliteye, düşük bot uyuma bakar.
  const qualityWeight = 1.15 + persona.starHunter * 1.25;
  const fitWeight = 0.85 - persona.starHunter * 0.45;
  let valuation =
    fairShare * (0.5 + qualityWeight * qualityPct + fitWeight * fitScore) * persona.aggression;

  // Taban fiyatın altına düşmesin
  valuation = Math.max(valuation, footballer.basePrice);

  // KITLIK — havuzda o pozisyondan ihtiyacım kadar ya da az kaldıysa kaçırma
  const need = config.squad[pos] - positionCount(bot, pos);
  const availableForPos = pool.filter((f) => f.position === pos).length;
  if (availableForPos <= need) {
    valuation = affordable; // mecburen sonuna kadar
  } else if (availableForPos <= need + 2) {
    valuation *= 1.25;
  }

  // KİŞİLİK TAVANI — tek bir futbolcuya bütçenin belli bir oranından fazlasını
  // yatırma. Yıldız avcısı bir oyuncuya yüklenir, "yayıcı" bot parayı dağıtır.
  // Asıl strateji farkı burada doğuyor. Kıtlıkta ve son iki slotta uygulanmaz —
  // kadroyu tamamlamak kişilikten önce gelir.
  if (availableForPos > need && slotsLeft > 2) {
    valuation = Math.min(valuation, config.startingBudget * persona.maxSingleShare);
  }

  // Son slotlarda elde kalan parayı değerlendir (israf etme). Yayıcı bot
  // burada da temkinli, o yüzden pay kişiliğe bağlı.
  if (slotsLeft <= 2) {
    valuation = Math.max(valuation, affordable * (0.55 + persona.starHunter * 0.35));
  }

  // Deterministik kişisel sapma (±%7) — aynı çift için hep aynı
  valuation *= 0.93 + hash(`${bot.id}:${footballer.id}`) * 0.14;

  const cap = Math.min(Math.floor(valuation), affordable);
  return Math.max(0, cap);
}

/**
 * Botun bu tur vereceği teklif. Vermeyecekse null.
 */
export function decideBotBid(
  bot: Participant,
  footballer: Footballer,
  config: RoomConfig,
  pool: Footballer[],
  currentHighest: { playerId: string; amount: number } | null,
  floor: number,
): number | null {
  if (currentHighest?.playerId === bot.id) return null;

  const max = botMaxBid(bot, footballer, config, pool);
  if (max <= 0 || floor > max) return null;

  const persona = botPersona(bot.id);

  // Kararlı botlar caydırmak için üstüne biner, çekingenler tabanı verir.
  // Tavana yaklaştıkça herkes temkinli olur.
  const headroom = max - floor;
  const jumpRatio = persona.decisiveness * 0.35;
  const jump = Math.floor(headroom * jumpRatio * hash(`${bot.id}:${footballer.id}:${floor}`));

  return Math.min(floor + Math.max(0, jump), max);
}
