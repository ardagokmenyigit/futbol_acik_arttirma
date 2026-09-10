import type {
  Footballer,
  MatchEvent,
  MatchResult,
  PenaltyShootoutAttempt,
  Team,
} from '../types.js';
import { createPRNG, stringToSeed } from './random.js';

export interface SimulateMatchOptions {
  matchId: string;
  homeTeam: Team;
  awayTeam: Team;
  seed?: number;
  /** Ev sahibi saha avantajı çarpanı (varsayılan: 1.05) */
  homeAdvantage?: number;
  /** Dakika başına pozisyon (fırsat) üretme oranı. */
  chanceRate?: number;
  /** Bir pozisyonun gole dönme taban oranı. */
  baseConversion?: number;
  /**
   * Takım gücü farkının sonuca ne kadar yansıyacağı (varsayılan: 1.6).
   */
  strengthSensitivity?: number;
  /** Turnuva eleme maçı mı? Beraberlikte penaltı atışlarına gider. */
  isTournament?: boolean;
}

/* ------------------------------ ayarlar ------------------------------ */

/** Maç günü formu — aynı takım her maç aynı oynamasın diye (±%12). */
const FORM_SPREAD = 0.24;
const FORM_MIN = 1 - FORM_SPREAD / 2;

/** Geride kalan takım öne çıkar: hücumu artar, arkası açılır. */
const CHASING_ATTACK = 1.12;
const CHASING_DEFENSE = 0.93;

/** 2+ farkla önde olan takım oyunu yönetir. */
const PROTECTING_ATTACK = 0.94;
const PROTECTING_DEFENSE = 1.06;

/** Son 20 dakikada tempo artar (yorgunluk + risk alma). */
const LATE_TEMPO = 1.18;

function pickScorer(team: Team, prng: () => number): Footballer | undefined {
  if (!team.players || team.players.length === 0) return undefined;

  const weights = team.players.map((p) => {
    let posWeight = 1.0;
    if (p.position === 'FWD') posWeight = 6.0;
    else if (p.position === 'MID') posWeight = 2.8;
    else if (p.position === 'DEF') posWeight = 0.7;
    else if (p.position === 'GK') posWeight = 0.05;

    const attMult = Math.max(1, p.attack / 20);
    return posWeight * attMult;
  });

  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight <= 0) {
    return team.players[Math.floor(prng() * team.players.length)];
  }

  let r = prng() * totalWeight;
  for (let i = 0; i < team.players.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return team.players[i];
  }
  return team.players[team.players.length - 1];
}

/**
 * İki takım arasındaki futbol maçını dakika dakika simüle eder.
 */
