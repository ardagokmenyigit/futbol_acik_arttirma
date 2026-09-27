import type { Footballer, Participant, Position, RoomConfig } from '@fal/shared';
import { botSkill } from './botSkill.js';
import { positionCount } from './validateBid.js';

/**
 * Rakip bilgisi — YALNIZ açık bütçe modunda botların eline geçer
 * (`RoomConfig.hiddenBudgets === false`). Gizli modda `null` gelir ve bot
 * rakip bütçelerini hiç bilmez.
 */
export interface RivalView {
  budget: number;
  squad: Footballer[];
}

/**
 * Piyasanın toplamı: kadrosu eksik herkesin kalan bütçesi ve açık slotu.
 * Açık modda gerçek toplam; gizli modda tahmin (bkz. `marketOf`).
 */
export interface MarketView {
  budget: number;
  slots: number;
  /** Kadrosu hâlâ eksik katılımcı sayısı. */
  teams: number;
}

/** Botun bir karar anında gördüğü her şey. */
export interface BotView {
  /** Havuzda kalanlar — masadaki futbolcu HARİÇ. */
  pool: Footballer[];
  /** Açık modda bu turda teklif verebilecek rakipler; gizli modda `null`. */
  rivals: RivalView[] | null;
  market: MarketView;
}

/**
 * Botun gördüğü piyasa. Slot sayıları her iki modda da gerçektir (kadrolar
 * herkese açık).
 *
 * GİZLİ MODDA (`viewer` verilir) bot, insanın ekranda gördüğünden fazlasını
 * bilmez: yalnız kendi bütçesi. Rakiplerin parasını "slot başına benim
 * kadar" varsayar. Toplam, yayınlanan kazanan tekliflerden teorik olarak
 * türetilebilse de hiçbir insan draft boyunca bunu tutmaz — bota hazır
 * vermek gizli modda gerçek bir bilgi avantajı olurdu (kullanıcı kararı,
 * 27 Eylül 2026). Sonuç: gizli modda servet çarpanı 1'dir ve λ yalnız botun
 * kendi parasından türer.
 */
export function marketOf(
  participants: readonly { budget: number; squad: readonly Footballer[] }[],
  config: RoomConfig,
  viewer?: { budget: number; squad: readonly Footballer[] },
): MarketView {
  let budget = 0;
  let slots = 0;
  let teams = 0;
  for (const p of participants) {
    const open = config.squadSize - p.squad.length;
    if (open <= 0) continue;
    budget += Math.max(0, p.budget);
    slots += open;
    teams += 1;
  }
  if (viewer) {
    const myOpen = config.squadSize - viewer.squad.length;
    const perSlot = myOpen > 0 ? Math.max(0, viewer.budget) / myOpen : 0;
    budget = perSlot * slots;
  }
  return { budget, slots, teams };
}

/**
 * Bu mevkiye hâlâ ihtiyacı olan rakiplerin BU futbolcuya çıkabileceği en
 * yüksek teklif tahmini. Kimse ihtiyaç duymuyorsa 0.
 *
 * Rakip, kalan zorunlu slotları için kişi başı en az `minBidIncrement`
 * kenarda tutar diye varsayılır (temkinli tahmin — bot düşük teklif verip
 * kaçırmasın). Yani rakip neredeyse tüm parasını basabilir kabul edilir.
 */
function rivalCeiling(rivals: RivalView[], pos: Position, config: RoomConfig): number {
  let ceiling = 0;
  for (const r of rivals) {
    const posNeed = config.squad[pos] - r.squad.filter((f) => f.position === pos).length;
    if (posNeed <= 0) continue;
    if (r.squad.length >= config.squadSize) continue;
    const otherSlotsLeft = Math.max(0, config.squadSize - r.squad.length - 1);
    const reachable = Math.max(
      config.minBidIncrement,
      r.budget - otherSlotsLeft * config.minBidIncrement,
    );
    if (reachable > ceiling) ceiling = reachable;
  }
  return ceiling;
}

