import type {
  Footballer,
  MatchEvent,
  MatchResult,
  PenaltyShootoutAttempt,
  Position,
  Team,
} from '../types.js';
import { createPRNG, stringToSeed } from './random.js';

export interface SimulateMatchOptions {
  matchId: string;
  homeTeam: Team;
  awayTeam: Team;
  seed?: number;
  /**
   * Ev sahibi saha avantajı çarpanı (varsayılan: 1.0 — KAPALI).
   *
   * Eleme turnuvasında "ev sahibi" olmak tamamen keyfî bir ağaç koltuğudur,
   * oyuncunun kazandığı bir şey değil. Ölçüm: 1.05'lik avantaj maç başına
   * ~3 güç puanı değerindeydi — bir draft'taki ortalama en iyi/en kötü güç
   * farkının (~5.1) %60'ı kadar. Yani parayla kurulan üstünlüğün yarısını
   * bedavaya dağıtıyordu. Lig gibi çift devreli bir format geri gelirse
   * çağıran taraf açıkça 1.05 geçebilir.
   */
  homeAdvantage?: number;
  /** Dakika başına pozisyon (fırsat) üretme oranı. */
  chanceRate?: number;
  /**
   * Bir pozisyonun gole dönme taban oranı (varsayılan: 0.108).
   *
   * MAÇ BAŞINA GOL bu değere neredeyse doğrusal bağlı — heyecan kolu budur.
   * Hedef maç başı ~3.48 gol; `strengthSensitivity` ya da `FORM_SPREAD`
   * değişirse gol sayısı kayar ve bu değerle geri kalibre edilmelidir.
   * Sens 3.2 + form ±%4 için kalibre edilmiş karşılığı 0.108.
   *
   * Ölçüm (12.000 turnuva, gerçek bot draft'ları; sens 2.5 + form ±%12 iken):
   *
   *   0.084 → gol/maç 2.92   0-0 %7.2   penaltı %24.5
   *   0.100 → gol/maç 3.48   0-0 %4.4   penaltı %21.7   (+%19)
   *   0.112 → gol/maç 3.90   0-0 %3.1   penaltı %20.1
   *
   * Güç ayrımına DOKUNMUYOR: 0.084'te de 0.100'de de en güçlü takım
   * ~%38 şampiyon, oran ~2.6x. Yalnız gol sıklığını ölçekler; daha çok
   * gol istenirse tek başına bu değer artırılır (0.55'te sert tavan var).
   */
  baseConversion?: number;
  /**
   * Takım gücü farkının sonuca ne kadar yansıyacağı (varsayılan: 3.2).
   * Hem pozisyon payına hem de gole çevirme oranına uygulanır.
   *
   * ⚠️ TEK BAŞINA ZAYIF BİR KOL. Yükseltmek gol sayısını da şişirdiği için
   * `baseConversion` ile geri dengelemek gerekir, bu da etkinin çoğunu geri
   * alır. Gol ortalaması 3.48'e sabitlenerek ölçüldüğünde (25k maç, 5 puan
   * güç farkında güçlü takımın turu geçme oranı):
   *
   *   sens 2.5 (baseConv 0.105) → %68.3
   *   sens 3.2 (baseConv 0.098) → %70.1
   *   sens 4.0 (baseConv 0.090) → %71.1
   *
   * Yani 2.5'ten 4.0'a çıkmak yalnızca ~3 puan kazandırıyor. Duyarlılığı
   * artırmanın asıl kolu `FORM_SPREAD` (bkz. oradaki not) — ikisi birlikte
   * ayarlanmalı. Şu anki çift: sens 3.2 + form ±%4 → 5 puan farkta %76.8.
   *
   * ⚠️ ASIL TAVAN MOTOR DEĞİL, DRAFT. Gerçek draft'larda takımlar arası güç
   * farkı ortalama sadece ~5.2 puan (ölçüm: 3000 gerçek bot draft'ı; medyan
   * 5.0, p90 8.0). Havuz tam denk olduğu için herkes benzer kalitede kadro
   * kuruyor. Gücü gerçekten baskın kılmak isteyen motoru değil DRAFT'ı
   * (havuz genişliği / bot değerleme dağılımı) değiştirmeli.
   *
   * Tekdüzelik kontrolü: 60k maçta 84 farklı skor, en sık skor (1-1) %10.8.
   */
  strengthSensitivity?: number;
  /** Turnuva eleme maçı mı? Beraberlikte penaltı atışlarına gider. */
  isTournament?: boolean;
}

/* ------------------------------ ayarlar ------------------------------ */

