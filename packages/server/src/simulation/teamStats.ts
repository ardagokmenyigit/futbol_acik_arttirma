import type { Footballer, Team } from '@fal/shared';

export interface CalculatedStats {
  attack: number;
  defense: number;
}

/**
 * Bir takımın kadrosundaki futbolculara göre takımın toplam hücum ve savunma gücünü hesaplar.
 * İdeal 11 mantığı:
 * - 1 En iyi Kaleci (GK)
 * - 4 En iyi Defans (DEF)
 * - 4 En iyi Orta Saha (MID)
 * - 2 En iyi Forvet (FWD)
 *
 * Hücum katkısı: Forvetler (%45) + Orta Sahalar (%35) + Defanslar (%15) + Kaleci (%5) + Takım Hızı bonusu
 * Savunma katkısı: Kaleci (%25) + Defanslar (%45) + Orta Sahalar (%25) + Forvetler (%5) + Kondisyon bonusu
 */
export function calculateTeamStats(players: Footballer[]): CalculatedStats {
  if (!players || players.length === 0) {
    return { attack: 50, defense: 50 };
  }

  const gks = players.filter((p) => p.position === 'GK').sort((a, b) => b.overall - a.overall);
  const defs = players.filter((p) => p.position === 'DEF').sort((a, b) => b.overall - a.overall);
  const mids = players.filter((p) => p.position === 'MID').sort((a, b) => b.overall - a.overall);
  const fwds = players.filter((p) => p.position === 'FWD').sort((a, b) => b.overall - a.overall);

  // En iyi 11 oyuncuyu seç
  const topGk = gks.slice(0, 1);
  const topDefs = defs.slice(0, 4);
  const topMids = mids.slice(0, 4);
  const topFwds = fwds.slice(0, 2);

  const avgStat = (list: Footballer[], key: 'attack' | 'defense' | 'pace' | 'stamina') => {
    if (list.length === 0) return 50;
    const sum = list.reduce((acc, p) => acc + p[key], 0);
    return sum / list.length;
  };

  const gkDef = avgStat(topGk, 'defense');
  const defDef = avgStat(topDefs, 'defense');
  const midDef = avgStat(topMids, 'defense');
  const fwdDef = avgStat(topFwds, 'defense');

  const gkAtt = avgStat(topGk, 'attack');
  const defAtt = avgStat(topDefs, 'attack');
  const midAtt = avgStat(topMids, 'attack');
  const fwdAtt = avgStat(topFwds, 'attack');

  const avgPace = avgStat([...topDefs, ...topMids, ...topFwds], 'pace');
  const avgStamina = avgStat([...topDefs, ...topMids, ...topFwds], 'stamina');

  // Hücum hesabı (Ağırlıklı + Hız çarpanı)
  const rawAttack = fwdAtt * 0.45 + midAtt * 0.35 + defAtt * 0.15 + gkAtt * 0.05;
  const attack = Math.round(rawAttack * 0.9 + avgPace * 0.1);

  // Savunma hesabı (Ağırlıklı + Kondisyon çarpanı)
  const rawDefense = defDef * 0.45 + gkDef * 0.25 + midDef * 0.25 + fwdDef * 0.05;
  const defense = Math.round(rawDefense * 0.9 + avgStamina * 0.1);

  return {
    attack: Math.max(20, Math.min(99, attack)),
    defense: Math.max(20, Math.min(99, defense))
  };
}

/**
 * Katılımcı bilgilerinden Team nesnesi üretir.
 */
export function buildTeam(participant: { id: string; nickname: string; squad: Footballer[] }): Team {
  const { attack, defense } = calculateTeamStats(participant.squad);
  return {
    participantId: participant.id,
    nickname: participant.nickname,
    players: participant.squad,
    attack,
    defense
  };
}