/**
 * ============================================================================
 *  BOT TEKLİF MOTORU — "bedava seviyenin üstü × paranın piyasa değeri"
 * ----------------------------------------------------------------------------
 *  Havuz her mevkide talebe TAM denktir (§3.1): herkes kadrosunu nasılsa
 *  doldurur ve kimsenin istemediği futbolcu sonunda asgariye kalır. Yani bir
 *  futbolcunun değeri GEN'i değil, o mevkide **bedavaya kalacak seviyenin
 *  üstünde kattığı güçtür** (artı değer = GEN − mevkide kalan en düşük GEN).
 *  Takım gücünde her mevkinin 1 GEN'i eşit (1/7) olduğu için bu fark doğrudan
 *  güç farkıdır.
 *
 *  Paranın değeri piyasadan okunur: masada kalan harcanabilir paranın
 *  tamamı, havuzda kalan toplam artı değere dağılacaktır (draft bitince para
 *  işe yaramaz). Buradan 1 artı-GEN puanının kaç M ettiği çıkar (λ).
 *
 *      tavan = asgari + λ × artıDeğer × servet × kişilik
 *
 *  Sonuçlar (insan sezgisiyle aynı):
 *   - 150M bütçede 81'lik bir oyuncu, havuzda 78'ler ve yıldızlar varken
 *     birkaç M eder — bot ona 20-30M basmaz, parayı yıldızlara saklar.
 *   - Biri parayı biriktirip bekliyorsa masadaki para artar, λ yükselir;
 *     botlar kalan yıldızlar için daha çok öder. "Bekle ve sonda yıldızları
 *     topla" sömürüsü böyle kapanır.
 *   - Servet: kalan slot başına parası piyasa ortalamasından fazla olan bot
 *     daha çok öder (elde kalan para boşa gider), az olan kısılır.
 *
 *  Değişmezler:
 *   1. İHTİYAÇ — mevki dolduysa teklif yok.
 *   2. SERT TABAN — kalan zorunlu slotlar için slot başı `minBidIncrement`
 *      kenarda kalır. Kadro yarım kalmaz.
 *   3. KARARLILIK — aynı (bot, futbolcu) çifti için tavan tur içinde oynamaz.
 *
 *  Eski model (yüzdelik dilim × adil pay) 81'liğe ~17M ödüyordu; parayı
 *  saklayan insan 4 takımlı oyunda %47 şampiyon oluyordu (adil pay %25).
 *  Ölçüm: `scripts/measureBotIQ.ts`, CLAUDE.md §3.1.
 * ============================================================================
 */

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];

/**
 * Artı değerin fiyata dönüşümündeki üs. 1 = doğrusal (her artı-GEN puanı
 * eşit fiyat). 1'in üstü yıldızı sıradana göre daha pahalı fiyatlar —
 * herkesin kovaladığı oyuncuda rekabet primi.
 */
const SURPLUS_EXP = 1.7;

/**
 * Oyuncu aynı mevkide kalanlardan bu kadar GEN kötüyse (ve havuzda seçenek
 * varsa) "sıcak patates" sayılır: kimse artırmaz, açan asgariden sıkışır.
 */
const PASS_MIN_GAP = 2;

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
  /** Piyasa fiyatının üstüne ne kadar çıkar (0.9 = pazarlıkçı, 1.2 = agresif). */
  aggression: number;
  /** Yıldız avcısı mı, bütçeyi yayan mı (0 = yayar, 1 = yıldıza yüklenir). */
  starHunter: number;
  /** Teklif adımı büyüklüğü — bazıları çekiştirir, bazıları resti görür. */
  decisiveness: number;
}

export function botPersona(botId: string): BotPersona {
  return {
    // Dar tutuldu: piyasanın çok üstüne çıkan bot, parayı saklayan insana
    // oyuncu değil bütçe hediye eder.
    aggression: 0.9 + hash(`${botId}#agg3`) * 0.3,
    starHunter: hash(`${botId}#star7`),
    decisiveness: hash(`${botId}#dec5`),
  };
}

