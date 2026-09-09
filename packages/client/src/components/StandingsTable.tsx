import type { FC } from 'react';
import type { StandingRow } from '@fal/shared';

interface StandingsTableProps {
  standings: StandingRow[];
  myParticipantId?: string;
  title?: string;
}

export const StandingsTable: FC<StandingsTableProps> = ({
  standings,
  myParticipantId,
  title = 'Lig Puan Tablosu'
}) => {
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📊</span> {title}
        </h2>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {standings.length} Takım
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.95rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
            <th style={{ padding: '10px 8px', width: 48, textAlign: 'center' }}>#</th>
            <th style={{ padding: '10px 8px' }}>Takım / Oyuncu</th>
            <th style={{ padding: '10px 8px', width: 44, textAlign: 'center' }} title="Oynanan Maç">O</th>
            <th style={{ padding: '10px 8px', width: 44, textAlign: 'center' }} title="Galibiyet">G</th>
            <th style={{ padding: '10px 8px', width: 44, textAlign: 'center' }} title="Beraberlik">B</th>
            <th style={{ padding: '10px 8px', width: 44, textAlign: 'center' }} title="Mağlubiyet">M</th>
            <th style={{ padding: '10px 8px', width: 48, textAlign: 'center' }} title="Atılan Gol">AG</th>
            <th style={{ padding: '10px 8px', width: 48, textAlign: 'center' }} title="Yenen Gol">YG</th>
            <th style={{ padding: '10px 8px', width: 52, textAlign: 'center' }} title="Averaj">AV</th>
            <th style={{ padding: '10px 8px', width: 64, textAlign: 'center', fontWeight: 700 }} title="Puan">Puan</th>
          </tr>
        </thead>
        <tbody>
          {standings.length === 0 ? (
            <tr>
              <td colSpan={10} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                Henüz lig maçı oynanmadı.
              </td>
            </tr>
          ) : (
            standings.map((row, index) => {
              const isMe = row.participantId === myParticipantId;
              const isLeader = index === 0;
              const isSecond = index === 1;
              const isThird = index === 2;

              return (
                <tr
                  key={row.participantId}
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    backgroundColor: isMe ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                    fontWeight: isMe ? 600 : 400
                  }}
                >
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                    {isLeader && <span style={{ color: 'var(--accent-gold)' }}>🥇</span>}
                    {isSecond && <span>🥈</span>}
                    {isThird && <span>🥉</span>}
                    {!isLeader && !isSecond && !isThird && <span style={{ color: 'var(--text-muted)' }}>{index + 1}</span>}
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: isMe ? 'var(--accent-green)' : 'inherit' }}>
                        {row.nickname}
                      </span>
                      {isMe && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '2px 6px',
                            borderRadius: 4,
                            backgroundColor: 'var(--accent-green)',
                            color: '#000',
                            fontWeight: 700
                          }}
                        >
                          SEN
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>{row.played}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>{row.won}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>{row.drawn}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>{row.lost}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>{row.goalsFor}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>{row.goalsAgainst}</td>
                  <td
                    style={{
                      padding: '12px 8px',
                      textAlign: 'center',
                      color:
                        row.goalDifference > 0
                          ? 'var(--accent-green)'
                          : row.goalDifference < 0
                            ? 'var(--danger-color)'
                            : 'inherit'
                    }}
                  >
                    {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 700, fontSize: '1.05rem', color: 'var(--accent-green)' }}>
                    {row.points}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
