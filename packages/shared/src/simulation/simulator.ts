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
   * Bir pozisyonun gole dönme taban oranı (varsayılan: 0.111).
   *
   * MAÇ BAŞINA GOL bu değere neredeyse doğrusal bağlı — heyecan kolu budur.
   * Hedef maç başı ~3.5 gol; `strengthSensitivity`, `FORM_SPREAD` ya da
   * TAKIM GÜCÜ AĞIRLIKLARI (`POSITION_POWER_WEIGHT`) değişirse gol sayısı kayar ve
   * bu değerle geri kalibre edilmelidir. Sens 3.2 + form ±%4 için 0.108'di;
   * MID rol ağırlığı hücum ölçeğini yükselttiği için 0.099'a çekilmişti.
   * GEN tabanlı güç modelinde takım hücumu ile savunması aynı ölçekte
   * (ort. 84.6 / 84.7; eski modelde 78.3 / 75.6, yani hücum %3.6 öndeydi ve
   * tehdit oranı^3.2 ile ~%12 fazla gol üretiyordu). Gol/maç 3.66 → 3.27'ye
   * düştüğü için 0.111'e çıkarıldı: 5000 bot draft × 4 bracket ölçümünde
   * 3.68 gol/maç, 0-0 %3.8, penaltı %26.
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
  /**
   * Turnuva eleme maçı mı? 90 dakika berabere biterse önce 30 dakika UZATMA
   * oynanır, hâlâ eşitse seri penaltı.
   *
   * NEDEN UZATMA (17 Eylül 2026): 90 dakikada beraberlik oranı ~%26 — gerçek
   * futbolla (~%25) uyumlu, düşürülmesi gereken bir şey değil. Sorun
   * beraberliğin doğrudan penaltıya, yani yazı-turaya gitmesiydi: penaltıda
   * güçlü takım 1–4 puan farkta yalnız %51–56 kazanıyor. `baseConversion`
   * ile bastırmak pahalı (3.7 → 6.0 gol/maç ancak %26 → %19.5 beraberlik;
   * eşit λ'lı Poisson'da eşitlik olasılığı çok yavaş düşer). Uzatma güce
   * duyarlı 30 dakika daha verir: 5 puan farkta uzatmada biten maçların
   * %72'sini güçlü alır (penaltıda %60). Ölçüm (5000 bot draft × 4 bracket):
   * penaltıya giden maç %26 → %11.5, en güçlü şampiyon %45.5 → %47.3,
   * normal süre gol/maç 3.68 sabit (uzatma golleriyle 4.04).
   */
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

/** Normal süre ve uzatma uzunluğu (dakika). */
export const REGULAR_TIME_MINUTES = 90;
export const EXTRA_TIME_MINUTES = 30;

/**
 * Penaltı atma yeteneği — GEN eksi MEVKİ CEZASI.
 *
 * Atıcı sırası da gol ihtimali de bu sayıdan türer; forvetler önce, kaleci
 * en son atar. Eski model `0.7·HÜC + 0.3·GEN` idi; oyuncu başına HÜC alanı
 * kalkınca (bkz. `POSITION_POWER_WEIGHT`) aynı ölçek mevki ofsetiyle korundu:
 * cezalar, eski beceri ile GEN arasındaki mevki ortalaması farkıdır (veri
 * seti ölçümü: FWD −0.3, MID −3.0, DEF −25.9, GK −37.1). Böylece
 * `calcSuccessRate`in merkezi (74) ve eğimi (0.0035) değişmedi.
 *
 * Ölçek: ilk 5 atıcının becerisi ort. ~76, sd ~10; ortalama gol oranı ~%72,
 * mevkiler arası fark FWD ~%74, MID ~%73, DEF ~%65, GK ~%61.
 */
const PENALTY_POSITION_PENALTY: Record<Position, number> = {
  FWD: 0,
  MID: 3,
  DEF: 26,
  GK: 37,
};
const PENALTY_SKILL_CENTER = 74;
const PENALTY_SKILL_SLOPE = 0.0035;

function penaltySkill(p: Footballer): number {
  return p.overall - PENALTY_POSITION_PENALTY[p.position];
}

/**
 * Golcü seçimi — mevki ağırlığı × GEN. Ağırlıklar eski `mevki × HÜC/20`
 * modelinin fiili oranlarını korur (FWD : MID : DEF : GK ≈ 25 : 11 : 1.6 : 0.08);
 * HÜC alanı kalktığı için mevki farkı doğrudan ağırlığa taşındı.
 */
const SCORER_POSITION_WEIGHT: Record<Position, number> = {
  FWD: 6.0,
  MID: 2.7,
  DEF: 0.4,
  GK: 0.02,
};

function pickScorer(team: Team, prng: () => number): Footballer | undefined {
  if (!team.players || team.players.length === 0) return undefined;

  const weights = team.players.map(
    (p) => SCORER_POSITION_WEIGHT[p.position] * Math.max(1, p.overall / 20),
  );

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
 *  6. UZATMA — turnuva maçı 90'da berabereyse aynı döngü 120'ye kadar sürer
 *     (tempo çarpanı 70+ kuralıyla zaten 1.18); hâlâ eşitse seri penaltı.
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
    baseConversion = 0.111,
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

  let extraTime = false;
  const lastMinute = REGULAR_TIME_MINUTES + EXTRA_TIME_MINUTES;

  for (let minute = 1; minute <= lastMinute; minute++) {
    // 6. UZATMA — normal süre bitti: turnuva maçı ve beraberlik yoksa maç biter
    if (minute === REGULAR_TIME_MINUTES + 1) {
      if (!isTournament || scoreHome !== scoreAway) break;
      extraTime = true;
    }
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
    const tempo = minute > 70 ? LATE_TEMPO : 1; // uzatmada da yüksek tempo sürer

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
    // Uzatma da berabere: seri penaltı atışları — iyiden kötüye.
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
        overall: 80,
      };
    };

    const homeGk = homeTeam.players?.find((p) => p.position === 'GK');
    const awayGk = awayTeam.players?.find((p) => p.position === 'GK');
    // Kalecinin penaltı kurtarma gücü = GEN'i (veri setinde GK SAV ≈ GEN idi).
    const homeGkDef = homeGk?.overall ?? baseHomeDef;
    const awayGkDef = awayGk?.overall ?? baseAwayDef;

    const calcSuccessRate = (shooterSkill: number, oppGkDef: number) => {
      const rate =
        0.715 +
        (shooterSkill - PENALTY_SKILL_CENTER) * PENALTY_SKILL_SLOPE -
        (oppGkDef - 82) * 0.006;
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
    ...(extraTime ? { extraTime } : {}),
    penaltiesHome,
    penaltiesAway,
    winnerId,
    penaltyShootout,
  };
}
