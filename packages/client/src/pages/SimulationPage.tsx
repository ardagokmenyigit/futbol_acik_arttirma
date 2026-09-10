import { useEffect, useState, type FC } from 'react';
import type {
  Footballer,
  MatchResult,
  Participant,
  TournamentMatch,
  TournamentRound,
  TournamentSize,
  TournamentState,
} from '@fal/shared';
import { buildTeam, simulateMatch } from '@fal/shared';
import { useSocket } from '../hooks/useSocket.js';
import { TournamentBracket } from '../components/TournamentBracket.js';
import { LiveMatchTicker } from '../components/LiveMatchTicker.js';
import { ChampionCelebration } from '../components/ChampionCelebration.js';

interface SimulationPageProps {
  myParticipantId?: string;
  initialParticipants?: Participant[];
  onFinish?: () => void;
}

const BOT_NAMES = [
  'Real Madrid (Bot)',
  'Manchester City (Bot)',
  'Bayern Münih (Bot)',
  'Arsenal (Bot)',
  'Inter Milan (Bot)',
  'Paris Saint-Germain (Bot)',
  'FC Barcelona (Bot)',
  'Bayer Leverkusen (Bot)',
];

const DEFAULT_DEMO_SQUADS: Record<string, Footballer[]> = {
  'user-1': [
    { id: 'u1-1', name: 'Thibaut Courtois', position: 'GK', attack: 15, defense: 89, overall: 89 },
    { id: 'u1-2', name: 'Antonio Rüdiger', position: 'DEF', attack: 45, defense: 86, overall: 86 },
    { id: 'u1-3', name: 'Dani Carvajal', position: 'DEF', attack: 68, defense: 85, overall: 85 },
    { id: 'u1-4', name: 'Jude Bellingham', position: 'MID', attack: 88, defense: 78, overall: 90 },
    {
      id: 'u1-5',
      name: 'Federico Valverde',
      position: 'MID',
      attack: 84,
      defense: 82,
      overall: 88,
    },
    { id: 'u1-6', name: 'Vinícius Jr.', position: 'FWD', attack: 92, defense: 35, overall: 90 },
    { id: 'u1-7', name: 'Kylian Mbappé', position: 'FWD', attack: 95, defense: 38, overall: 91 },
  ],
  'user-2': [
    { id: 'u2-1', name: 'Ederson', position: 'GK', attack: 22, defense: 88, overall: 88 },
    { id: 'u2-2', name: 'Rúben Dias', position: 'DEF', attack: 40, defense: 88, overall: 88 },
    { id: 'u2-3', name: 'Joško Gvardiol', position: 'DEF', attack: 65, defense: 84, overall: 84 },
    { id: 'u2-4', name: 'Rodri', position: 'MID', attack: 80, defense: 88, overall: 91 },
    { id: 'u2-5', name: 'Kevin De Bruyne', position: 'MID', attack: 89, defense: 70, overall: 90 },
    { id: 'u2-6', name: 'Phil Foden', position: 'FWD', attack: 88, defense: 55, overall: 88 },
    { id: 'u2-7', name: 'Erling Haaland', position: 'FWD', attack: 94, defense: 45, overall: 91 },
  ],
  'bot-1': [
    { id: 'b1-1', name: 'Manuel Neuer', position: 'GK', attack: 20, defense: 87, overall: 87 },
    { id: 'b1-2', name: 'Dayot Upamecano', position: 'DEF', attack: 40, defense: 82, overall: 82 },
    { id: 'b1-3', name: 'Alphonso Davies', position: 'DEF', attack: 75, defense: 82, overall: 82 },
    { id: 'b1-4', name: 'Joshua Kimmich', position: 'MID', attack: 84, defense: 83, overall: 86 },
    { id: 'b1-5', name: 'Jamal Musiala', position: 'MID', attack: 88, defense: 60, overall: 87 },
    { id: 'b1-6', name: 'Leroy Sané', position: 'FWD', attack: 85, defense: 40, overall: 85 },
    { id: 'b1-7', name: 'Harry Kane', position: 'FWD', attack: 93, defense: 48, overall: 90 },
  ],
  'bot-2': [
    { id: 'b2-1', name: 'David Raya', position: 'GK', attack: 18, defense: 84, overall: 84 },
    { id: 'b2-2', name: 'William Saliba', position: 'DEF', attack: 42, defense: 87, overall: 87 },
    {
      id: 'b2-3',
      name: 'Gabriel Magalhães',
      position: 'DEF',
      attack: 45,
      defense: 86,
      overall: 86,
    },
    { id: 'b2-4', name: 'Declan Rice', position: 'MID', attack: 78, defense: 86, overall: 87 },
    { id: 'b2-5', name: 'Martin Ødegaard', position: 'MID', attack: 87, defense: 68, overall: 89 },
    {
      id: 'b2-6',
      name: 'Gabriel Martinelli',
      position: 'FWD',
      attack: 84,
      defense: 45,
      overall: 84,
    },
    { id: 'b2-7', name: 'Bukayo Saka', position: 'FWD', attack: 89, defense: 65, overall: 87 },
  ],
  'bot-3': [
    { id: 'b3-1', name: 'Yann Sommer', position: 'GK', attack: 15, defense: 87, overall: 87 },
    {
      id: 'b3-2',
      name: 'Alessandro Bastoni',
      position: 'DEF',
      attack: 52,
      defense: 87,
      overall: 87,
    },
    { id: 'b3-3', name: 'Federico Dimarco', position: 'DEF', attack: 76, defense: 82, overall: 83 },
    { id: 'b3-4', name: 'Nicolò Barella', position: 'MID', attack: 82, defense: 84, overall: 87 },
    { id: 'b3-5', name: 'Hakan Çalhanoğlu', position: 'MID', attack: 86, defense: 80, overall: 86 },
    { id: 'b3-6', name: 'Marcus Thuram', position: 'FWD', attack: 84, defense: 48, overall: 84 },
    { id: 'b3-7', name: 'Lautaro Martínez', position: 'FWD', attack: 91, defense: 50, overall: 89 },
  ],
  'bot-4': [
    {
      id: 'b4-1',
      name: 'Gianluigi Donnarumma',
      position: 'GK',
      attack: 15,
      defense: 89,
      overall: 89,
    },
    { id: 'b4-2', name: 'Marquinhos', position: 'DEF', attack: 48, defense: 87, overall: 87 },
    { id: 'b4-3', name: 'Achraf Hakimi', position: 'DEF', attack: 79, defense: 83, overall: 84 },
    { id: 'b4-4', name: 'Vitinha', position: 'MID', attack: 82, defense: 80, overall: 85 },
    {
      id: 'b4-5',
      name: 'Warren Zaïre-Emery',
      position: 'MID',
      attack: 80,
      defense: 78,
      overall: 80,
    },
    { id: 'b4-6', name: 'Bradley Barcola', position: 'FWD', attack: 84, defense: 40, overall: 82 },
    { id: 'b4-7', name: 'Ousmane Dembélé', position: 'FWD', attack: 86, defense: 38, overall: 86 },
  ],
  'bot-5': [
    {
      id: 'b5-1',
      name: 'Marc-André ter Stegen',
      position: 'GK',
      attack: 18,
      defense: 89,
      overall: 89,
    },
    { id: 'b5-2', name: 'Ronald Araújo', position: 'DEF', attack: 40, defense: 86, overall: 86 },
    { id: 'b5-3', name: 'Jules Koundé', position: 'DEF', attack: 62, defense: 85, overall: 85 },
    { id: 'b5-4', name: 'Pedri', position: 'MID', attack: 85, defense: 72, overall: 86 },
    { id: 'b5-5', name: 'Dani Olmo', position: 'MID', attack: 86, defense: 65, overall: 84 },
    { id: 'b5-6', name: 'Lamine Yamal', position: 'FWD', attack: 88, defense: 42, overall: 85 },
    {
      id: 'b5-7',
      name: 'Robert Lewandowski',
      position: 'FWD',
      attack: 92,
      defense: 44,
      overall: 88,
    },
  ],
  'bot-6': [
    { id: 'b6-1', name: 'Lukáš Hrádecký', position: 'GK', attack: 15, defense: 84, overall: 84 },
    { id: 'b6-2', name: 'Jonathan Tah', position: 'DEF', attack: 42, defense: 86, overall: 86 },
    { id: 'b6-3', name: 'Jeremie Frimpong', position: 'DEF', attack: 84, defense: 78, overall: 84 },
    { id: 'b6-4', name: 'Granit Xhaka', position: 'MID', attack: 82, defense: 84, overall: 86 },
    { id: 'b6-5', name: 'Florian Wirtz', position: 'MID', attack: 89, defense: 62, overall: 88 },
    { id: 'b6-6', name: 'Victor Boniface', position: 'FWD', attack: 86, defense: 44, overall: 82 },
    {
      id: 'b6-7',
      name: 'Alejandro Grimaldo',
      position: 'FWD',
      attack: 87,
      defense: 76,
      overall: 86,
    },
  ],
};

