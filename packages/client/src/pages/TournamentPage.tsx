import type { RoomState, TournamentMatch, TournamentState } from '@fal/shared';
import { leaveRoom } from '../lib/roomClient.js';
import { clearSession } from '../lib/session.js';
import { useRoomStore } from '../store.js';

interface Props {
  room: RoomState;
  tournament: TournamentState;
}

export function TournamentPage({ room, tournament }: Props) {
  const exitRoom = useRoomStore((s) => s.exitRoom);
  const youId = useRoomStore((s) => s.youId);

  const nameOf = (id: string | null, placeholder?: string) => {
    if (!id) return placeholder ?? 'Bekleniyor';
    return room.participants.find((p) => p.id === id)?.nickname ?? '?';
  };
  const isBot = (id: string | null) =>
    !!id && (room.participants.find((p) => p.id === id)?.isBot ?? false);

  const champId = tournament.championId;
  const champ = champId ? room.participants.find((p) => p.id === champId) : undefined;

  const played = tournament.rounds.flatMap((r) => r.matches).filter((m) => m.result).length;
  const total = tournament.rounds.reduce((s, r) => s + r.matches.length, 0);

  function newGame() {
    leaveRoom();
    clearSession();
    exitRoom();
  }

  return (
    <div className="stack">
      {champ ? (
        <div className="champion">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
            <path d="M7 6H4v1a3 3 0 0 0 3 3" />
            <path d="M17 6h3v1a3 3 0 0 1-3 3" />
            <path d="M12 13v4" />
            <path d="M9 21h6" />
            <path d="M10 17h4" />
          </svg>
          <div className="champ-name">Şampiyon — {champ.nickname}</div>
          <div className="champ-meta">
            {tournament.size} takımlı turnuva{champ.id === youId ? ' · tebrikler!' : ''}
          </div>
          <button className="btn-primary" onClick={newGame}>
            Yeni oyun
          </button>
        </div>
      ) : (
        <div>
          <div className="round-label" style={{ color: 'var(--chalk-faint)' }}>
            Maç {played}/{total}
          </div>
          <h1 style={{ fontSize: 30 }}>Turnuva oynanıyor</h1>
        </div>
      )}

      {tournament.rounds.map((round) => (
        <div className="panel" key={round.name}>
          <div className="section-label">{round.title}</div>
          <div className="bracket">
            {round.matches.map((m) => (
              <BracketMatch
                key={m.matchId}
                match={m}
                live={m.matchId === tournament.currentMatchId}
                nameOf={nameOf}
                isBot={isBot}
                youId={youId}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface MatchProps {
  match: TournamentMatch;
  live: boolean;
  youId: string | null;
  nameOf: (id: string | null, placeholder?: string) => string;
  isBot: (id: string | null) => boolean;
}

function BracketMatch({ match, live, youId, nameOf, isBot }: MatchProps) {
  const res = match.result;
  const homeWon = res ? res.winnerId === match.homeId : false;
  const awayWon = res ? res.winnerId === match.awayId : false;

  const side = (
    id: string | null,
    placeholder: string | undefined,
    won: boolean,
    score?: number,
  ) => (
    <div className={`bm-side${won ? ' won' : ''}${id && id === youId ? ' you' : ''}`}>
      <span className="bm-name">
        {nameOf(id, placeholder)}
        {isBot(id) && <span className="bm-bot">bot</span>}
      </span>
      <span className="bm-score">{score ?? '–'}</span>
    </div>
  );

  return (
    <div className={`bracket-match${live ? ' live' : ''}${res ? ' done' : ''}`}>
      {side(match.homeId, match.homePlaceholder, homeWon, res?.scoreHome)}
      {side(match.awayId, match.awayPlaceholder, awayWon, res?.scoreAway)}
      {res?.penaltiesHome != null && (
        <div className="bm-pen">
          penaltılar {res.penaltiesHome}-{res.penaltiesAway}
        </div>
      )}
      {live && !res && <div className="bm-live">oynanıyor…</div>}
    </div>
  );
}
