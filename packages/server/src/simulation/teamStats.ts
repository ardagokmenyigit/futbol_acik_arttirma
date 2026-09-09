import type { Footballer, Position, Team } from '@fal/shared';

export interface CalculatedStats {
  attack: number;
  defense: number;
}

/**
 * Pozisyon çarpanları — bir futbolcunun hangi reytinginin hangi ağırlıkla
 * takım gücüne katıldığı.
 *
 *   Pozisyon | hücum reytingi | defans reytingi
 *   ---------|----------------|----------------
 *   FWD      |      1.0       |      0.2
 *   MID      |      0.6       |      0.6
 *   DEF      |      0.2       |      1.0
 *   GK       |      0.1       |      1.1
 *
 * Yani forvetin hücum reytingi tam sayılır, defansı az; kaleci savunmaya
 * en çok katkıyı yapar (1.1), hücuma neredeyse hiç (0.1); orta saha iki
 * tarafa da dengeli (0.6 / 0.6) katkı verir.
 */
export const ATTACK_WEIGHT: Record<Position, number> = {
  FWD: 1.0,
  MID: 0.6,
  DEF: 0.2,
  GK: 0.1,
};

export const DEFENSE_WEIGHT: Record<Position, number> = {
  FWD: 0.2,
  MID: 0.6,
  DEF: 1.0,
  GK: 1.1,
};

/**
 * Kadronun hücum ve savunma gücünü hesaplar.
 *
 * Her futbolcunun ilgili reytingi pozisyon çarpanıyla çarpılır, toplam
 * çarpan ağırlığına bölünerek 0-100 ölçeğine normalize edilir. Böylece
 * kadro büyüklüğü değişse de (config.squad) değerler karşılaştırılabilir
 * kalır — 7 kişilik kadro ile 15 kişilik kadro aynı skalada olur.
 */
export function calculateTeamStats(players: Footballer[]): CalculatedStats {
  if (!players || players.length === 0) {
    return { attack: 50, defense: 50 };
  }

  let attackSum = 0;
  let attackWeight = 0;
  let defenseSum = 0;
  let defenseWeight = 0;

  for (const p of players) {
    const aw = ATTACK_WEIGHT[p.position];
    const dw = DEFENSE_WEIGHT[p.position];
    attackSum += p.attack * aw;
    attackWeight += aw;
    defenseSum += p.defense * dw;
    defenseWeight += dw;
  }

  const attack = attackWeight > 0 ? attackSum / attackWeight : 50;
  const defense = defenseWeight > 0 ? defenseSum / defenseWeight : 50;

  return {
    attack: Math.max(20, Math.min(99, Math.round(attack))),
    defense: Math.max(20, Math.min(99, Math.round(defense))),
  };
}

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
