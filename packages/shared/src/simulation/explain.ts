import type { MatchResult, Team } from '../types.js';
import { FORM_SPREAD } from './simulator.js';

/**
 * MAÇ GEREKÇESİ — "neden bu sonuç çıktı?" sorusunun cevabı.
 *
 * Güçlü takım maçların ~%35'inde turu geçemiyor (sürprizlerde ortalama güç
 * farkı yalnızca 1.65). Oyuncu yalnız skoru görünce bunu "oyun rastgele"
 * diye okuyor. Gerçek futbolda da favori kaybeder ama herkes bir sebep
 * bilir; bu modül o sebebi verir.
 *
 * KURAL: gerekçe UYDURULMAZ. Her kod motorun o maçta gerçekten ürettiği bir
 * şeyden çıkar (pozisyon payı, pozisyonların gole dönme olasılığı = xG, maç
 * günü formu, skor akışı, uzatma/seri). Motorda olmayan bir şey (kırmızı
 * kart, sakatlık) yazılırsa oyuncu tutarsızlığı yakalar ve güven daha çok
 * sarsılır.
 *
 * Ölçüm (18 Ekim 2026, 1500 bot draft'ı × 6 maç): sürprizlerin %99.2'sinde
 * aşağıdaki kodlardan en az biri devrede. Sık olanlar: form farkı gücü
 * tersine çevirdi %52, favori gerideyken açıldı %51, favori pozisyon
 * harcadı %46, rakip erken öne geçti %40, rakip fırsatçıydı %39.
 *
 * Sunucu hesaplar ve `MatchResult.explanation` olarak gönderir; istemciler
 * (web + Flutter) yalnız koddan metin üretir — hesap tek yerde kalır.
 */

export type MatchVerdict = 'expected' | 'upset' | 'even';

export type MatchReasonCode =
  | 'penalties'
  | 'extraTime'
  | 'wasteful'
  | 'clinical'
  | 'dominated'
  | 'form'
  | 'comeback'
  | 'earlyGoal'
  | 'openedUp'
  | 'lateWinner'
  | 'powerShowed'
  | 'tight';

/**
 * Tek bir gerekçe. `teamId` cümlenin öznesidir; sayılar koda göre dolar:
 * - wasteful / clinical: `xg`, `goals` (öznenin)
 * - dominated / tight: `chances`, `oppChances`
 * - powerShowed: `xg`, `oppXg`
 * - form: `form`, `oppForm` — yüzde sapma (+3 = %3 formda)
 * - earlyGoal / lateWinner: `minute`
 * - openedUp: `goals` (geriyken yenen gol sayısı)
 */
export interface MatchReason {
  code: MatchReasonCode;
  teamId: string;
  xg?: number;
  oppXg?: number;
  goals?: number;
  chances?: number;
  oppChances?: number;
  form?: number;
  oppForm?: number;
  minute?: number;
}

export interface MatchExplanation {
  verdict: MatchVerdict;
  /** Kağıt üstünde güçlü olan; denk maçta da daha güçlü olan (fark < 0.5). */
  favoriteId: string;
  /** Favorinin güç üstünlüğü (0.1 hassasiyet). */
  powerGap: number;
  /** En belirgin 1–2 gerekçe, önem sırasıyla. */
  reasons: MatchReason[];
}

/** Bu farkın altında kadrolar "denk" sayılır. */
const EVEN_GAP = 0.5;
/**
 * Gerekçe olarak anılacak en küçük form farkı: form aralığının %37.5'i
 * (±%4'te 0.03, ±%2'de 0.015). Sabit sayı olsaydı form daralınca hiç tutmazdı.
 */
const FORM_GAP = FORM_SPREAD * 0.375;
/** Gerekçe olarak anılacak en küçük gol − xG sapması. */
const FINISHING_GAP = 1;

const r1 = (v: number) => Math.round(v * 10) / 10;
const pct = (form: number) => Math.round((form - 1) * 100);

