import type { Footballer, Team } from '@fal/shared';
import { calculateTeamStats } from '@fal/shared';

export {
  calculateTeamStats,
  ATTACK_WEIGHT,
  DEFENSE_WEIGHT,
  type CalculatedStats,
} from '@fal/shared';

/**
 * Katılımcı bilgilerinden Team nesnesi üretir.
 */
export function buildTeam(participant: {
  id: string;
  nickname: string;
  squad: Footballer[];
}): Team {
  const { attack, defense } = calculateTeamStats(participant.squad);
  return {
    participantId: participant.id,
    nickname: participant.nickname,
    players: participant.squad,
    attack,
    defense,
  };
}
