import type { MatchEvent, MatchResult, Team } from '@fal/shared';
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
   * Hem pozisyon payına hem de gole çevirme oranına uygulanır.
   *
   * Ölçüm (6000 maç/satır, saha avantajı kapalı, galibiyet/beraberlik/mağlubiyet):
   *
   *   güç farkı  0 →  %36.6 / %27.4 / %36.0   ort 2.69 gol
   *   güç farkı  3 →  %42.8 / %27.0 / %30.2   ort 2.75 gol
   *   güç farkı  8 →  %55.3 / %24.3 / %20.5   ort 2.82 gol
   *   güç farkı 20 →  %80.5 / %13.6 / %05.9   ort 3.41 gol
   *
   * Tekdüzelik kontrolü: 6000 maçta 47-56 farklı skor çıkıyor, en sık
   * skor bile yalnızca %12-13. Maçların ~%11'i geri dönüşle bitiyor.
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

/**
 * İki takım arasındaki futbol maçını dakika dakika simüle eder.
 *
 * Motorun mantığı (eski "her dakika bağımsız yazı-tura" yaklaşımının
 * aksine gerçek maç dinamiklerini taşır):
 *
 *  1. MAÇ GÜNÜ FORMU — her takım maça ±%12 bir formla çıkar. Aynı iki
 *     takım farklı maçlarda farklı senaryolar üretir.
 *  2. POZİSYON ÜRETİMİ — her dakika bir pozisyon doğabilir. Pozisyonun
 *     kime ait olduğu, takımın hücumunun rakip savunmasına oranıyla
 *     belirlenir (güçlü takım daha çok pozisyon bulur).
 *  3. POZİSYON KALİTESİ — her pozisyon eşit değildir; gole dönme oranı
 *     yine hücum/savunma oranına bağlıdır (güçlü takım daha net fırsat).
 *  4. MAÇ DURUMU — geride kalan takım öne çıkar (hücum +%12, savunma
 *     −%7); 2+ farkla önde olan oyunu yönetir. Geri dönüşler buradan
 *     doğar, skorlar tekdüze olmaz.
 *  5. TEMPO — son 20 dakikada pozisyon üretimi artar.
 *
 * Saf (pure) ve deterministiktir: aynı girdi + aynı seed → aynı sonuç.
 */
export function simulateMatch(options: SimulateMatchOptions): MatchResult {
  const {
    matchId,
    homeTeam,
    awayTeam,
    seed = stringToSeed(`${matchId}:${homeTeam.participantId}:${awayTeam.participantId}`),
    homeAdvantage = 1.05,
    chanceRate = 0.3,
    baseConversion = 0.088,
    strengthSensitivity = 1.6,
    isTournament = true,
  } = options;

  const prng = createPRNG(seed);
  const events: MatchEvent[] = [];

  let scoreHome = 0;
  let scoreAway = 0;

  // Sıfıra bölünmeyi önlemek için taban değerler
  const baseHomeAtt = Math.max(10, homeTeam.attack);
  const baseHomeDef = Math.max(10, homeTeam.defense);
  const baseAwayAtt = Math.max(10, awayTeam.attack);
  const baseAwayDef = Math.max(10, awayTeam.defense);

  // 1. MAÇ GÜNÜ FORMU
  const homeForm = FORM_MIN + prng() * FORM_SPREAD;
  const awayForm = FORM_MIN + prng() * FORM_SPREAD;

  for (let minute = 1; minute <= 90; minute++) {
    const diff = scoreHome - scoreAway;

    // 4. MAÇ DURUMU — geride kalan basar, önde olan yönetir
    let homeAttMod = 1;
    let homeDefMod = 1;
    let awayAttMod = 1;
    let awayDefMod = 1;

    if (diff < 0) {
      homeAttMod = CHASING_ATTACK;
      homeDefMod = CHASING_DEFENSE;
    } else if (diff >= 2) {
      homeAttMod = PROTECTING_ATTACK;
      homeDefMod = PROTECTING_DEFENSE;
    }
    if (diff > 0) {
      awayAttMod = CHASING_ATTACK;
      awayDefMod = CHASING_DEFENSE;
    } else if (diff <= -2) {
      awayAttMod = PROTECTING_ATTACK;
      awayDefMod = PROTECTING_DEFENSE;
    }

    const homeAtt = baseHomeAtt * homeForm * homeAdvantage * homeAttMod;
    const homeDef = baseHomeDef * homeForm * homeDefMod;
    const awayAtt = baseAwayAtt * awayForm * awayAttMod;
    const awayDef = baseAwayDef * awayForm * awayDefMod;

    // Tehdit oranları: benim hücumum rakibin savunmasına karşı
    const homeThreat = homeAtt / awayDef;
    const awayThreat = awayAtt / homeDef;

    // 5. TEMPO
    const tempo = minute > 70 ? LATE_TEMPO : 1;

    // 2. POZİSYON ÜRETİMİ
    if (prng() >= chanceRate * tempo) continue;

    // Pozisyon kime ait? Tehdit oranlarına göre paylaştır.
    const hw = homeThreat ** strengthSensitivity;
    const aw = awayThreat ** strengthSensitivity;
    const homeShare = hw / (hw + aw);
    const isHomeChance = prng() < homeShare;

    // 3. POZİSYON KALİTESİ — gole dönme oranı da güce bağlı
    const threat = isHomeChance ? homeThreat : awayThreat;
    const conversion = Math.min(0.55, baseConversion * threat ** strengthSensitivity);

    if (prng() < conversion) {
      if (isHomeChance) {
        scoreHome++;
        events.push({ minute, teamId: homeTeam.participantId, type: 'goal' });
      } else {
        scoreAway++;
        events.push({ minute, teamId: awayTeam.participantId, type: 'goal' });
      }
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
    // Seri penaltı atışları — savunma gücü kalecilik kalitesini yansıtır,
    // hafif bir avantaj sağlar ama belirleyici değildir (penaltı kumardır).
    const homeSkill = 0.74 + (baseHomeDef - baseAwayDef) * 0.0015;
    const awaySkill = 0.74 + (baseAwayDef - baseHomeDef) * 0.0015;

    let penH = 0;
    let penA = 0;
    for (let p = 0; p < 5; p++) {
      if (prng() < homeSkill) penH++;
      if (prng() < awaySkill) penA++;
    }
    while (penH === penA) {
      const hGoal = prng() < homeSkill;
      const aGoal = prng() < awaySkill;
      if (hGoal) penH++;
      if (aGoal) penA++;
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
