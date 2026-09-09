import type { FC } from 'react';
import type { StandingRow } from '@fal/shared';

interface ChampionCelebrationProps {
  championRow: StandingRow;
  isMe?: boolean;
  onReset?: () => void;
}

export const ChampionCelebration: FC<ChampionCelebrationProps> = ({
  championRow,
  isMe = false,
  onReset
}) => {
  return (
    <div
      className="card"
      style={{
        textAlign: 'center',
        padding: '40px 24px',
        background: 'radial-gradient(circle at center, #2e260e 0%, #161b22 100%)',
        border: '2px solid var(--accent-gold)',
        boxShadow: '0 0 30px var(--accent-gold-glow)',
        marginBottom: 24
      }}
    >
      <div style={{ fontSize: '4rem', marginBottom: 8, animation: 'bounce 1.5s infinite' }}>
        🏆
      </div>

      <span
        style={{
          textTransform: 'uppercase',
          letterSpacing: 2,
          fontSize: '0.85rem',
          color: 'var(--accent-gold)',
          fontWeight: 700
        }}
      >
        LİG ŞAMPİYONU
      </span>

      <h1 style={{ fontSize: '2.4rem', fontWeight: 900, margin: '8px 0', color: '#fff' }}>
        {championRow.nickname}
      </h1>

      {isMe ? (
        <div
          style={{
            display: 'inline-block',
            backgroundColor: 'var(--accent-green)',
            color: '#000',
            padding: '6px 16px',
            borderRadius: 20,
            fontWeight: 800,
            fontSize: '0.95rem',
            marginBottom: 16
          }}
        >
          🎉 TEBRİKLER! KUPAYI KAZANDIN! 🎉
        </div>
      ) : (
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
          Sezonu zirvede tamamlayarak şampiyonluk kupasını kaldırdı!
        </p>
      )}

      {/* Şampiyon İstatistikleri */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 24,
          margin: '20px auto',
          maxWidth: 400,
          padding: 16,
          backgroundColor: 'rgba(0,0,0,0.3)',
          borderRadius: 12
        }}
      >
        <div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-gold)' }}>
            {championRow.points}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>PUAN</div>
        </div>
        <div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
            {championRow.won}G {championRow.drawn}B {championRow.lost}M
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>PERFORMANS</div>
        </div>
        <div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-green)' }}>
            {championRow.goalDifference > 0 ? `+${championRow.goalDifference}` : championRow.goalDifference}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>AVERAJ</div>
        </div>
      </div>

      {onReset && (
        <button
          onClick={onReset}
          style={{
            marginTop: 12,
            backgroundColor: 'var(--accent-gold)',
            color: '#000',
            fontWeight: 700,
            padding: '12px 28px',
            fontSize: '1rem'
          }}
        >
          Lobiye Dön / Yeni Sezon
        </button>
      )}
    </div>
  );
};
