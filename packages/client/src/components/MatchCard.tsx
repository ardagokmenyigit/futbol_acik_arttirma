import { useState, type FC } from 'react';
import type { MatchResult } from '@fal/shared';

interface MatchCardProps {
  matchIndex: number;
  homeName: string;
  awayName: string;
  result?: MatchResult;
  isLive?: boolean;
}

export const MatchCard: FC<MatchCardProps> = ({
  matchIndex,
  homeName,
  awayName,
  result,
  isLive = false,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const isFinished = Boolean(result);

  return (
    <div
      className="card"
      style={{
        marginBottom: 12,
        borderLeft: isLive
          ? '4px solid var(--accent-gold)'
          : isFinished
            ? '4px solid var(--accent-green)'
            : '4px solid var(--border-color)',
        transition: 'all 0.2s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
          MAÇ #{matchIndex}
        </span>
        {isLive && (
          <span
            style={{
              fontSize: '0.75rem',
              backgroundColor: 'rgba(245, 158, 11, 0.2)',
              color: 'var(--accent-gold)',
              padding: '2px 8px',
              borderRadius: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: 'var(--accent-gold)',
              }}
            />
            OYNANIYOR
          </span>
        )}
        {isFinished && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MAÇ SONUCU</span>
        )}
        {!isLive && !isFinished && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>BEKLİYOR</span>
        )}
      </div>

      {/* Skor ve Takımlar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 16,
          padding: '8px 0',
        }}
      >
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontWeight: 600, fontSize: '1.05rem' }}>{homeName}</span>
        </div>

        <div
          style={{
            padding: '4px 16px',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: 8,
            fontWeight: 800,
            fontSize: '1.25rem',
            letterSpacing: 2,
          }}
        >
          {isFinished ? `${result?.scoreHome} - ${result?.scoreAway}` : 'VS'}
        </div>

        <div style={{ textAlign: 'left' }}>
          <span style={{ fontWeight: 600, fontSize: '1.05rem' }}>{awayName}</span>
        </div>
      </div>

      {/* Goller ve Olaylar Özeti */}
      {result && result.events.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              ⚽ {result.events.length} Gol Kaydedildi
            </span>
            <button
              onClick={() => setShowDetails(!showDetails)}
              style={{
                background: 'transparent',
                color: 'var(--accent-green)',
                fontSize: '0.8rem',
                padding: '2px 6px',
              }}
            >
              {showDetails ? 'Detayları Gizle ▲' : 'Golleri Gör ▼'}
            </button>
          </div>

          {showDetails && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {result.events.map((evt, idx) => {
                const teamName = evt.teamId === result.homeId ? homeName : awayName;
                return (
                  <div
                    key={idx}
                    style={{
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span style={{ color: 'var(--accent-gold)', fontWeight: 700, width: 28 }}>
                      {evt.minute}&apos;
                    </span>
                    <span>⚽ Gol!</span>
                    <span style={{ fontWeight: 600 }}>{teamName}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
