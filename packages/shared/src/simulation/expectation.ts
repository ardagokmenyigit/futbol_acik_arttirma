import type { Team } from '../types.js';
import { simulateMatch } from './simulator.js';

/**
 * MAÇ BEKLENTİSİ — iki kadro için motorun ne öngördüğü: beklenen gol (90 dk),
 * güçlünün kazanma / beraberlik / kaybetme olasılığı. Motorun kendisi
 * `n` farklı tohumla koşturulur (kapalı formül yok: form, baskı/yönetme ve
 * tempo döngü içinde). n=300 ≈ 10 ms; maç logu ve ileride maç sonu kartı için.
 * Saf ve deterministik (tohumlar 1..n).
 */
export interface MatchExpectation {
  homeGoals: number;
  awayGoals: number;
  /** 90 dakika sonunda ev kazanır / berabere / deplasman kazanır. */
  homeWin: number;
  draw: number;
  awayWin: number;
  /** Turnuva kuralıyla (uzatma + penaltı) ev sahibinin turu geçme olasılığı. */
  homeAdvances: number;
}

export function expectMatch(homeTeam: Team, awayTeam: Team, n = 300): MatchExpectation {
  let hg = 0;
  let ag = 0;
  let hw = 0;
  let d = 0;
  let adv = 0;
  for (let i = 1; i <= n; i++) {
    const r = simulateMatch({
      matchId: 'xg',
      homeTeam,
      awayTeam,
      seed: i * 7919,
      isTournament: true,
    });
    const h90 = r.events.filter(
      (e) => e.type === 'goal' && e.minute <= 90 && e.teamId === homeTeam.participantId,
    ).length;
    const a90 = r.events.filter(
      (e) => e.type === 'goal' && e.minute <= 90 && e.teamId === awayTeam.participantId,
    ).length;
    hg += h90;
    ag += a90;
    if (h90 > a90) hw++;
    else if (h90 === a90) d++;
    if (r.winnerId === homeTeam.participantId) adv++;
  }
  return {
    homeGoals: hg / n,
    awayGoals: ag / n,
    homeWin: hw / n,
    draw: d / n,
    awayWin: (n - hw - d) / n,
    homeAdvances: adv / n,
  };
}
