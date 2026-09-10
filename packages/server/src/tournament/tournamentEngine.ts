import type {
  Footballer,
  MatchResult,
  TournamentMatch,
  TournamentRound,
  TournamentSize,
  TournamentState,
} from '@fal/shared';
import { simulateMatch } from '../simulation/simulator.js';
import { buildTeam } from '../simulation/teamStats.js';

export interface ParticipantTeamInfo {
  id: string;
  nickname: string;
  squad: Footballer[];
  isBot?: boolean;
}

const BOT_TEAM_NAMES = [
  'Real Madrid (Bot)',
  'Manchester City (Bot)',
  'Bayern Münih (Bot)',
  'Arsenal (Bot)',
  'Inter Milan (Bot)',
  'Paris Saint-Germain (Bot)',
  'FC Barcelona (Bot)',
  'Bayer Leverkusen (Bot)',
];

/**
 * Kullanıcı sayısı yetersiz olduğunda eksik takımları rastgele / bot takımlarla tamamlar.
 */
export function fillWithBotTeams(
  participants: ParticipantTeamInfo[],
  targetSize: TournamentSize,
  fallbackPlayers: Footballer[] = [],
): ParticipantTeamInfo[] {
  const result: ParticipantTeamInfo[] = [...participants];
  const needed = targetSize - result.length;

  if (needed <= 0) return result.slice(0, targetSize);

  for (let i = 0; i < needed; i++) {
    const botId = `bot-${i + 1}`;
    const botName = BOT_TEAM_NAMES[i % BOT_TEAM_NAMES.length] ?? `AI Takım ${i + 1}`;

    // Havuzdan 15 rastgele oyuncu veya sentetik kadro ata
    const squad: Footballer[] =
      fallbackPlayers.length >= 15
        ? fallbackPlayers.slice(
            (i * 15) % (fallbackPlayers.length - 15),
            ((i * 15) % (fallbackPlayers.length - 15)) + 15,
          )
        : [];

    result.push({
      id: botId,
      nickname: botName,
      squad,
      isBot: true,
    });
  }

  return result;
}

/**
 * 2, 4 veya 8 takımlı Turnuva Ağacı (Bracket) oluşturur.
 */
export function createTournament(
  teams: ParticipantTeamInfo[],
  size: TournamentSize = 4,
): TournamentState {
  if (size === 2) {
    const team1 = teams[0]?.id ?? null;
    const team2 = teams[1]?.id ?? null;

    const finalMatch: TournamentMatch = {
      matchId: 'final-1',
      round: 'final',
      roundIndex: 0,
      homeId: team1,
      awayId: team2,
      homePlaceholder: 'Takım 1',
      awayPlaceholder: 'Takım 2',
    };

    const rounds: TournamentRound[] = [
      { name: 'final', title: 'Büyük Final', matches: [finalMatch] },
    ];

    return {
      size: 2,
      rounds,
      currentMatchId: finalMatch.matchId,
      championId: null,
    };
  }

  if (size === 4) {
    const team1 = teams[0]?.id ?? null;
    const team2 = teams[1]?.id ?? null;
    const team3 = teams[2]?.id ?? null;
    const team4 = teams[3]?.id ?? null;

    const semiMatches: TournamentMatch[] = [
      {
        matchId: 'semi-1',
        round: 'semi',
        roundIndex: 0,
        homeId: team1,
        awayId: team2,
        homePlaceholder: 'Takım 1',
        awayPlaceholder: 'Takım 2',
      },
      {
        matchId: 'semi-2',
        round: 'semi',
        roundIndex: 1,
        homeId: team3,
        awayId: team4,
        homePlaceholder: 'Takım 3',
        awayPlaceholder: 'Takım 4',
      },
    ];

    const finalMatch: TournamentMatch = {
      matchId: 'final-1',
      round: 'final',
      roundIndex: 0,
      homeId: null,
      awayId: null,
      homePlaceholder: 'Yarı Final 1 Kazananı',
      awayPlaceholder: 'Yarı Final 2 Kazananı',
    };

    const rounds: TournamentRound[] = [
      { name: 'semi', title: 'Yarı Final', matches: semiMatches },
      { name: 'final', title: 'Büyük Final', matches: [finalMatch] },
    ];

    return {
      size: 4,
      rounds,
      currentMatchId: semiMatches[0]?.matchId ?? null,
      championId: null,
    };
  }

  // 8 Takımlı Turnuva
  const quarterMatches: TournamentMatch[] = [];
  for (let i = 0; i < 4; i++) {
    const home = teams[i * 2]?.id ?? null;
    const away = teams[i * 2 + 1]?.id ?? null;
    quarterMatches.push({
      matchId: `qtr-${i + 1}`,
      round: 'quarter',
      roundIndex: i,
      homeId: home,
      awayId: away,
      homePlaceholder: `Takım ${i * 2 + 1}`,
      awayPlaceholder: `Takım ${i * 2 + 2}`,
    });
  }

  const semiMatches: TournamentMatch[] = [
    {
      matchId: 'semi-1',
      round: 'semi',
      roundIndex: 0,
      homeId: null,
      awayId: null,
      homePlaceholder: 'Çeyrek Final 1 Kazananı',
      awayPlaceholder: 'Çeyrek Final 2 Kazananı',
    },
    {
      matchId: 'semi-2',
      round: 'semi',
      roundIndex: 1,
      homeId: null,
      awayId: null,
      homePlaceholder: 'Çeyrek Final 3 Kazananı',
      awayPlaceholder: 'Çeyrek Final 4 Kazananı',
    },
  ];

  const finalMatch: TournamentMatch = {
    matchId: 'final-1',
    round: 'final',
    roundIndex: 0,
    homeId: null,
    awayId: null,
    homePlaceholder: 'Yarı Final 1 Kazananı',
    awayPlaceholder: 'Yarı Final 2 Kazananı',
  };

  const rounds: TournamentRound[] = [
    { name: 'quarter', title: 'Çeyrek Final', matches: quarterMatches },
    { name: 'semi', title: 'Yarı Final', matches: semiMatches },
    { name: 'final', title: 'Büyük Final', matches: [finalMatch] },
  ];

  return {
    size: 8,
    rounds,
    currentMatchId: quarterMatches[0]?.matchId ?? null,
    championId: null,
  };
}