export function explainMatch(result: MatchResult, home: Team, away: Team): MatchExplanation | null {
  const stats = result.stats;
  if (!stats || !result.winnerId) return null;

  const power = (t: Team) => (t.attack + t.defense) / 2;
  const homeIsFav = power(home) >= power(away);
  const fav = homeIsFav ? home : away;
  const gap = r1(Math.abs(power(home) - power(away)));

  const winnerIsHome = result.winnerId === home.participantId;
  const W = winnerIsHome ? home : away;
  const L = winnerIsHome ? away : home;
  const ws = winnerIsHome ? stats.home : stats.away;
  const ls = winnerIsHome ? stats.away : stats.home;
  const goalsOf = (id: string) => result.events.filter((e) => e.teamId === id).length;
  const wGoals = goalsOf(W.participantId);
  const lGoals = goalsOf(L.participantId);

  const verdict: MatchVerdict =
    gap < EVEN_GAP ? 'even' : W.participantId === fav.participantId ? 'expected' : 'upset';

  const scored: { score: number; reason: MatchReason }[] = [];
  const add = (score: number, reason: MatchReason) => scored.push({ score, reason });

  // Skor akışı: kim ne zaman öndeydi.
  const events = [...result.events].sort((a, b) => a.minute - b.minute);
  let w = 0;
  let l = 0;
  let winnerTrailed = false;
  let loserConcededTrailing = 0;
  for (const e of events) {
    const byWinner = e.teamId === W.participantId;
    // Kazanan zaten öndeyken attı: kaybeden gerideyken bir gol daha yedi.
    if (byWinner && w > l) loserConcededTrailing++;
    if (byWinner) w++;
    else l++;
    if (w < l) winnerTrailed = true;
  }

  const penalties = result.penaltiesHome != null && result.penaltiesAway != null;
  if (penalties) add(10, { code: 'penalties', teamId: W.participantId });
  else if (result.extraTime) add(3, { code: 'extraTime', teamId: W.participantId });

  // Bitiricilik: kaybeden harcadı / kazanan az pozisyonu değerlendirdi.
  if (lGoals <= ls.xg - FINISHING_GAP) {
    add(1 + ls.xg - lGoals, {
      code: 'wasteful',
      teamId: L.participantId,
      xg: r1(ls.xg),
      goals: lGoals,
    });
  }
  if (wGoals >= ws.xg + FINISHING_GAP) {
    add(1 + wGoals - ws.xg, {
      code: 'clinical',
      teamId: W.participantId,
      xg: r1(ws.xg),
      goals: wGoals,
    });
  }

  // Kaybeden oyunu domine etti ama skora yansıtamadı.
  if (ls.chances >= ws.chances + 3 && ls.chances >= ws.chances * 1.4) {
    add(2 + (ls.chances - ws.chances) / 4, {
      code: 'dominated',
      teamId: L.participantId,
      chances: ls.chances,
      oppChances: ws.chances,
    });
  }

  // Form: yalnız kazanan daha formdaysa anılır; gücü tersine çevirdiyse daha önemli.
  const formGap = ws.form - ls.form;
  if (formGap >= FORM_GAP) {
    const flipped = power(W) < power(L) && power(W) * ws.form > power(L) * ls.form;
    add((formGap / FORM_SPREAD) * 4.8 + (flipped ? 2 : 0), {
      code: 'form',
      teamId: W.participantId,
      form: pct(ws.form),
      oppForm: pct(ls.form),
    });
  }

  if (winnerTrailed) add(3, { code: 'comeback', teamId: W.participantId });

  const first = events[0];
  if (first && first.teamId === W.participantId && first.minute <= 20) {
    add(1.5, { code: 'earlyGoal', teamId: W.participantId, minute: first.minute });
  }

  if (loserConcededTrailing >= 1 && wGoals >= 2) {
    add(1.5 + loserConcededTrailing * 0.5, {
      code: 'openedUp',
      teamId: L.participantId,
      goals: loserConcededTrailing,
    });
  }

  // Belirleyici gol 80+ (normal sürede ya da uzatmada), fark 1.
  const last = events[events.length - 1];
  if (
    !penalties &&
    last &&
    last.teamId === W.participantId &&
    last.minute >= 80 &&
    wGoals - lGoals === 1
  ) {
    add(2.5, { code: 'lateWinner', teamId: W.participantId, minute: last.minute });
  }

  // Favori net üstünlükle kazandıysa asıl hikâye budur — diğerlerinin önüne geçer.
  if (verdict === 'expected' && ws.xg >= ls.xg * 1.5 && ws.xg - ls.xg >= 0.8) {
    add(3.5, { code: 'powerShowed', teamId: W.participantId, xg: r1(ws.xg), oppXg: r1(ls.xg) });
  }

  scored.sort((a, b) => b.score - a.score);
  const reasons = scored.slice(0, 2).map((s) => s.reason);
  if (reasons.length === 0) {
    reasons.push({
      code: 'tight',
      teamId: W.participantId,
      chances: ws.chances,
      oppChances: ls.chances,
    });
  }

  return { verdict, favoriteId: fav.participantId, powerGap: gap, reasons };
}
