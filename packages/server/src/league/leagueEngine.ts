import type { Fixture, Footballer, LeagueState, MatchResult, StandingRow, Team } from '@fal/shared';
import { simulateMatch } from '../simulation/simulator.js';
import { buildTeam } from '../simulation/teamStats.js';

export interface ParticipantTeamInfo {
  id: string;
  nickname: string;
  squad: Footballer[];
}

/**
 * N takım için her takımın birbiriyle tam 1 kez karşılaşacağı (Single Round-Robin) fikstür üretir.
 * Toplam maç sayısı: N * (N - 1) / 2
 */
export function generateFixtures(participants: { id: string }[]): Fixture[] {
  const fixtures: Fixture[] = [];
  const n = participants.length;

  if (n < 2) return fixtures;

  let matchIndex = 1;
  for (let i = 0; i < n; i++) {
    const home = participants[i];
    if (!home) continue;

    for (let j = i + 1; j < n; j++) {
      const away = participants[j];
      if (!away) continue;

      fixtures.push({
        matchId: `m-${matchIndex++}`,
        homeId: home.id,
        awayId: away.id,
      });
    }
  }

  return fixtures;
}

/**
 * Katılımcılar için başlangıç boş puan tablosunu oluşturur.
 */
export function createInitialStandings(
  participants: { id: string; nickname: string }[],
): StandingRow[] {
  return participants.map((p) => ({
    participantId: p.id,
    nickname: p.nickname,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  }));
}

/**
 * Bir maç sonucunu mevcut puan tablosuna işler ve sıralı yeni puan tablosunu döndürür.
 * Sıralama Kriterleri:
 * 1. Puan (Points)
 * 2. Averaj (Goal Difference)
 * 3. Atılan Gol (Goals For)
 * 4. Alfabetik (Nickname)
 */
export function updateStandings(
  currentStandings: StandingRow[],
  result: MatchResult,
): StandingRow[] {
  const updated = currentStandings.map((row) => ({ ...row }));

  const homeRow = updated.find((r) => r.participantId === result.homeId);
  const awayRow = updated.find((r) => r.participantId === result.awayId);

  if (!homeRow || !awayRow) {
    return updated;
  }

  // Oynanan maç sayısı ve goller
  homeRow.played += 1;
  awayRow.played += 1;

  homeRow.goalsFor += result.scoreHome;
  homeRow.goalsAgainst += result.scoreAway;
  homeRow.goalDifference = homeRow.goalsFor - homeRow.goalsAgainst;

  awayRow.goalsFor += result.scoreAway;
  awayRow.goalsAgainst += result.scoreHome;
  awayRow.goalDifference = awayRow.goalsFor - awayRow.goalsAgainst;

  // Galibiyet / Beraberlik / Mağlubiyet ve Puanlar (G: 3, B: 1, M: 0)
  if (result.scoreHome > result.scoreAway) {
    homeRow.won += 1;
    homeRow.points += 3;
    awayRow.lost += 1;
  } else if (result.scoreHome < result.scoreAway) {
    awayRow.won += 1;
    awayRow.points += 3;
    homeRow.lost += 1;
  } else {
    homeRow.drawn += 1;
    homeRow.points += 1;
    awayRow.drawn += 1;
    awayRow.points += 1;
  }

  // Sıralama
  return updated.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.nickname.localeCompare(b.nickname);
  });
}

/**
 * Tüm katılımcılar arasında ligi uçtan uca simüle eder.
 * Fikstür oluşturur, her maçı simüle eder, puan durumunu günceller ve şampiyonu belirler.
 */
export function simulateFullLeague(
  participants: ParticipantTeamInfo[],
  baseSeed = 42,
): LeagueState {
  const fixtures = generateFixtures(participants);
  let standings = createInitialStandings(participants);
  const results: MatchResult[] = [];

  // Takım haritası (hızlı erişim için)
  const teamMap = new Map<string, Team>();
  for (const p of participants) {
    teamMap.set(p.id, buildTeam(p));
  }

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    if (!fixture) continue;

    const homeTeam = teamMap.get(fixture.homeId);
    const awayTeam = teamMap.get(fixture.awayId);

    if (!homeTeam || !awayTeam) continue;

    const matchSeed = baseSeed + (i + 1) * 1000;
    const matchResult = simulateMatch({
      matchId: fixture.matchId,
      homeTeam,
      awayTeam,
      seed: matchSeed,
    });

    results.push(matchResult);
    standings = updateStandings(standings, matchResult);
  }

  const championId = standings[0]?.participantId ?? null;

  return {
    fixtures,
    results,
    standings,
    championId,
  };
}
