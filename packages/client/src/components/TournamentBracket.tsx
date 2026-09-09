import type { FC } from 'react';
import type { TournamentMatch, TournamentRound, TournamentState } from '@fal/shared';

interface TournamentBracketProps {
  tournament: TournamentState;
  getTeamName: (id: string | null, placeholder?: string) => string;
  onSimulateMatch: (match: TournamentMatch) => void;
  isSimulating?: boolean;
}

export const TournamentBracket: FC<TournamentBracketProps> = ({
  tournament,
  getTeamName,
  onSimulateMatch,
  isSimulating = false
}) => {
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          gap: 32,
          minWidth: tournament.size === 8 ? 950 : 650,
          justifyContent: 'center',
          alignItems: 'stretch'
        }}
      >
        {tournament.rounds.map((round: TournamentRound, roundIdx) => {
          const isFinal = roundIdx === tournament.rounds.length - 1;

          return (
            <div
              key={round.name}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {/* Tur Başlığı */}
              <div
                style={{
                  textAlign: 'center',
                  padding: '8px 12px',
                  backgroundColor: isFinal ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-secondary)',
                  border: isFinal ? '1px solid var(--accent-gold)' : '1px solid var(--border-color)',
                  borderRadius: 8,
                  marginBottom: 20,
                  fontWeight: 800,
                  color: isFinal ? 'var(--accent-gold)' : 'var(--text-primary)',
                  fontSize: '0.95rem',
                  letterSpacing: 1
                }}
              >
                {isFinal ? '🏆 ' : ''}{round.title.toUpperCase()}
              </div>

              {/* Maç Kartları */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-around',
                  flex: 1,
                  gap: 20
                }}
              >
                {round.matches.map((match) => {
                  const isCurrent = tournament.currentMatchId === match.matchId;
                  const hasResult = Boolean(match.result);
                  const isReadyToPlay = !hasResult && Boolean(match.homeId && match.awayId);

                  const homeName = getTeamName(match.homeId, match.homePlaceholder);
                  const awayName = getTeamName(match.awayId, match.awayPlaceholder);

                  const isHomeWinner = match.result?.winnerId === match.homeId;
                  const isAwayWinner = match.result?.winnerId === match.awayId;

                  return (
                    <div
                      key={match.matchId}
                      className="card"
                      style={{
                        padding: 12,
                        position: 'relative',
                        border: isCurrent
                          ? '2px solid var(--accent-gold)'
                          : hasResult
                            ? '1px solid var(--border-color)'
                            : '1px dashed var(--border-color)',
                        boxShadow: isCurrent ? '0 0 15px var(--accent-gold-glow)' : 'none',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {/* Üst Bilgi Rozeti */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.75rem',
                          marginBottom: 8,
                          color: 'var(--text-secondary)'
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{match.matchId.toUpperCase()}</span>
                        {isCurrent && (
                          <span
                            style={{
                              color: 'var(--accent-gold)',
                              fontWeight: 700,
                              backgroundColor: 'rgba(245, 158, 11, 0.2)',
                              padding: '1px 6px',
                              borderRadius: 4
                            }}
                          >
                            SIRADAKİ MAÇ ⚡
                          </span>
                        )}
                        {hasResult && <span style={{ color: 'var(--accent-green)' }}>TAMAMLANDI ✓</span>}
                      </div>

                      {/* Ev Sahibi Takım Satırı */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 8px',
                          borderRadius: 6,
                          backgroundColor: isHomeWinner ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                          fontWeight: isHomeWinner ? 700 : 400,
                          marginBottom: 4
                        }}
                      >
                        <span
                          style={{
                            color: isHomeWinner
                              ? 'var(--accent-green)'
                              : match.homeId
                                ? 'inherit'
                                : 'var(--text-muted)',
                            fontSize: '0.9rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 160
                          }}
                        >
                          {homeName}
                        </span>
                        <span style={{ fontWeight: 800, fontSize: '1rem', marginLeft: 8 }}>
                          {hasResult ? match.result?.scoreHome : '-'}
                        </span>
                      </div>

                      {/* Deplasman Takım Satırı */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 8px',
                          borderRadius: 6,
                          backgroundColor: isAwayWinner ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                          fontWeight: isAwayWinner ? 700 : 400
                        }}
                      >
                        <span
                          style={{
                            color: isAwayWinner
                              ? 'var(--accent-green)'
                              : match.awayId
                                ? 'inherit'
                                : 'var(--text-muted)',
                            fontSize: '0.9rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 160
                          }}
                        >
                          {awayName}
                        </span>
                        <span style={{ fontWeight: 800, fontSize: '1rem', marginLeft: 8 }}>
                          {hasResult ? match.result?.scoreAway : '-'}
                        </span>
                      </div>

                      {/* Penaltı Bilgisi */}
                      {match.result?.penaltiesHome !== undefined && (
                        <div
                          style={{
                            fontSize: '0.75rem',
                            textAlign: 'center',
                            marginTop: 6,
                            color: 'var(--accent-gold)',
                            fontWeight: 600
                          }}
                        >
                          Penaltılar: {match.result.penaltiesHome} - {match.result.penaltiesAway}
                        </div>
                      )}

                      {/* Oyna / Simüle Et Butonu */}
                      {isReadyToPlay && (
                        <button
                          onClick={() => onSimulateMatch(match)}
                          disabled={isSimulating}
                          style={{
                            width: '100%',
                            marginTop: 8,
                            padding: '8px 0',
                            backgroundColor: isCurrent ? 'var(--accent-gold)' : 'var(--accent-green)',
                            color: '#000',
                            fontWeight: 800,
                            fontSize: '0.85rem'
                          }}
                        >
                          {isSimulating ? 'Simüle Ediliyor...' : '▶ Bu Maçı Simüle Et'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