/** Bot düşünme süresi — bitişe yakınsa daha çabuk davranır. */
export function botBidDelayMs(remainingMs: number): number {
  const base = 700 + Math.random() * 1800;
  if (remainingMs < 3000) return Math.min(base, 400 + Math.random() * 600);
  return base;
}

/* ------------------------------ piyasa okuma ------------------------------ */

/** Mevki başına "bedava seviye": havuzda (masadaki dahil) kalan en düşük GEN. */
function positionFloors(pool: Footballer[], current: Footballer): Record<Position, number> {
  const floors = { GK: Infinity, DEF: Infinity, MID: Infinity, FWD: Infinity };
  for (const f of [...pool, current]) floors[f.position] = Math.min(floors[f.position], f.overall);
  return floors;
}

function surplus(f: Footballer, floors: Record<Position, number>): number {
  return Math.max(0, f.overall - floors[f.position]);
}

/**
 * λ — 1 birim (üslü) artı değerin piyasadaki fiyatı. Masadaki harcanabilir
 * para (sert tabanlar düşülmüş) / havuzda kalan toplam artı değer.
 */
function pricePerSurplus(
  pool: Footballer[],
  current: Footballer,
  config: RoomConfig,
  market: MarketView,
): number {
  const floors = positionFloors(pool, current);
  let total = 0;
  for (const f of [...pool, current]) total += surplus(f, floors) ** SURPLUS_EXP;
  const spendable = Math.max(0, market.budget - market.slots * config.minBidIncrement);
  return total > 0 ? spendable / total : 0;
}

/** Kalan zorunlu slotlar (bu turda alınacak hariç) için sert taban. */
function hardReserve(bot: Participant, config: RoomConfig, pos: Position): number {
  let slots = 0;
  for (const p of POSITIONS) {
    let need = config.squad[p] - positionCount(bot, p);
    if (p === pos) need -= 1;
    if (need > 0) slots += need;
  }
  return slots * config.minBidIncrement;
}

/* ------------------------------ değerleme ------------------------------ */

/**
 * Botun bu futbolcu için ödemeye razı olduğu tavan fiyat.
 * 0 dönerse bot ilgilenmiyor demektir.
 *
 * Aynı (bot, futbolcu) çifti için tur içinde HER ZAMAN aynı değeri döndürür —
 * tavanın tur içinde oynamaması kritik (yoksa bot kendi kararıyla çelişir).
 * (Açık modda rakip tavanı, bir rakip pas deyip teklif hakkını kaybedince
 * düşebilir; bu bilinçli.)
 */
