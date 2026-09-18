import {
  PENALTY_DIRECTIONS,
  type Footballer,
  type PenaltyDirection,
  type PenaltyShootoutAttempt,
} from '@fal/shared';

/**
 * ============================================================================
 *  BOT PENALTI ZEKÂSI — "gerçek insan gibi"
 * ----------------------------------------------------------------------------
 *  Köşe oyunu simetrik olduğu için matematiksel denge "tamamen rastgele"dir;
 *  ama insanlar öyle oynamaz: favori köşeleri vardır, rakibin son iki
 *  hareketine bakıp "yine oraya gitmez" der, bazen de tam tersine blöf
 *  yapar. Botlar da öyle davranır ki insan rakip onları OKUYABİLSİN ve
 *  onlar tarafından OKUNABİLSİN — yani penaltı gerçekten bir zihin oyunu
 *  olsun. Uzun vadede hiçbir bot rastgeleden daha iyi ya da kötü değildir
 *  (simetri bozulmaz); yalnızca kısa vadeli, okunabilir alışkanlıkları vardır.
 *
 *  Karar dört katmandan oluşur:
 *   1. FAVORİ KÖŞE  — kişilik (id'den türer, oyun boyunca sabit).
 *   2. OKUMA        — rakibin bu serideki geçmişi (`predictNext`): dönüşüm
 *                     (sol-sağ-sol → sağ), seri (iki kez aynı → yine) ya da
 *                     favori köşe; kaleci oraya yatar / atıcı oradan kaçar.
 *   3. BLÖF         — okuma sonucunun bilinçli tersini yapma payı.
 *   4. GÜRÜLTÜ      — her şeye rağmen rastgelelik; kimse tam öngörülemez.
 *
 *  Ölçüm (scripts/measurePenalty.ts): rastgele oynayana karşı bot tam %50
 *  (simetri korunur); hep aynı köşeye ya da sol-sağ-sol sırayla oynayan
 *  "ezberci" insana karşı belirgin üstün. Önceki sürüm yalnız "son köşeye
 *  yat" diyordu ve dönüşümlü oynayana karşı %32'ye düşüyordu.
 *
 *  Kararlar seed'lidir (bot + maç + vuruş): aynı seri tekrar oynansa aynı
 *  kararlar çıkar (CLAUDE.md §3.2 determinizm). Gecikme (`botPenaltyDelayMs`)
 *  ise gerçek zamanlı akış için Math.random kullanır — sonucu etkilemez.
 * ============================================================================
 */

/** Stabil hash 0..1 — aynı girdi hep aynı sayı. */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export interface PenaltyPersona {
  /** Atıcı olarak favori köşe ve ona bağlılık (0.34 = rastgele, 0.6 = inatçı). */
  shotFavorite: PenaltyDirection;
  shotLoyalty: number;
  /** Kaleci olarak favori taraf ve bağlılık. */
  diveFavorite: PenaltyDirection;
  diveLoyalty: number;
  /** Rakibin geçmişini ne kadar okur (0 = hiç, 1 = tam). */
  reading: number;
  /** Okuma sonucunun tersini yapma eğilimi (blöf). */
  bluff: number;
  /** Düşünme süresi karakteri (0 = hızlı karar, 1 = son ana bırakır). */
  hesitation: number;
}

export function penaltyPersona(botId: string): PenaltyPersona {
  const pick = (salt: string): PenaltyDirection =>
    PENALTY_DIRECTIONS[Math.min(2, Math.floor(hash(`${botId}#${salt}`) * 3))]!;
  return {
    shotFavorite: pick('shotFav'),
    shotLoyalty: 0.38 + hash(`${botId}#shotLoy`) * 0.25,
    diveFavorite: pick('diveFav'),
    diveLoyalty: 0.36 + hash(`${botId}#diveLoy`) * 0.22,
    reading: 0.25 + hash(`${botId}#read`) * 0.6,
    bluff: 0.1 + hash(`${botId}#bluff`) * 0.3,
    hesitation: hash(`${botId}#hes`),
  };
}

type Weights = Record<PenaltyDirection, number>;

function baseWeights(favorite: PenaltyDirection, loyalty: number): Weights {
  const rest = (1 - loyalty) / 2;
  return {
    left: favorite === 'left' ? loyalty : rest,
    center: favorite === 'center' ? loyalty : rest,
    right: favorite === 'right' ? loyalty : rest,
  };
}

function sample(w: Weights, r: number): PenaltyDirection {
  const total = w.left + w.center + w.right;
  let x = r * total;
  for (const d of PENALTY_DIRECTIONS) {
    x -= w[d];
    if (x <= 0) return d;
  }
  return 'right';
}

/**
 * Rakibin köşe dizisinden SIRADAKİ köşeyi tahmin et — insanların fark ettiği
 * üç basit örüntü, güçlüden zayıfa:
 *  1. DÖNÜŞÜM  — son üç vuruş a-b-a gibi gidip geliyorsa sıradaki b
 *                 ("sol-sağ-sol… yine sağa gidecek").
 *  2. SERİ      — son iki vuruş aynı köşeyse yine oraya ("ısrar ediyor").
 *  3. FAVORİ    — ≥3 örnekte açık çoğunluk (≥%60) varsa o köşe.
 * Güven, okuma olasılığını ölçekler (persona.reading × confidence).
 */
