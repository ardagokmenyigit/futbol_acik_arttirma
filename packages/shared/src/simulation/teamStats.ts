import type { Footballer, Team } from '../types.js';
import { calculateTeamStats } from '../types.js';

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