/**
 * Maç günü formu — aynı takım her maç aynı oynamasın diye (±%4).
 *
 * NEDEN BU KADAR DAR — bu, motordaki EN BÜYÜK rastgelelik kaynağı ve doğrudan
 * güç duyarlılığıyla yarışır. Gerçek draft'larda takımlar arası tipik güç farkı
 * ~5 puan, yani oransal olarak yalnızca ~%6.6. Form ±%12 iken güç farkının
 * neredeyse iki katı gürültü enjekte ediyor ve iyi kadro kurmayı gölgeliyordu.
 *
 * Ölçüm (gol ortalaması her satırda 3.48'e sabitlenerek, 5 puan güç farkında
 * güçlü takımın turu geçme oranı):
 *   form ±%12, sens 2.5 → %68.2   (eski)
 *   form ±%8,  sens 3.2 → %73.4
 *   form ±%4,  sens 3.2 → %76.8   (şu anki)
 *
 * ⚠️ BURADAN DAHA DARA İNMEYİN. ±%4 zaten bilinçli olarak kabul edilmiş bir
 * ödünleşmedir: skor çeşitliliği ±%8'e kıyasla düşer ve aynı iki takım her
 * karşılaşmada birbirine benzer maçlar üretmeye başlar. Ayrıca denk takımlar
 * denk kaldığı için beraberlik — dolayısıyla seri penaltı — sıklığı artar.
 * Daha da daraltmak maçları tekdüzeleştirir.
 */
const FORM_SPREAD = 0.08;
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
 * Penaltı atma yeteneği. `attack` DEĞİL `overall` tabanlıdır: penaltı, akan
 * oyundaki hücum gücünden çok oyuncunun genel kalitesi + soğukkanlılığıdır.
 * Mevki yalnızca ayar payı verir.
 *
 * Eski model doğrudan `attack` kullanıyordu; kaleci (attack ~29) atışa
 * kalkınca mantık bozuluyordu. `overall` havuzda 78–91 aralığında olduğu
 * için ayrım artık kadro kalitesinden geliyor.
 */
const PENALTY_POSITION_BONUS: Record<Position, number> = {
  FWD: 4,
  MID: 1,
  DEF: -3,
  GK: -7,
};

function penaltySkill(p: Footballer): number {
  return p.overall + PENALTY_POSITION_BONUS[p.position];
}

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
 *
 * Motorun mantığı (eski "her dakika bağımsız yazı-tura" yaklaşımının
 * aksine gerçek maç dinamiklerini taşır):
 *
 *  1. MAÇ GÜNÜ FORMU — her takım maça ±%4 bir formla çıkar. Aynı iki
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
    homeAdvantage = 1.0,
    chanceRate = 0.3,
    baseConversion = 0.108,
    strengthSensitivity = 3.2,
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
        const scorer = pickScorer(homeTeam, prng);
        events.push({
          minute,
          teamId: homeTeam.participantId,
          type: 'goal',
          playerId: scorer?.id,
          playerName: scorer?.name ?? `${homeTeam.nickname} Forveti`,
        });
      } else {
        scoreAway++;
        const scorer = pickScorer(awayTeam, prng);
        events.push({
          minute,
          teamId: awayTeam.participantId,
          type: 'goal',
          playerId: scorer?.id,
          playerName: scorer?.name ?? `${awayTeam.nickname} Forveti`,
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
    // Seri penaltı atışları — en iyi penaltıcıdan başlayarak sıralanır.
    const homeShooters = [...(homeTeam.players ?? [])].sort(
      (a, b) => penaltySkill(b) - penaltySkill(a),
    );
    const awayShooters = [...(awayTeam.players ?? [])].sort(
      (a, b) => penaltySkill(b) - penaltySkill(a),
    );

    // Kadro tükenince başa dönülür: 7 kişilik kadroda 8. atışı yine 1. atıcı
    // kullanır (gerçek futbol kuralı — herkes bir kez atmadan kimse iki kez atmaz).
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

    const calcSuccessRate = (shooterSkill: number, oppGkDef: number) => {
      const rate = 0.715 + (shooterSkill - 82) * 0.007 - (oppGkDef - 82) * 0.006;
      return Math.min(0.93, Math.max(0.45, rate));
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
      const hScored = prng() < calcSuccessRate(penaltySkill(hShooter), awayGkDef);
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
      const aScored = prng() < calcSuccessRate(penaltySkill(aShooter), homeGkDef);
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
      const hScored = prng() < calcSuccessRate(penaltySkill(hShooter), awayGkDef);
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
      const aScored = prng() < calcSuccessRate(penaltySkill(aShooter), homeGkDef);
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
