import type { MatchEvent, MatchResult, Team } from '@fal/shared';
import { createPRNG, stringToSeed } from './random.js';

export interface SimulateMatchOptions {
  matchId: string;
  homeTeam: Team;
  awayTeam: Team;
  seed?: number;
  /** Ev sahibi saha avantajı çarpanı (varsayılan: 1.05) */
  homeAdvantage?: number;
  /** Dakika başına taban gol olasılığı (varsayılan: 0.0148) */
  baseGoalRate?: number;
  /** Turnuva eleme maçı mı? Beraberlikte penaltı atışlarına gider. */
  isTournament?: boolean;
  /**
   * Takım gücü farkının sonuca ne kadar yansıyacağı (varsayılan: 2.6).
   * Gol olasılığı `(hücum/savunma) ** bu üs` ile ölçeklenir.
   *
   * 1.0 (eski davranış) ile fark neredeyse hiç yansımıyordu — 20 puan
   * üstün takım bile sadece %55.8 kazanıyordu, yani draft anlamsızdı.
   * 2.6'da ölçüm (4000 maç/satır, saha avantajı kapalı):
   *
   *   (galibiyet / beraberlik / mağlubiyet)
   *   fark  0 →  %36.9 / %25.7 / %37.5   denk takımlar
   *   fark  3 →  %44.4 / %24.7 / %30.9   küçük üstünlük hissediliyor
   *   fark  8 →  %55.2 / %23.3 / %21.5   net favori
   *   fark 20 →  %80.7 / %12.1 / %07.2   ezici ama sürpriz hâlâ mümkün
   */
  strengthSensitivity?: number;
}

/**
 * İki takım arasındaki futbol maçını 90 dakika boyunca dakika dakika simüle eder.
 * Saf (pure) fonksiyondur: Aynı girdiler ve aynı seed ile her zaman aynı sonucu üretir.
 * Turnuva maçlarında eşitlik bozulmazsa deterministik seri penaltı atışları uygulanır.
 */
export function simulateMatch(options: SimulateMatchOptions): MatchResult {
  const {
    matchId,
    homeTeam,
    awayTeam,
    seed = stringToSeed(`${matchId}:${homeTeam.participantId}:${awayTeam.participantId}`),
    homeAdvantage = 1.05,
    baseGoalRate = 0.0148,
    isTournament = true,
    strengthSensitivity = 2.6,
  } = options;

  const prng = createPRNG(seed);
  const events: MatchEvent[] = [];

  let scoreHome = 0;
  let scoreAway = 0;

  // Hücum ve savunma oranları (sıfıra bölünmeyi önlemek için min 10)
  const homeAtt = Math.max(10, homeTeam.attack);
  const homeDef = Math.max(10, homeTeam.defense);
  const awayAtt = Math.max(10, awayTeam.attack);
  const awayDef = Math.max(10, awayTeam.defense);

  // 1'den 90'a kadar her dakika simülasyonu
  for (let minute = 1; minute <= 90; minute++) {
    const fatigueFactor = minute > 75 ? 1.15 : 1.0;

    // --- Ev Sahibi Gol Olasılığı ---
    const homeAttackRatio = (homeAtt / awayDef) ** strengthSensitivity * homeAdvantage;
    const homeGoalProb = baseGoalRate * homeAttackRatio * fatigueFactor;

    if (prng() < homeGoalProb) {
      scoreHome++;
      events.push({
        minute,
        teamId: homeTeam.participantId,
        type: 'goal',
      });
      continue;
    }

    // --- Deplasman Gol Olasılığı ---
    const awayAttackRatio = (awayAtt / homeDef) ** strengthSensitivity;
    const awayGoalProb = baseGoalRate * awayAttackRatio * fatigueFactor;

    if (prng() < awayGoalProb) {
      scoreAway++;
      events.push({
        minute,
        teamId: awayTeam.participantId,
        type: 'goal',
      });
    }
  }

  let penaltiesHome: number | undefined;
  let penaltiesAway: number | undefined;
  let winnerId: string | undefined;

  if (scoreHome > scoreAway) {
    winnerId = homeTeam.participantId;
  } else if (scoreAway > scoreHome) {
    winnerId = awayTeam.participantId;
  } else if (isTournament) {
    // Seri penaltı atışları
    let penH = 0;
    let penA = 0;

    // İlk 5'er penaltı
    for (let p = 0; p < 5; p++) {
      if (prng() < 0.76) penH++;
      if (prng() < 0.76) penA++;
    }

    // Eşitlik sürerse altın penaltı (ani ölüm)
    while (penH === penA) {
      const hGoal = prng() < 0.75;
      const aGoal = prng() < 0.75;
      if (hGoal) penH++;
      if (aGoal) penA++;
      // Biri atar diğeri kaçırırsa döngü sonlanır
      if (penH !== penA) break;
    }

    penaltiesHome = penH;
    penaltiesAway = penA;
    winnerId = penH > penA ? homeTeam.participantId : awayTeam.participantId;
  }

  return {
    matchId,
    homeId: homeTeam.participantId,
    awayId: awayTeam.participantId,
    scoreHome,
    scoreAway,
    events,
    penaltiesHome,
    penaltiesAway,
    winnerId,
  };
}
