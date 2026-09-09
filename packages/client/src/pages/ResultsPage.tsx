import type { ReactNode } from 'react';
import type { MatchResult, RoomState, StandingRow } from '@fal/shared';
import { leaveRoom } from '../lib/roomClient.js';
import { clearSession } from '../lib/session.js';
import { useRoomStore } from '../store.js';

interface Props {
  room: RoomState;
}

const GRID = '22px 1fr repeat(6, 24px)';

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
      <div className="stack">
        <div>
          <div className="kicker">Draft tamamlandı</div>
          <h1>Lig hazırlanıyor</h1>
        </div>
        <div className="panel">
          <p className="muted">Fikstür oluşturuluyor, maçlar birazdan başlıyor…</p>
        </div>
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
      <div>
        <div className="kicker">{finished ? 'Sezon sonu' : `Maç ${played}/${total}`}</div>
        <h1>{finished ? 'Puan Tablosu' : 'Lig oynanıyor'}</h1>
      </div>

      {finished && champRow && (
        <div className="champion">
          <div className="champion-inner">
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--gold)"
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
            <div className="display" style={{ fontSize: '1.4rem', color: 'var(--gold)' }}>
              Şampiyon — {champRow.nickname}
            </div>
            <div className="kicker">
              {champRow.points} Puan · {fmtGD(champRow.goalDifference)} Averaj
            </div>
            <button className="primary" style={{ marginTop: 6 }} onClick={newGame}>
              Yeni oyun
            </button>
          </div>
        </div>
      )}

      {!finished && latest && (
        <div className="scoreline">
          <div className="home">
            <div className="kicker">{nick(latest.homeId)}</div>
            <div className="score">{latest.scoreHome}</div>
          </div>
          <div className="sep" />
          <div className="away">
            <div className="kicker">{nick(latest.awayId)}</div>
            <div className="score">{latest.scoreAway}</div>
          </div>
        </div>
      )}

      <div className="panel">
        <label>Puan durumu</label>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '8px 4px' }}>
          {['#', 'Takım', 'O', 'G', 'B', 'M', 'AV', 'P'].map((h, i) => (
            <span
              key={h}
              className="kicker"
              style={{ fontSize: '0.68rem', textAlign: i > 1 ? 'center' : 'left' }}
            >
              {h}
            </span>
          ))}
        </div>
        {league.standings.map((r, i) => (
          <StandingRowView
            key={r.participantId}
            row={r}
            rank={i + 1}
            you={r.participantId === youId}
          />
        ))}
      </div>

      {league.results.length > 0 && (
        <div className="panel">
          <label>Sonuçlar</label>
          {[...league.results]
            .reverse()
            .slice(0, 8)
            .map((res, i) => (
              <div key={res.matchId} className="hist-row" style={{ padding: '3px 0' }}>
                <span className={i === 0 && !finished ? undefined : 'muted'}>
                  {nick(res.homeId)} {res.scoreHome}–{res.scoreAway} {nick(res.awayId)}
                </span>
                <span className="muted">{penaltyLabel(res)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function StandingRowView({ row, rank, you }: { row: StandingRow; rank: number; you: boolean }) {
  const leader = rank === 1;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        gap: '8px 4px',
        alignItems: 'center',
        fontSize: '0.88rem',
        marginTop: 6,
        padding: '8px 6px',
        borderRadius: 8,
        background: leader
          ? 'linear-gradient(90deg, rgba(62,240,138,.18), rgba(62,240,138,0))'
          : undefined,
        border: leader ? '1px solid rgba(62,240,138,.35)' : '1px solid transparent',
      }}
    >
      <span
        className="display"
        style={{ color: leader ? 'var(--accent)' : 'var(--muted)', fontSize: '0.95rem' }}
      >
        {rank}
      </span>
      <span style={{ fontWeight: leader || you ? 700 : 500 }}>
        {row.nickname}
        {you && <span className="muted"> (sen)</span>}
      </span>
      <Cell>{row.played}</Cell>
      <Cell>{row.won}</Cell>
      <Cell>{row.drawn}</Cell>
      <Cell>{row.lost}</Cell>
      <Cell accent={row.goalDifference > 0}>{fmtGD(row.goalDifference)}</Cell>
      <span className="display" style={{ textAlign: 'center', fontSize: '0.95rem' }}>
        {row.points}
      </span>
    </div>
  );
}

function Cell({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span style={{ textAlign: 'center', color: accent ? 'var(--accent)' : 'var(--muted)' }}>
      {children}
    </span>
  );
}

function fmtGD(gd: number): string {
  return gd > 0 ? `+${gd}` : String(gd);
}

function penaltyLabel(res: MatchResult): string {
  if (res.penaltiesHome == null || res.penaltiesAway == null) return '';
  return `pen ${res.penaltiesHome}-${res.penaltiesAway}`;
}
