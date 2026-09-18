import type {
  Footballer,
  PenaltyDirection,
  PenaltyOutcome,
  PenaltyShootoutAttempt,
  Position,
} from '../types.js';
import { PENALTY_DIRECTIONS } from '../types.js';

/**
 * ============================================================================
 *  SERİ PENALTI — KÖŞE OYUNU
 * ----------------------------------------------------------------------------
 *  Atıcı ve kaleci eş zamanlı olarak SOL / ORTA / SAĞ seçer. Vuruş iki
 *  bağımsız zara ayrılır:
 *
 *   1. İSABET — yalnız atıcıya bağlı (`missProbability`). Kalecinin seçimiyle
 *      ilgisi yok: dışarı giden top kaleciye bakmaz.
 *   2. KURTARIŞ — yalnız kaleci DOĞRU köşeyi seçtiyse devreye girer
 *      (`saveProbability`): kaleci GEN'i yukarı, atıcı becerisi aşağı çeker.
 *
 *   farklı köşe → gol (1 − p_kaçırma) | dışarı (p_kaçırma)
 *   aynı köşe   → gol (1 − p_kaçırma)(1 − p_kurtarma) | kurtarış | dışarı
 *
 *  Üç seçenek SİMETRİKTİR: denge stratejisi rastgele dağıtmaktır, kimse formülü
 *  ezberleyerek avantaj alamaz; tek avantaj rakibin alışkanlığını okumaktır.
 *  Rastgele seçimde beklenen gol oranı eski tek zarlı modelle örtüşür
 *  (kaleci GEN 82'ye karşı FWD 84 %73, MID 85 %72, DEF 83 %64, GK 82 %60;
 *  eski model %73 / %73 / %65 / %61), yani bot–bot maçların dengesi değişmez.
 *
 *  Kalecinin etkisi "her vuruşta biraz" değil "köşeyi bildiğinde çok":
 *  GEN 90 kaleci doğru köşede FWD'ye karşı %80, DEF'e karşı %92 kurtarır.
 *
 *  Sudden death dahil seri akışı `ShootoutProgress` ile saf tutulur; hem
 *  simülatör (bot–bot, anında) hem sunucunun canlı motoru (insanlı, vuruş
 *  vuruş) aynı fonksiyonları kullanır.
 * ============================================================================
 */

/* ------------------------------- beceri ------------------------------- */

/**
 * Penaltı atma becerisi — GEN eksi MEVKİ CEZASI. Atıcı sırası buna göre
 * (forvetler önce, kaleci en son). Cezalar, eski `0.7·HÜC + 0.3·GEN`
 * becerisinin GEN'den mevki ortalaması sapmasıdır (veri seti ölçümü).
 */
export const PENALTY_POSITION_PENALTY: Record<Position, number> = {
  FWD: 0,
  MID: 3,
  DEF: 26,
  GK: 37,
};

export function penaltySkill(p: Footballer): number {
  return p.overall - PENALTY_POSITION_PENALTY[p.position];
}

/** Vuruşun dışarı / direğe gitme olasılığı — yalnız atıcı. FWD 90 %2, DEF 83 %12, GK 82 %16. */
export function missProbability(shooter: Footballer): number {
  const p = 0.05 + 0.003 * (80 - penaltySkill(shooter));
  return Math.min(0.25, Math.max(0.02, p));
}

/**
 * Kaleci DOĞRU köşeyi seçtiyse isabetli vuruşu kurtarma olasılığı.
 * Kaleci GEN 82 / atıcı FWD 84 → %72; GEN 90 → %82; DEF atıcıya karşı %83–92.
 */
export function saveProbability(keeper: Footballer, shooter: Footballer): number {
  const p = 0.76 + 0.012 * (keeper.overall - 82) - 0.004 * (penaltySkill(shooter) - 74);
  return Math.min(0.92, Math.max(0.35, p));
}

/** Atıcılar iyiden kötüye; kadro tükenince başa dönülür (herkes bir kez atmadan kimse iki kez atmaz). */
export function orderShooters(players: readonly Footballer[]): Footballer[] {
  return [...players].sort((a, b) => penaltySkill(b) - penaltySkill(a));
}

/** Kaleci: kadrodaki GK; yoksa GEN'i en yüksek oyuncu (eksik kadro güvenliği). */
export function pickKeeper(players: readonly Footballer[]): Footballer | undefined {
  return (
    players.find((p) => p.position === 'GK') ??
    [...players].sort((a, b) => b.overall - a.overall)[0]
  );
}