export function botMaxBid(
  bot: Participant,
  footballer: Footballer,
  config: RoomConfig,
  view: BotView,
): number {
  const pos = footballer.position;
  const min = config.minBidIncrement;

  // 1. İHTİYAÇ
  if (positionCount(bot, pos) >= config.squad[pos]) return 0;
  if (bot.squad.length >= config.squadSize) return 0;

  // 2. SERT TABAN
  const affordable = bot.budget - hardReserve(bot, config, pos);
  if (affordable < min) return 0;

  const persona = botPersona(bot.id);
  const slotsLeft = config.squadSize - bot.squad.length;
  const { pool, rivals, market } = view;

  // 3. PİYASA DEĞERİ — artı değer × 1 puanın fiyatı.
  const floors = positionFloors(pool, footballer);
  const s = surplus(footballer, floors);
  const lambda = pricePerSurplus(pool, footballer, config, market);

  // Servet: slot başına param piyasa ortalamasına göre ne durumda? Parası bol
  // olan daha çok öder (draft bitince para işe yaramaz), kıt olan kısılır.
  const myPerSlot = bot.budget / slotsLeft;
  const marketPerSlot = market.slots > 0 ? market.budget / market.slots : myPerSlot;
  const wealth = marketPerSlot > 0 ? myPerSlot / marketPerSlot : 1;

  // Kişilik: yıldız avcısı üst dilime biraz fazla, alt dilime biraz az öder.
  const bestAtPos = Math.max(
    footballer.overall,
    ...pool.filter((f) => f.position === pos).map((f) => f.overall),
  );
  const spread = Math.max(1, bestAtPos - floors[pos]);
  const tilt = 1 + (persona.starHunter - 0.5) * 0.4 * (2 * (s / spread) - 1);

  let valuation = min + lambda * s ** SURPLUS_EXP * wealth * persona.aggression * tilt;

  // ZORLUK — erken harcama hatası: kolay bot draft başında fazla öder, sonda
  // parasız kalır (eski botların zaafı; sabırlı insana alan açar).
  const skill = botSkill(config);
  if (skill.earlyOverpay > 0) {
    const totalSlots = config.squadSize * config.tournamentSize;
    const draftLeft = Math.min(1, market.slots / Math.max(1, totalSlots));
    valuation *= 1 + skill.earlyOverpay * draftLeft;
  }

  // SON SLOT — kalan para draft bitince boşa gider. Mevkideki en iyi aday
  // oranında elde kalanı basar (en iyisine hepsini, ortalamaya yarısını).
  if (slotsLeft === 1 && s > 0) {
    valuation = Math.max(valuation, affordable * (s / spread));
  }

  // AÇIK BÜTÇE — rakiplerin çıkabileceğinin bir tık üstü yeter.
  if (rivals) {
    const ceiling = rivalCeiling(rivals, pos, config);
    if (ceiling <= 0) {
      // Bu mevkiye kimse rakip değil — asgariye yakın kap, parayı sakla.
      valuation = Math.min(valuation, min * 2);
    } else {
      valuation = Math.min(valuation, ceiling + min);
    }
  }

  // Deterministik kişisel sapma — aynı çift için hep aynı. Genişliği zorluğa
  // bağlı (zor ±%7; kolaylaştıkça bot daha tutarsız fiyatlar).
  const noise = skill.noise;
  valuation *= 1 - noise + hash(`${bot.id}:${footballer.id}`) * 2 * noise;
  // Erken bırakma (kolay botlar): bazı futbolculardan vazgeçer.
  if (skill.underbid > 0)
    valuation *= 1 - skill.underbid * hash(`${bot.id}:${footballer.id}:under`);

  const cap = Math.min(Math.floor(valuation), affordable);
  return Math.max(0, cap);
}

/**
 * Botun bu turda vereceği teklif. Vermeyecekse null (sadece teklif vermez,
 * sonraki elde fikri değişebilir).
 *
 * `bidsLeft`: motorun bu tur için bota tanıdığı kalan teklif hakkı. Hak
 * bitmek üzereyse bot tavanını tek seferde söyler — aksi halde +1'lerle
 * çekiştiren insan botun haklarını tüketip futbolcuyu tavanın altında alırdı.
 */
export function decideBotBid(
  bot: Participant,
  footballer: Footballer,
  config: RoomConfig,
  view: BotView,
  currentHighest: { playerId: string; amount: number } | null,
  floor: number,
  bidsLeft = Infinity,
): number | null {
  if (currentHighest?.playerId === bot.id) return null;

  const max = botMaxBid(bot, footballer, config, view);
  if (max <= 0 || floor > max) return null;
  if (bidsLeft <= 2) return max;

  const persona = botPersona(bot.id);

  // Kararlı botlar caydırmak için üstüne biner, çekingenler tabanı verir.
  // Tavana yaklaştıkça herkes temkinli olur.
  const headroom = max - floor;
  const jumpRatio = persona.decisiveness * 0.35;
  const jump = Math.floor(headroom * jumpRatio * hash(`${bot.id}:${footballer.id}:${floor}`));

  return Math.min(floor + Math.max(0, jump), max);
}