/**
 * Bir maç tamamlandığında kazananı turnuva ağacında bir üst tura ilerletir.
 */
export function advanceTournament(
  state: TournamentState,
  matchResult: MatchResult,
): TournamentState {
  const winnerId = matchResult.winnerId;
  if (!winnerId) return state;

  const rounds = state.rounds.map((round) => ({
    ...round,
    matches: round.matches.map((m) => {
      if (m.matchId === matchResult.matchId) {
        return { ...m, result: matchResult };
      }
      return m;
    }),
  }));

  // Maçın hangi turda olduğunu bul
  let currentRoundIdx = -1;
  let matchIdxInRound = -1;

  for (let r = 0; r < rounds.length; r++) {
    const round = rounds[r];
    if (!round) continue;
    const mIdx = round.matches.findIndex((m) => m.matchId === matchResult.matchId);
    if (mIdx !== -1) {
      currentRoundIdx = r;
      matchIdxInRound = mIdx;
      break;
    }
  }

  if (currentRoundIdx === -1) return state;

  // Eğer bu final maçıysa şampiyon belirlendi!
  if (currentRoundIdx === rounds.length - 1) {
    return {
      ...state,
      rounds,
      currentMatchId: null,
      championId: winnerId,
    };
  }

  // Bir üst tura kazananı yerleştir
  const nextRound = rounds[currentRoundIdx + 1];
  if (nextRound) {
    const nextMatchIdx = Math.floor(matchIdxInRound / 2);
    const nextMatch = nextRound.matches[nextMatchIdx];
    if (nextMatch) {
      const isHomeSlot = matchIdxInRound % 2 === 0;
      if (isHomeSlot) {
        nextMatch.homeId = winnerId;
      } else {
        nextMatch.awayId = winnerId;
      }
    }
  }

  // Sıradaki oynanacak maçı bul
  let nextMatchId: string | null = null;
  for (const round of rounds) {
    for (const m of round.matches) {
      if (!m.result && m.homeId && m.awayId) {
        nextMatchId = m.matchId;
        break;
      }
    }
    if (nextMatchId) break;
  }

  return {
    ...state,
    rounds,
    currentMatchId: nextMatchId,
  };
}

/**
 * Turnuvadaki tüm maçları sırayla baştan sona otomatik simüle eder.
 */
export function simulateFullTournament(
  teams: ParticipantTeamInfo[],
  size: TournamentSize = 4,
  baseSeed = 2026,
): { state: TournamentState; results: MatchResult[] } {
  let state = createTournament(teams, size);
  const results: MatchResult[] = [];

  const teamMap = new Map<string, ParticipantTeamInfo>();
  teams.forEach((t) => teamMap.set(t.id, t));

  let seedCount = 1;

  while (state.currentMatchId) {
    const currentId = state.currentMatchId;
    let matchToPlay: TournamentMatch | null = null;

    for (const round of state.rounds) {
      const m = round.matches.find((x) => x.matchId === currentId);
      if (m) {
        matchToPlay = m;
        break;
      }
    }

    if (!matchToPlay || !matchToPlay.homeId || !matchToPlay.awayId) break;

    const rawHome = teamMap.get(matchToPlay.homeId);
    const rawAway = teamMap.get(matchToPlay.awayId);

    const homeTeam = rawHome
      ? buildTeam(rawHome)
      : {
          participantId: matchToPlay.homeId,
          nickname: 'Takım 1',
          players: [],
          attack: 78,
          defense: 78,
        };

    const awayTeam = rawAway
      ? buildTeam(rawAway)
      : {
          participantId: matchToPlay.awayId,
          nickname: 'Takım 2',
          players: [],
          attack: 78,
          defense: 78,
        };

    const result = simulateMatch({
      matchId: matchToPlay.matchId,
      homeTeam,
      awayTeam,
      seed: baseSeed + seedCount * 777,
      isTournament: true,
    });

    results.push(result);
    state = advanceTournament(state, result);
    seedCount++;
  }

  return { state, results };
}