/* ------------------------------- tek vuruş ------------------------------- */

/**
 * Tek vuruşu çözer. `rand` 0–1 arası iki değer üretebilmeli (isabet, kurtarış).
 * Saf ve deterministik: aynı girdiler + aynı zar dizisi → aynı sonuç.
 */
export function resolveKick(
  shooter: Footballer,
  keeper: Footballer,
  shotDirection: PenaltyDirection,
  keeperDirection: PenaltyDirection,
  rand: () => number,
): PenaltyOutcome {
  if (rand() < missProbability(shooter)) return 'missed';
  if (shotDirection !== keeperDirection) return 'goal';
  return rand() < saveProbability(keeper, shooter) ? 'saved' : 'goal';
}

/** Rastgele köşe — bot–bot simülasyonu ve tarafsız varsayılan. */
export function randomDirection(rand: () => number): PenaltyDirection {
  return PENALTY_DIRECTIONS[Math.min(2, Math.floor(rand() * 3))]!;
}

/* ------------------------------- seri akışı ------------------------------- */

/** Klasik seri: 5'er atış; sonra ani ölüm. Güvenlik tavanı — pratikte ulaşılmaz. */
export const SHOOTOUT_REGULAR_ROUNDS = 5;
export const SHOOTOUT_MAX_ROUNDS = 30;

/**
 * CANLI SERİ ZAMANLAMASI (sunucu motoru + istemci geri sayımı aynı sabitleri
 * kullanır). Köşe seçimi 5 sn — kısa ama refleks oyunu; iki taraf da seçince
 * beklemeden çözülür. Açılış 3.4 sn: dalış/top animasyonu (~0.6 sn) + sonucu
 * okuma payı. 10 vuruşluk seri ≈ 60–80 sn.
 */
export const SHOOTOUT_CHOOSE_MS = 5000;
export const SHOOTOUT_REVEAL_MS = 3400;

/** Serinin saf durumu — vuruş vuruş ilerletilir. */
export interface ShootoutProgress {
  homeId: string;
  awayId: string;
  penaltiesHome: number;
  penaltiesAway: number;
  homeKicks: number;
  awayKicks: number;
  attempts: PenaltyShootoutAttempt[];
  /** Karar verildiyse kazanan; yoksa null. */
  winnerId: string | null;
}

export function createShootout(homeId: string, awayId: string): ShootoutProgress {
  return {
    homeId,
    awayId,
    penaltiesHome: 0,
    penaltiesAway: 0,
    homeKicks: 0,
    awayKicks: 0,
    attempts: [],
    winnerId: null,
  };
}

/** Sıradaki vuruş kimin? Ev sahibi başlar, sırayla; `kickIndex` takım içi sıra. */
export function nextKick(progress: ShootoutProgress): {
  teamId: string;
  isHome: boolean;
  round: number;
  teamKickIndex: number;
} {
  const isHome = progress.homeKicks === progress.awayKicks;
  const teamKickIndex = isHome ? progress.homeKicks : progress.awayKicks;
  return {
    teamId: isHome ? progress.homeId : progress.awayId,
    isHome,
    round: teamKickIndex + 1,
    teamKickIndex,
  };
}

/**
 * Seri bitti mi? Klasik 5 atışta matematiksel kesinlik erken bitirir
 * (bir taraf kalan atışlarla yetişemiyorsa); ani ölümde her çift atıştan
 * sonra fark varsa biter.
 */
function decideWinner(p: ShootoutProgress): string | null {
  const { penaltiesHome: h, penaltiesAway: a, homeKicks: hk, awayKicks: ak } = p;
  if (hk <= SHOOTOUT_REGULAR_ROUNDS && ak <= SHOOTOUT_REGULAR_ROUNDS) {
    const hRemaining = SHOOTOUT_REGULAR_ROUNDS - hk;
    const aRemaining = SHOOTOUT_REGULAR_ROUNDS - ak;
    if (h > a + aRemaining) return p.homeId;
    if (a > h + hRemaining) return p.awayId;
    if (hk === SHOOTOUT_REGULAR_ROUNDS && ak === SHOOTOUT_REGULAR_ROUNDS && h !== a) {
      return h > a ? p.homeId : p.awayId;
    }
    return null;
  }
  // Ani ölüm: iki taraf da eşit sayıda attıysa ve fark varsa biter.
  if (hk === ak && h !== a) return h > a ? p.homeId : p.awayId;
  // Güvenlik tavanı: 30 turda hâlâ eşitse son atan kaybetmiş sayılır (pratikte ulaşılmaz).
  if (hk >= SHOOTOUT_MAX_ROUNDS && ak >= SHOOTOUT_MAX_ROUNDS) return p.awayId;
  return null;
}