function createClientTournament(
  userParticipants: Participant[],
  targetSize: TournamentSize,
): { tournament: TournamentState; allParticipants: Participant[] } {
  const all: Participant[] = userParticipants.map((u) => ({
    ...u,
    squad:
      u.squad && u.squad.length > 0
        ? u.squad
        : (DEFAULT_DEMO_SQUADS[u.id] ?? DEFAULT_DEMO_SQUADS['user-1']!),
  }));
  const needed = targetSize - all.length;

  for (let i = 0; i < needed; i++) {
    const botId = `bot-${i + 1}`;
    all.push({
      id: botId,
      nickname: BOT_NAMES[i % BOT_NAMES.length] ?? `Bot Takım ${i + 1}`,
      isHost: false,
      isReady: true,
      connected: true,
      budget: 0,
      squad: DEFAULT_DEMO_SQUADS[botId] ?? DEFAULT_DEMO_SQUADS['bot-1']!,
    });
  }

  if (targetSize === 2) {
    const finalMatch: TournamentMatch = {
      matchId: 'final-1',
      round: 'final',
      roundIndex: 0,
      homeId: all[0]?.id ?? null,
      awayId: all[1]?.id ?? null,
      homePlaceholder: 'Takım 1',
      awayPlaceholder: 'Takım 2',
    };

    return {
      tournament: {
        size: 2,
        rounds: [{ name: 'final', title: 'Büyük Final', matches: [finalMatch] }],
        currentMatchId: 'final-1',
        championId: null,
      },
      allParticipants: all,
    };
  }

  if (targetSize === 4) {
    const semiMatches: TournamentMatch[] = [
      {
        matchId: 'semi-1',
        round: 'semi',
        roundIndex: 0,
        homeId: all[0]?.id ?? null,
        awayId: all[1]?.id ?? null,
        homePlaceholder: 'Takım 1',
        awayPlaceholder: 'Takım 2',
      },
      {
        matchId: 'semi-2',
        round: 'semi',
        roundIndex: 1,
        homeId: all[2]?.id ?? null,
        awayId: all[3]?.id ?? null,
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

    return {
      tournament: {
        size: 4,
        rounds: [
          { name: 'semi', title: 'Yarı Final', matches: semiMatches },
          { name: 'final', title: 'Büyük Final', matches: [finalMatch] },
        ],
        currentMatchId: 'semi-1',
        championId: null,
      },
      allParticipants: all,
    };
  }

  // 8 Takımlı
  const quarterMatches: TournamentMatch[] = [];
  for (let i = 0; i < 4; i++) {
    quarterMatches.push({
      matchId: `qtr-${i + 1}`,
      round: 'quarter',
      roundIndex: i,
      homeId: all[i * 2]?.id ?? null,
      awayId: all[i * 2 + 1]?.id ?? null,
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

  return {
    tournament: {
      size: 8,
      rounds: [
        { name: 'quarter', title: 'Çeyrek Final', matches: quarterMatches },
        { name: 'semi', title: 'Yarı Final', matches: semiMatches },
        { name: 'final', title: 'Büyük Final', matches: [finalMatch] },
      ],
      currentMatchId: 'qtr-1',
      championId: null,
    },
    allParticipants: all,
  };
}

// Saf ve derin kopyalama ile tur atlatma
function advanceTournamentState(state: TournamentState, matchResult: MatchResult): TournamentState {
  const winnerId = matchResult.winnerId;
  if (!winnerId) return state;

  // Derin kopya üret
  const rounds: TournamentRound[] = state.rounds.map((round) => ({
    name: round.name,
    title: round.title,
    matches: round.matches.map((m) => {
      if (m.matchId === matchResult.matchId) {
        return { ...m, result: matchResult };
      }
      return { ...m };
    }),
  }));

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
      if (matchIdxInRound % 2 === 0) {
        nextMatch.homeId = winnerId;
      } else {
        nextMatch.awayId = winnerId;
      }
    }
  }

  // Sıradaki oynanabilir maçı bul
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

export const SimulationPage: FC<SimulationPageProps> = ({
  myParticipantId,
  initialParticipants = [],
  onFinish,
}) => {
  const { socket: _socket } = useSocket();
  const [tournamentSize, setTournamentSize] = useState<TournamentSize>(4);
  const [tournament, setTournament] = useState<TournamentState | null>(null);
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [liveSimulatingResult, setLiveSimulatingResult] = useState<MatchResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Başlangıçta demo kullanıcılarla turnuva oluştur
  useEffect(() => {
    const baseUsers: Participant[] =
      initialParticipants.length > 0
        ? initialParticipants
        : [
            {
              id: 'user-1',
              nickname: 'Kerem FK',
              isHost: true,
              isReady: true,
              connected: true,
              budget: 0,
              squad: DEFAULT_DEMO_SQUADS['user-1']!,
            },
            {
              id: 'user-2',
              nickname: 'Arda United',
              isHost: false,
              isReady: true,
              connected: true,
              budget: 0,
              squad: DEFAULT_DEMO_SQUADS['user-2']!,
            },
          ];

    const { tournament: t, allParticipants: p } = createClientTournament(baseUsers, tournamentSize);
    setTournament(t);
    setParticipants(p);
  }, [tournamentSize, initialParticipants]);

  // Turnuva boyutu değiştiğinde yeniden kur
  const handleSelectSize = (size: TournamentSize) => {
    setTournamentSize(size);
    const baseUsers = participants.filter((p) => !p.id.startsWith('bot-'));
    const { tournament: t, allParticipants: p } = createClientTournament(baseUsers, size);
    setTournament(t);
    setParticipants(p);
    setLiveSimulatingResult(null);
    setIsSimulating(false);
  };

  // Bir maçı gerçek simülasyon motoruyla simüle et
  const handleSimulateMatch = (match: TournamentMatch, forcePenalties = false) => {
    if (!match.homeId || !match.awayId || isSimulating) return;

    const homePart = participants.find((p) => p.id === match.homeId);
    const awayPart = participants.find((p) => p.id === match.awayId);
    if (!homePart || !awayPart) return;

    setIsSimulating(true);

    const homeTeam = buildTeam(homePart);
    const awayTeam = buildTeam(awayPart);

    let matchResult: MatchResult;

    if (forcePenalties) {
      // Penaltı heyecanını test etmek için 0-0 berabere bitirip seri penaltıları başlat
      matchResult = simulateMatch({
        matchId: match.matchId,
        homeTeam,
        awayTeam,
        isTournament: true,
        chanceRate: 0, // 0-0 berabere biter
        seed: Math.floor(Math.random() * 1000000),
      });
    } else {
      matchResult = simulateMatch({
        matchId: match.matchId,
        homeTeam,
        awayTeam,
        isTournament: true,
        seed: Math.floor(Math.random() * 1000000),
      });
    }

    setLiveSimulatingResult(matchResult);
  };

  // Canlı simülasyon bittiğinde tura kazananı işlet
  const handleLiveTickerComplete = (completedResult: MatchResult) => {
    setTournament((prevTournament) => {
      if (!prevTournament) return null;
      const updated = advanceTournamentState(prevTournament, completedResult);
      if (updated.championId) {
        onFinish?.();
      }
      return updated;
    });

    setIsSimulating(false);
    setLiveSimulatingResult(null);
  };

  // Sıradaki hazır maçı bul ve başlat
  const handleSimulateNext = (forcePenalties = false) => {
    if (!tournament || isSimulating) return;

    let targetMatch: TournamentMatch | null = null;
    for (const round of tournament.rounds) {
      for (const m of round.matches) {
        if (!m.result && m.homeId && m.awayId) {
          targetMatch = m;
          break;
        }
      }
      if (targetMatch) break;
    }

    if (targetMatch) {
      handleSimulateMatch(targetMatch, forcePenalties);
    }
  };

  const getTeamName = (id: string | null, placeholder?: string) => {
    if (!id) return placeholder ?? 'Bekleniyor...';
    return participants.find((p) => p.id === id)?.nickname ?? id;
  };

  const champion = tournament?.championId
    ? participants.find((p) => p.id === tournament.championId)
    : null;

  return (
    <div className="container">
      {/* Üst Başlık ve Kontroller */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.8rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span>🏆</span> Turnuva Ağacı (Playoff Bracket)
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Tek maçlı eleme usulü! Eksik takımlar yapay zekâ botlarıyla otomatik tamamlandı.
          </p>
        </div>

        {/* Aksiyon Butonları & Format Seçimi */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {tournament && !tournament.championId && (
            <>
              <button
                onClick={() => handleSimulateNext(false)}
                disabled={isSimulating}
                style={{
                  backgroundColor: 'var(--accent-gold)',
                  color: '#000',
                  padding: '8px 18px',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  boxShadow: '0 0 10px var(--accent-gold-glow)',
                  borderRadius: 6,
                  border: 'none',
                  cursor: isSimulating ? 'not-allowed' : 'pointer',
                }}
              >
                {isSimulating ? 'Simüle Ediliyor...' : '⚡ Sıradaki Maçı Simüle Et'}
              </button>

              <button
                onClick={() => handleSimulateNext(true)}
                disabled={isSimulating}
                title="Maçı 0-0 berabere bitirerek seri penaltı atışları heyecanını anında test eder"
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.2)',
                  color: 'var(--accent-gold)',
                  border: '1px solid var(--accent-gold)',
                  padding: '8px 14px',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  borderRadius: 6,
                  cursor: isSimulating ? 'not-allowed' : 'pointer',
                }}
              >
                🎯 Penaltı Testi
              </button>
            </>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              backgroundColor: 'var(--bg-secondary)',
              padding: 4,
              borderRadius: 8,
            }}
          >
            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                padding: '0 8px',
                fontWeight: 600,
              }}
            >
              Format:
            </span>
            <button
              onClick={() => handleSelectSize(2)}
              disabled={isSimulating}
              style={{
                padding: '6px 10px',
                fontSize: '0.85rem',
                fontWeight: 700,
                backgroundColor: tournamentSize === 2 ? 'var(--accent-green)' : 'transparent',
                color: tournamentSize === 2 ? '#000' : 'var(--text-secondary)',
                borderRadius: 4,
                border: 'none',
                cursor: isSimulating ? 'not-allowed' : 'pointer',
              }}
            >
              2 Takım
            </button>
            <button
              onClick={() => handleSelectSize(4)}
              disabled={isSimulating}
              style={{
                padding: '6px 10px',
                fontSize: '0.85rem',
                fontWeight: 700,
                backgroundColor: tournamentSize === 4 ? 'var(--accent-green)' : 'transparent',
                color: tournamentSize === 4 ? '#000' : 'var(--text-secondary)',
                borderRadius: 4,
                border: 'none',
                cursor: isSimulating ? 'not-allowed' : 'pointer',
              }}
            >
              4 Takım
            </button>
            <button
              onClick={() => handleSelectSize(8)}
              disabled={isSimulating}
              style={{
                padding: '6px 10px',
                fontSize: '0.85rem',
                fontWeight: 700,
                backgroundColor: tournamentSize === 8 ? 'var(--accent-green)' : 'transparent',
                color: tournamentSize === 8 ? '#000' : 'var(--text-secondary)',
                borderRadius: 4,
                border: 'none',
                cursor: isSimulating ? 'not-allowed' : 'pointer',
              }}
            >
              8 Takım
            </button>
          </div>
        </div>
      </header>

      {/* Şampiyonluk Kutlaması */}
      {champion && (
        <ChampionCelebration
          championRow={{
            participantId: champion.id,
            nickname: champion.nickname,
            played: tournamentSize === 2 ? 1 : tournamentSize === 4 ? 2 : 3,
            won: tournamentSize === 2 ? 1 : tournamentSize === 4 ? 2 : 3,
            drawn: 0,
            lost: 0,
            goalsFor: 6,
            goalsAgainst: 2,
            goalDifference: 4,
            points: 9,
          }}
          isMe={champion.id === myParticipantId}
          onReset={() => handleSelectSize(tournamentSize)}
        />
      )}

      {/* Canlı Maç Gösterimi */}
      {liveSimulatingResult && (
        <LiveMatchTicker
          homeName={getTeamName(liveSimulatingResult.homeId)}
          awayName={getTeamName(liveSimulatingResult.awayId)}
          result={liveSimulatingResult}
          speedMs={25}
          onComplete={handleLiveTickerComplete}
        />
      )}

      {/* Turnuva Ağacı Görseli */}
      {tournament && (
        <div className="card" style={{ padding: 24 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
              🌿 {tournamentSize} Takımlı Eleme Tablosu
            </h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {participants.filter((p) => !p.id.startsWith('bot-')).length} Gerçek Oyuncu +{' '}
              {participants.filter((p) => p.id.startsWith('bot-')).length} Bot Takım
            </span>
          </div>

          <TournamentBracket
            tournament={tournament}
            getTeamName={getTeamName}
            onSimulateMatch={(match) => handleSimulateMatch(match, false)}
            isSimulating={isSimulating}
          />
        </div>
      )}
    </div>
  );
};
