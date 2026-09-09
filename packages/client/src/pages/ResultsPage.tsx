import type { MatchResult, RoomState } from '@fal/shared';
import { leaveRoom } from '../lib/roomClient.js';
import { clearSession } from '../lib/session.js';
import { useRoomStore } from '../store.js';

interface Props {
  room: RoomState;
}

export function ResultsPage({ room }: Props) {
  const league = useRoomStore((s) => s.league);
  const exitRoom = useRoomStore((s) => s.exitRoom);
  const youId = useRoomStore((s) => s.youId);
  const finished = room.phase === 'finished';

  const nick = (id: string) =>
    room.participants.find((p) => p.id === id)?.nickname ??
    league?.standings.find((r) => r.participantId === id)?.nickname ??
    '?';

  function newGame() {
    leaveRoom();
    clearSession();
    exitRoom();
  }

  if (!league) {
    return (
      <div className="panel gold">
        <div className="round-label" style={{ color: 'var(--chalk-faint)' }}>
          Draft tamamlandı
        </div>
        <h1 style={{ fontSize: 30, marginBottom: 12 }}>Lig hazırlanıyor</h1>
        <p className="footnote" style={{ marginTop: 0 }}>
          Fikstür oluşturuluyor, maçlar birazdan başlıyor…
        </p>
      </div>
    );
  }

  const played = league.results.length;
  const total = league.fixtures.length;
  const latest = league.results[played - 1];
  const champRow = finished
    ? league.standings.find((r) => r.participantId === league.championId)
    : undefined;

  return (
    <div className="stack">
      {finished && champRow ? (
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
          <div className="champ-name">Şampiyon — {champRow.nickname}</div>
          <div className="champ-meta">
            {champRow.points} puan · {fmtGD(champRow.goalDifference)} averaj
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
          <h1 style={{ fontSize: 30 }}>Lig oynanıyor</h1>
        </div>
      )}

      {!finished && latest && (
        <div className="scoreline">
          <div className="side home">
            <div className="name">{nick(latest.homeId)}</div>
            <div className="score">{latest.scoreHome}</div>
          </div>
          <div className="sep" />
          <div className="side away">
            <div className="name">{nick(latest.awayId)}</div>
            <div className="score">{latest.scoreAway}</div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="section-label">Puan durumu</div>
        <div className="standings">
          <span className="th">#</span>
          <span className="th">Takım</span>
          <span className="th num">O</span>
          <span className="th num">G</span>
          <span className="th num">B</span>
          <span className="th num">M</span>
          <span className="th num">AV</span>
          <span className="th num">P</span>
          {league.standings.map((r, i) => {
            const leader = i === 0;
            return (
              <div
                key={r.participantId}
                className={`row-leader-wrap${leader ? ' row-leader' : ''}`}
                style={{ display: 'contents' }}
              >
                <span className="td rank">{i + 1}</span>
                <span className="td team">
                  {r.nickname}
                  {r.participantId === youId && (
                    <span style={{ color: 'var(--chalk-faint)', fontWeight: 400 }}> (sen)</span>
                  )}
                </span>
                <span className="td num">{r.played}</span>
                <span className="td num">{r.won}</span>
                <span className="td num">{r.drawn}</span>
                <span className="td num">{r.lost}</span>
                <span
                  className="td num"
                  style={r.goalDifference > 0 ? { color: 'var(--gold-bright)' } : undefined}
                >
                  {fmtGD(r.goalDifference)}
                </span>
                <span className="td num pts">{r.points}</span>
              </div>
            );
          })}
        </div>
      </div>

      {league.results.length > 0 && (
        <div className="panel">
          <div className="section-label">Sonuçlar</div>
          {[...league.results]
            .reverse()
            .slice(0, 8)
            .map((res, i) => (
              <div key={res.matchId} className="kv-row">
                <span style={{ color: i === 0 && !finished ? 'var(--chalk)' : 'var(--chalk-dim)' }}>
                  {nick(res.homeId)} {res.scoreHome}–{res.scoreAway} {nick(res.awayId)}
                </span>
                <span className="mono">{penaltyLabel(res)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function fmtGD(gd: number): string {
  return gd > 0 ? `+${gd}` : String(gd);
}

function penaltyLabel(res: MatchResult): string {
  if (res.penaltiesHome == null || res.penaltiesAway == null) return '';
  return `pen ${res.penaltiesHome}-${res.penaltiesAway}`;
}