/** Bir vuruşun sonucunu seriye işler; yeni (değişmez) durum döner. */
export function applyKick(
  progress: ShootoutProgress,
  kick: {
    shooter: Footballer;
    keeper: Footballer;
    shotDirection: PenaltyDirection;
    keeperDirection: PenaltyDirection;
    outcome: PenaltyOutcome;
  },
): ShootoutProgress {
  const { teamId, isHome, round } = nextKick(progress);
  const scored = kick.outcome === 'goal';
  const penaltiesHome = progress.penaltiesHome + (isHome && scored ? 1 : 0);
  const penaltiesAway = progress.penaltiesAway + (!isHome && scored ? 1 : 0);
  const attempt: PenaltyShootoutAttempt = {
    round,
    teamId,
    playerId: kick.shooter.id,
    playerName: kick.shooter.name,
    keeperId: kick.keeper.id,
    keeperName: kick.keeper.name,
    scored,
    shotDirection: kick.shotDirection,
    keeperDirection: kick.keeperDirection,
    outcome: kick.outcome,
    scoreHomeAfter: penaltiesHome,
    scoreAwayAfter: penaltiesAway,
  };
  const next: ShootoutProgress = {
    ...progress,
    penaltiesHome,
    penaltiesAway,
    homeKicks: progress.homeKicks + (isHome ? 1 : 0),
    awayKicks: progress.awayKicks + (isHome ? 0 : 1),
    attempts: [...progress.attempts, attempt],
    winnerId: null,
  };
  next.winnerId = decideWinner(next);
  return next;
}

/** Eksik kadroda üretilen yedek atıcı/kaleci (motor asla kilitlenmesin). */
export function fallbackFootballer(teamId: string, nickname: string, idx: number): Footballer {
  return {
    id: `gen-${teamId}-${idx}`,
    name: `${nickname} Oyuncusu ${idx + 1}`,
    position: 'FWD',
    overall: 80,
  };
}

/**
 * Seriyi baştan sona anında oynatır — bot–bot maçları ve testler için.
 * Köşeler `chooseDirections` ile (varsayılan: rastgele) seçilir; her vuruş
 * `resolveKick` ile çözülür.
 */
export function simulateShootout(
  home: { id: string; nickname: string; players: readonly Footballer[] },
  away: { id: string; nickname: string; players: readonly Footballer[] },
  rand: () => number,
  chooseDirections: (
    ctx: { shooter: Footballer; keeper: Footballer; progress: ShootoutProgress; isHome: boolean },
    rand: () => number,
  ) => { shot: PenaltyDirection; keeper: PenaltyDirection } = (_ctx, r) => ({
    shot: randomDirection(r),
    keeper: randomDirection(r),
  }),
): ShootoutProgress {
  const homeShooters = orderShooters(home.players);
  const awayShooters = orderShooters(away.players);
  const homeKeeper = pickKeeper(home.players) ?? fallbackFootballer(home.id, home.nickname, 99);
  const awayKeeper = pickKeeper(away.players) ?? fallbackFootballer(away.id, away.nickname, 99);

  let progress = createShootout(home.id, away.id);
  while (!progress.winnerId) {
    const { isHome, teamKickIndex } = nextKick(progress);
    const shooters = isHome ? homeShooters : awayShooters;
    const team = isHome ? home : away;
    const shooter =
      shooters.length > 0
        ? shooters[teamKickIndex % shooters.length]!
        : fallbackFootballer(team.id, team.nickname, teamKickIndex);
    const keeper = isHome ? awayKeeper : homeKeeper;
    const dirs = chooseDirections({ shooter, keeper, progress, isHome }, rand);
    const outcome = resolveKick(shooter, keeper, dirs.shot, dirs.keeper, rand);
    progress = applyKick(progress, {
      shooter,
      keeper,
      shotDirection: dirs.shot,
      keeperDirection: dirs.keeper,
      outcome,
    });
  }
  return progress;
}