/**
 * Bot açılış sırası gelince PAS geçsin mi? İnsanın pas kurnazlığı:
 *
 *  - Pas, istemediğin futbolcuda "sıcak patates"i başkasına atmaktır. Havuz
 *    denk olduğu için kimsenin artırmayacağı futbolcu açanın elinde asgariden
 *    kalır ve o mevkideki slotunu yer. Bot bunu, futbolcu mevkide kalanların
 *    alt diliminde VE onlardan belirgin (≥ PASS_MIN_GAP GEN) kötüyse yapar.
 *  - İstediğin futbolcuya asla pas deme: pas diyen o turda teklif de veremez.
 *  - Hak sonlu ve draft bitince yanar: kalan açılış sayısına göre hakkı
 *    çoksa eşik gevşer (harcanmadan bitmesin), azsa sıkılaşır (en kötüye sakla).
 *
 * Deterministik: aynı (bot, futbolcu) çifti hep aynı karar (tur içinde sıra
 * ona geri gelirse — herkes pas dediyse — yine tutarlı davranır).
 */
export function botShouldPass(
  bot: Participant,
  footballer: Footballer,
  config: RoomConfig,
  view: BotView,
): boolean {
  if (bot.passesLeft <= 0 || !botSkill(config).usesPasses) return false;
  const pos = footballer.position;
  const need = config.squad[pos] - positionCount(bot, pos);
  if (need <= 0) return false;

  // Pas geçince yerine gelecek adaylar (masadaki hariç).
  const samePos = view.pool.filter((f) => f.position === pos);
  if (samePos.length < need + 1) return false;

  const worse = samePos.filter((f) => f.overall < footballer.overall).length;
  const rank = worse / samePos.length; // 0 = en kötü, 1 = en iyi
  const sorted = samePos.map((f) => f.overall).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  if (median - footballer.overall < PASS_MIN_GAP) return false;

  // Hak baskısı: kalan açılışlarıma göre elimde ne kadar pas var?
  const { market } = view;
  const myOpeningsLeft = Math.max(1, market.slots / Math.max(1, market.teams));
  const pressure = Math.min(1, bot.passesLeft / myOpeningsLeft);

  const persona = botPersona(bot.id);
  const threshold = 0.2 + 0.25 * persona.starHunter + 0.3 * pressure;
  const noise = (hash(`${bot.id}:${footballer.id}:pass`) - 0.5) * 0.1;
  return rank < threshold + noise;
}

/**
 * Botun AÇILIŞ teklifi. Açılış zorunludur, bu yüzden `null` dönmez.
 *
 * Bot ilgilenmiyorsa asgari açılışı yapar (mecburiyet). İlgileniyorsa
 * kararlılığı oranında tavanının bir kısmından açar — yüksek açılış rakipleri
 * caydırma denemesidir, ama tavanın üstüne asla çıkmaz.
 */
export function botOpeningBid(
  bot: Participant,
  footballer: Footballer,
  config: RoomConfig,
  view: BotView,
): number {
  const min = config.minBidIncrement;
  const max = botMaxBid(bot, footballer, config, view);
  if (max <= min) return Math.max(min, Math.min(min, bot.budget));

  const persona = botPersona(bot.id);
  // Kararlı bot yüksekten açar (caydırma), temkinli bot tabandan yoklar.
  let share = 0.15 + persona.decisiveness * 0.4;
  // Açık bütçe modu: bu mevkiye rakip yoksa asgariden aç (parayı sakla);
  // güçlü rakip varsa daha yüksek aç (caydır).
  if (view.rivals) {
    const ceiling = rivalCeiling(view.rivals, footballer.position, config);
    if (ceiling <= 0) return Math.max(min, Math.min(min, bot.budget));
    if (ceiling >= max) share = Math.min(0.85, share + 0.25);
  }
  const noise = 0.85 + hash(`${bot.id}:${footballer.id}:open`) * 0.3;
  const opening = Math.floor(max * share * noise);
  return Math.max(min, Math.min(opening, max, bot.budget));
}