export function simulateMatch(options: SimulateMatchOptions): MatchResult {
  const {
    matchId,
    homeTeam,
    awayTeam,
    seed = stringToSeed(matchId),
    homeAdvantage = 1.05,
    chanceRate = 0.078,
    baseConversion = 0.21,
    strengthSensitivity = 1.6,
    isTournament = false,
  } = options;

  const prng = createPRNG(seed);

  const homeForm = FORM_MIN + prng() * FORM_SPREAD;
  const awayForm = FORM_MIN + prng() * FORM_SPREAD;

  const baseHomeAtt = Math.max(1, homeTeam.attack * homeAdvantage * homeForm);
  const baseHomeDef = Math.max(1, homeTeam.defense * homeAdvantage * homeForm);
  const baseAwayAtt = Math.max(1, awayTeam.attack * awayForm);
  const baseAwayDef = Math.max(1, awayTeam.defense * awayForm);

  let scoreHome = 0;
  let scoreAway = 0;
  const events: MatchEvent[] = [];

  for (let minute = 1; minute <= 90; minute++) {
    const diff = scoreHome - scoreAway;
    let homeAttMult = 1.0;
    let homeDefMult = 1.0;
    let awayAttMult = 1.0;
    let awayDefMult = 1.0;

    if (diff < 0) {
      homeAttMult = CHASING_ATTACK;
      homeDefMult = CHASING_DEFENSE;
      if (diff <= -2) {
        awayAttMult = PROTECTING_ATTACK;
        awayDefMult = PROTECTING_DEFENSE;
      }
    } else if (diff > 0) {
      awayAttMult = CHASING_ATTACK;
      awayDefMult = CHASING_DEFENSE;
      if (diff >= 2) {
        homeAttMult = PROTECTING_ATTACK;
        homeDefMult = PROTECTING_DEFENSE;
      }
    }

    const homeAtt = baseHomeAtt * homeAttMult;
    const homeDef = baseHomeDef * homeDefMult;
    const awayAtt = baseAwayAtt * awayAttMult;
    const awayDef = baseAwayDef * awayDefMult;

    const tempo = minute > 70 ? LATE_TEMPO : 1.0;
    const minuteChanceRate = Math.min(0.25, chanceRate * tempo);

    if (prng() >= minuteChanceRate) {
      continue;
    }

    const homeThreat = Math.pow(homeAtt / awayDef, strengthSensitivity);
    const awayThreat = Math.pow(awayAtt / homeDef, strengthSensitivity);
    const totalThreat = homeThreat + awayThreat;

    const isHomeChance = prng() < homeThreat / totalThreat;

    const [att, oppDef, team] = isHomeChance
      ? [homeAtt, awayDef, homeTeam]
      : [awayAtt, homeDef, awayTeam];

    const conversionMult = Math.pow(att / oppDef, strengthSensitivity * 0.5);
    const conversionProb = Math.min(0.65, Math.max(0.06, baseConversion * conversionMult));

    if (prng() < conversionProb) {
      const scorer = pickScorer(team, prng);

      if (isHomeChance) {
        scoreHome++;
        events.push({
          minute,
          type: 'goal',
          teamId: homeTeam.participantId,
          playerId: scorer?.id,
          playerName: scorer?.name,
        });
      } else {
        scoreAway++;
        events.push({
          minute,
          type: 'goal',
          teamId: awayTeam.participantId,
          playerId: scorer?.id,
          playerName: scorer?.name,
        });
      }
    }
  }

  let penaltiesHome: number | undefined;
  let penaltiesAway: number | undefined;
  let winnerId: string | undefined;
  let penaltyShootout: PenaltyShootoutAttempt[] | undefined;

  if (scoreHome > scoreAway) {
    winnerId = homeTeam.participantId;
  } else if (scoreAway > scoreHome) {
    winnerId = awayTeam.participantId;
  } else if (isTournament) {
    // Seri penaltı atışları — oyuncular hücum gücüne göre büyükten küçüğe sıralanır.
    const homeShooters = [...(homeTeam.players ?? [])].sort((a, b) => b.attack - a.attack);
    const awayShooters = [...(awayTeam.players ?? [])].sort((a, b) => b.attack - a.attack);

    const getShooter = (shooters: Footballer[], team: Team, kickIdx: number): Footballer => {
      if (shooters.length > 0) {
        return shooters[kickIdx % shooters.length]!;
      }
      return {
        id: `gen-${team.participantId}-${kickIdx}`,
        name: `${team.nickname} Oyuncusu ${kickIdx + 1}`,
        position: 'FWD',
        attack: team.attack,
        defense: team.defense,
        overall: 80,
      };
    };

    const homeGk = homeTeam.players?.find((p) => p.position === 'GK');
    const awayGk = awayTeam.players?.find((p) => p.position === 'GK');
    const homeGkDef = homeGk?.defense ?? baseHomeDef;
    const awayGkDef = awayGk?.defense ?? baseAwayDef;

    const calcSuccessRate = (shooterAtt: number, oppGkDef: number) => {
      const rate = 0.74 + (shooterAtt - 80) * 0.0025 - (oppGkDef - 80) * 0.002;
      return Math.min(0.92, Math.max(0.52, rate));
    };

    let penH = 0;
    let penA = 0;
    const shootout: PenaltyShootoutAttempt[] = [];

    // İlk 5 atış (klasik seri)
    let homeKicks = 0;
    let awayKicks = 0;

    for (let round = 1; round <= 5; round++) {
      // 1. Ev Sahibi atışı
      const hShooter = getShooter(homeShooters, homeTeam, homeKicks);
      const hScored = prng() < calcSuccessRate(hShooter.attack, awayGkDef);
      if (hScored) penH++;
      homeKicks++;
      shootout.push({
        round,
        teamId: homeTeam.participantId,
        playerId: hShooter.id,
        playerName: hShooter.name,
        scored: hScored,
        scoreHomeAfter: penH,
        scoreAwayAfter: penA,
      });

      // Matematiksel kontrol (Ev sahibi attıktan sonra)
      const aRemainingAfterHome = 5 - awayKicks;
      const hRemainingAfterHome = 5 - homeKicks;
      if (penH > penA + aRemainingAfterHome || penA > penH + hRemainingAfterHome) {
        break;
      }

      // 2. Deplasman atışı
      const aShooter = getShooter(awayShooters, awayTeam, awayKicks);
      const aScored = prng() < calcSuccessRate(aShooter.attack, homeGkDef);
      if (aScored) penA++;
      awayKicks++;
      shootout.push({
        round,
        teamId: awayTeam.participantId,
        playerId: aShooter.id,
        playerName: aShooter.name,
        scored: aScored,
        scoreHomeAfter: penH,
        scoreAwayAfter: penA,
      });

      // Matematiksel kontrol (Deplasman attıktan sonra)
      const aRemainingAfterAway = 5 - awayKicks;
      const hRemainingAfterAway = 5 - homeKicks;
      if (penH > penA + aRemainingAfterAway || penA > penH + hRemainingAfterAway) {
        break;
      }
    }

    // 5 atış bittiğinde ve eşitlik varsa ani ölüm (sudden death)
    let suddenDeathRound = 6;
    while (penH === penA && suddenDeathRound <= 25) {
      // Ev sahibi
      const hShooter = getShooter(homeShooters, homeTeam, homeKicks);
      const hScored = prng() < calcSuccessRate(hShooter.attack, awayGkDef);
      if (hScored) penH++;
      homeKicks++;
      shootout.push({
        round: suddenDeathRound,
        teamId: homeTeam.participantId,
        playerId: hShooter.id,
        playerName: hShooter.name,
        scored: hScored,
        scoreHomeAfter: penH,
        scoreAwayAfter: penA,
      });

      // Deplasman
      const aShooter = getShooter(awayShooters, awayTeam, awayKicks);
      const aScored = prng() < calcSuccessRate(aShooter.attack, homeGkDef);
      if (aScored) penA++;
      awayKicks++;
      shootout.push({
        round: suddenDeathRound,
        teamId: awayTeam.participantId,
        playerId: aShooter.id,
        playerName: aShooter.name,
        scored: aScored,
        scoreHomeAfter: penH,
        scoreAwayAfter: penA,
      });

      if (penH !== penA) break;
      suddenDeathRound++;
    }

    penaltiesHome = penH;
    penaltiesAway = penA;
    winnerId = penH > penA ? homeTeam.participantId : awayTeam.participantId;
    penaltyShootout = shootout;
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
    penaltyShootout,
  };
}