function predictNext(dirs: readonly PenaltyDirection[]): {
  dir: PenaltyDirection;
  confidence: number;
} | null {
  const n = dirs.length;
  if (n >= 3) {
    const a = dirs[n - 3]!;
    const b = dirs[n - 2]!;
    const c = dirs[n - 1]!;
    if (a === c && a !== b) return { dir: b, confidence: 0.85 };
  }
  if (n >= 2 && dirs[n - 1] === dirs[n - 2]) return { dir: dirs[n - 1]!, confidence: 0.7 };
  if (n >= 3) {
    const count: Weights = { left: 0, center: 0, right: 0 };
    for (const d of dirs) count[d]++;
    const best = [...PENALTY_DIRECTIONS].sort((x, y) => count[y] - count[x])[0]!;
    if (count[best] >= Math.ceil(n * 0.6)) return { dir: best, confidence: 0.55 };
  }
  return null;
}

interface KickContext {
  botId: string;
  matchId: string;
  kickIndex: number;
  shooter: Footballer;
  keeper: Footballer;
  /** Bu serideki açıklanmış vuruşlar. */
  attempts: readonly PenaltyShootoutAttempt[];
  /** Botun takım id'si (geçmişte kendi vuruşlarını rakibinkinden ayırmak için). */
  botTeamId: string;
}

/**
 * ATICI kararı. Okuma: rakip kalecinin uzanış geçmişi. Kaleci üst üste aynı
 * tarafa yattıysa insan atıcı "yine oraya yatar" deyip başka köşe seçer;
 * blöf payıyla tam oraya vurur ("üçüncü kez yatmaz").
 */
export function botShotDirection(ctx: KickContext): PenaltyDirection {
  const persona = penaltyPersona(ctx.botId);
  const r = (salt: string) => hash(`${ctx.botId}|${ctx.matchId}|${ctx.kickIndex}|${salt}`);
  const w = baseWeights(persona.shotFavorite, persona.shotLoyalty);

  // Rakip kalecinin bu serideki uzanışları (benim takımımın vuruşlarında).
  const keeperDives = ctx.attempts
    .filter((a) => a.teamId === ctx.botTeamId)
    .map((a) => a.keeperDirection);
  const read = predictNext(keeperDives);
  if (read && r('read') < persona.reading * read.confidence) {
    if (r('bluff') < persona.bluff) {
      w[read.dir] *= 2.2; // blöf: "bu kez oraya yatmaz", tam oraya
    } else {
      w[read.dir] *= 0.2; // kaleci oraya yatacak, kaç
    }
  }

  // Zayıf atıcılar (DEF/GK) köşeyi tutturamama korkusuyla biraz daha ortaya eğilimli.
  if (ctx.shooter.position === 'DEF' || ctx.shooter.position === 'GK') w.center *= 1.3;

  // Kendi son vuruşumu tekrar etmekten hafifçe kaçın — insanlar çeşitlendirir.
  const myShots = ctx.attempts
    .filter((a) => a.teamId === ctx.botTeamId && a.playerId === ctx.shooter.id)
    .map((a) => a.shotDirection);
  const mine = myShots[myShots.length - 1];
  if (mine && r('vary') < 0.5) w[mine] *= 0.6;

  return sample(w, r('pick'));
}

/**
 * KALECİ kararı. Okuma: rakip takımın vuruş geçmişi — özellikle AYNI atıcı
 * daha önce attıysa onun köşesi, yoksa takımın eğilimi. İnsan kaleci gibi:
 * "bu adam hep sola vuruyor" → sola; blöf payıyla tersine.
 */
export function botKeeperDirection(ctx: KickContext): PenaltyDirection {
  const persona = penaltyPersona(ctx.botId);
  const r = (salt: string) => hash(`${ctx.botId}|${ctx.matchId}|${ctx.kickIndex}|k${salt}`);
  const w = baseWeights(persona.diveFavorite, persona.diveLoyalty);

  // Rakip takımın vuruş dizisi (karar veren insan aynı kişi — örüntü onundur);
  // aynı atıcı daha önce attıysa onun köşesi zayıf bir ek ipucu.
  const oppShots = ctx.attempts.filter((a) => a.teamId !== ctx.botTeamId);
  const teamShots = oppShots.map((a) => a.shotDirection);
  const sameShooter = oppShots
    .filter((a) => a.playerId === ctx.shooter.id)
    .map((a) => a.shotDirection);
  const last = sameShooter[sameShooter.length - 1];
  const read = predictNext(teamShots) ?? (last ? { dir: last, confidence: 0.4 } : null);
  if (read && r('read') < persona.reading * read.confidence) {
    if (r('bluff') < persona.bluff) {
      w[read.dir] *= 0.35; // "bu kez değiştirir" — başka tarafa
    } else {
      w[read.dir] *= 2.6; // örüntüsüne yat
    }
  }

  // Zayıf atıcıya karşı ortada kalmak insan kalecilerin bilinen refleksi.
  if (ctx.shooter.position === 'DEF' || ctx.shooter.position === 'GK') w.center *= 1.25;

  return sample(w, r('pick'));
}

/**
 * Botun karar süresi (ms). Kişiliğe göre 900–4200 ms; seriyi bitirebilecek
 * vuruşta ("baskı") biraz daha uzun düşünür. Deadline'a bağlı üst sınırla
 * kırpılır ki bot süreyi hiçbir zaman kaçırmasın. Gerçek zamanlı akış
 * içindir, sonucu etkilemez.
 */
export function botPenaltyDelayMs(botId: string, remainingMs: number, decisive = false): number {
  const persona = penaltyPersona(botId);
  const pressure = decisive ? 400 + persona.hesitation * 500 : 0;
  const base = 900 + persona.hesitation * 2300 + Math.random() * 1000 + pressure;
  return Math.max(300, Math.min(base, remainingMs - 700));
}
