import { POSITION_POWER_WEIGHT, type Position, type TournamentRound } from '@fal/shared';
import type { Dict } from './tr.js';

/** Reytingin aktığı eksen (shared `powerRoleLabel`in dile bağlı karşılığı). */
export function roleLabel(position: Position, t: Dict): string {
  const w = POSITION_POWER_WEIGHT[position];
  if (w.attack > 0 && w.defense > 0) return t.common.roleBoth;
  return w.attack > 0 ? t.common.att : t.common.def;
}

/** Tur başlığı sunucudan Türkçe gelir (herkese aynı durum); koddan çevrilir. */
export function roundTitle(round: Pick<TournamentRound, 'name' | 'title'>, t: Dict): string {
  return t.tournament.rounds[round.name as keyof Dict['tournament']['rounds']] ?? round.title;
}

/** Ağaçtaki yer tutucular: "Takım 3", "Yarı Final 1 Kazananı" (tournamentEngine.ts). */
export function placeholderLabel(ph: string | undefined, t: Dict): string | undefined {
  if (!ph) return ph;
  const team = /^Takım (\d+)$/.exec(ph);
  if (team) return t.tournament.placeholderTeam(team[1]!);
  const winner = /^(Çeyrek|Yarı) Final (\d+) Kazananı$/.exec(ph);
  if (winner)
    return t.tournament.placeholderWinner(winner[1] === 'Çeyrek' ? 'quarter' : 'semi', winner[2]!);
  return ph;
}
