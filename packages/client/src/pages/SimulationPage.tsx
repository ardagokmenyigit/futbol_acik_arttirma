import { useEffect, useState, type FC } from 'react';
import type {
  MatchResult,
  Participant,
  TournamentMatch,
  TournamentRound,
  TournamentSize,
  TournamentState,
} from '@fal/shared';
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

function createClientTournament(
  userParticipants: Participant[],
  targetSize: TournamentSize,
): { tournament: TournamentState; allParticipants: Participant[] } {
  const all: Participant[] = [...userParticipants];
  const needed = targetSize - all.length;

  for (let i = 0; i < needed; i++) {
    all.push({
      id: `bot-${i + 1}`,
      nickname: BOT_NAMES[i % BOT_NAMES.length] ?? `Bot Takım ${i + 1}`,
      isHost: false,
      isReady: true,
      connected: true,
      budget: 0,
      squad: [],
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
              squad: [],
            },
            {
              id: 'user-2',
              nickname: 'Arda United',
              isHost: false,
              isReady: true,
              connected: true,
              budget: 0,
              squad: [],
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

  // Bir maçı simüle et
  const handleSimulateMatch = (match: TournamentMatch) => {
    if (!match.homeId || !match.awayId || isSimulating) return;

    setIsSimulating(true);

    const homeScore = Math.floor(Math.random() * 3);
    const awayScore = Math.floor(Math.random() * 3);

    const events = [];
    for (let i = 0; i < homeScore; i++) {
      events.push({
        minute: Math.floor(Math.random() * 80) + 5,
        teamId: match.homeId,
        type: 'goal' as const,
      });
    }
    for (let i = 0; i < awayScore; i++) {
      events.push({
        minute: Math.floor(Math.random() * 80) + 5,
        teamId: match.awayId,
        type: 'goal' as const,
      });
    }
    events.sort((a, b) => a.minute - b.minute);

    let penHome: number | undefined;
    let penAway: number | undefined;
    let winnerId: string;

    if (homeScore > awayScore) {
      winnerId = match.homeId;
    } else if (awayScore > homeScore) {
      winnerId = match.awayId;
    } else {
      penHome = 5;
      penAway = 4;
      winnerId = match.homeId;
    }

    const matchResult: MatchResult = {
      matchId: match.matchId,
      homeId: match.homeId,
      awayId: match.awayId,
      scoreHome: homeScore,
      scoreAway: awayScore,
      events,
      penaltiesHome: penHome,
      penaltiesAway: penAway,
      winnerId,
    };

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
  const handleSimulateNext = () => {
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
      handleSimulateMatch(targetMatch);
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
            <button
              onClick={handleSimulateNext}
              disabled={isSimulating}
              style={{
                backgroundColor: 'var(--accent-gold)',
                color: '#000',
                padding: '8px 18px',
                fontWeight: 800,
                fontSize: '0.9rem',
                boxShadow: '0 0 10px var(--accent-gold-glow)',
              }}
            >
              {isSimulating ? 'Simüle Ediliyor...' : '⚡ Sıradaki Maçı Simüle Et'}
            </button>
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
              onClick={() => handleSelectSize(4)}
              disabled={isSimulating}
              style={{
                padding: '6px 12px',
                fontSize: '0.85rem',
                fontWeight: 700,
                backgroundColor: tournamentSize === 4 ? 'var(--accent-green)' : 'transparent',
                color: tournamentSize === 4 ? '#000' : 'var(--text-secondary)',
              }}
            >
              4 Takım
            </button>
            <button
              onClick={() => handleSelectSize(8)}
              disabled={isSimulating}
              style={{
                padding: '6px 12px',
                fontSize: '0.85rem',
                fontWeight: 700,
                backgroundColor: tournamentSize === 8 ? 'var(--accent-green)' : 'transparent',
                color: tournamentSize === 8 ? '#000' : 'var(--text-secondary)',
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
            played: tournamentSize === 4 ? 2 : 3,
            won: tournamentSize === 4 ? 2 : 3,
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
            onSimulateMatch={handleSimulateMatch}
            isSimulating={isSimulating}
          />
        </div>
      )}
    </div>
  );
};
