import { useEffect, useRef, useState, type FC } from 'react';
import type { MatchResult } from '@fal/shared';

interface LiveMatchTickerProps {
  homeName: string;
  awayName: string;
  result: MatchResult;
  onComplete: (result: MatchResult) => void;
  speedMs?: number;
}

export const LiveMatchTicker: FC<LiveMatchTickerProps> = ({
  homeName,
  awayName,
  result,
  onComplete,
  speedMs = 30
}) => {
  const [minute, setMinute] = useState(1);
  const [liveHomeScore, setLiveHomeScore] = useState(0);
  const [liveAwayScore, setLiveAwayScore] = useState(0);
  const [tickerLogs, setTickerLogs] = useState<string[]>([]);
  const [latestGoal, setLatestGoal] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const resultRef = useRef(result);
  resultRef.current = result;

  // Hızlı atlama
  const handleSkip = () => {
    setMinute(90);
    setLiveHomeScore(result.scoreHome);
    setLiveAwayScore(result.scoreAway);
    setIsFinished(true);
    setTickerLogs((prev) => [
      `90' 🏁 Maç Bitti: ${homeName} ${result.scoreHome} - ${result.scoreAway} ${awayName}`,
      ...prev
    ]);
  };

  useEffect(() => {
    setMinute(1);
    setLiveHomeScore(0);
    setLiveAwayScore(0);
    setIsFinished(false);
    setLatestGoal(null);
    setTickerLogs([`0' ⏱️ Karşılaşma başladı! ${homeName} vs ${awayName}`]);

    let min = 1;
    let hScore = 0;
    let aScore = 0;

    const timer = setInterval(() => {
      min += 1;
      if (min > 90) {
        clearInterval(timer);
        setIsFinished(true);
        setTickerLogs((prev) => [
          `90' 🏁 Maç Bitti! Sonuç: ${homeName} ${result.scoreHome} - ${result.scoreAway} ${awayName}`,
          ...prev
        ]);
        return;
      }

      setMinute(min);

      const goal = result.events.find((e) => e.minute === min && e.type === 'goal');
      if (goal) {
        const isHome = goal.teamId === result.homeId;
        if (isHome) hScore += 1;
        else aScore += 1;

        setLiveHomeScore(hScore);
        setLiveAwayScore(aScore);

        const scorer = isHome ? homeName : awayName;
        const msg = `⚽ ${min}' GOOOL! ${scorer} golü buldu! (${hScore} - ${aScore})`;
        setLatestGoal(msg);
        setTickerLogs((prev) => [msg, ...prev]);
      }
    }, speedMs);

    return () => clearInterval(timer);
  }, [result.matchId, homeName, awayName, result, speedMs]);

  // Otomatik tamamlama
  useEffect(() => {
    if (isFinished) {
      const autoTimer = setTimeout(() => {
        onCompleteRef.current(resultRef.current);
      }, 1500);
      return () => clearTimeout(autoTimer);
    }
  }, [isFinished]);

  const progressPct = Math.min(100, Math.round((minute / 90) * 100));

  return (
    <div
      className="card"
      style={{
        background: 'linear-gradient(145deg, #131d27 0%, #0d1117 100%)',
        border: '1px solid var(--accent-gold)',
        boxShadow: '0 0 20px var(--accent-gold-glow)',
        padding: 24,
        marginBottom: 24
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span
          style={{
            backgroundColor: isFinished ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
            color: isFinished ? 'var(--accent-green)' : 'var(--accent-gold)',
            padding: '4px 12px',
            borderRadius: 16,
            fontSize: '0.8rem',
            fontWeight: 700,
            letterSpacing: 1
          }}
        >
          {isFinished ? '✓ MAÇ TAMAMLANDI' : '● CANLI MAÇ OYNANIYOR'}
        </span>

        {!isFinished && (
          <button
            onClick={handleSkip}
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              padding: '4px 12px',
              fontSize: '0.8rem',
              border: '1px solid var(--border-color)'
            }}
          >
            ⏩ Sonuca Git
          </button>
        )}
      </div>

      {/* Büyük Canlı Skor Tabelası */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 20,
          margin: '16px 0'
        }}
      >
        <div style={{ textAlign: 'right' }}>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{homeName}</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>EV SAHİBİ</span>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: '2.8rem',
              fontWeight: 900,
              letterSpacing: 4,
              backgroundColor: 'var(--bg-tertiary)',
              padding: '6px 28px',
              borderRadius: 12,
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
            }}
          >
            {liveHomeScore} - {liveAwayScore}
          </div>
          <div style={{ fontSize: '0.95rem', color: 'var(--accent-gold)', fontWeight: 700, marginTop: 6 }}>
            {isFinished ? 'Maç Sonu (90\')' : `Dakika: ${minute}'`}
          </div>
        </div>

        <div style={{ textAlign: 'left' }}>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{awayName}</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>DEPLASMAN</span>
        </div>
      </div>

      {/* Penaltı Sonucu */}
      {isFinished && result.penaltiesHome !== undefined && (
        <div
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.2)',
            border: '1px solid var(--accent-gold)',
            borderRadius: 8,
            padding: '8px 16px',
            textAlign: 'center',
            color: 'var(--accent-gold)',
            fontWeight: 800,
            marginBottom: 12
          }}
        >
          ⚽ Beraberlik Sonrası Penaltı Atışları: {result.penaltiesHome} - {result.penaltiesAway}
        </div>
      )}

      {/* İlerleme Çubuğu */}
      <div style={{ height: 6, backgroundColor: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden', margin: '16px 0' }}>
        <div
          style={{
            width: `${progressPct}%`,
            height: '100%',
            backgroundColor: 'var(--accent-green)',
            transition: 'width 0.1s linear'
          }}
        />
      </div>

      {/* Son Gol Anonsu */}
      {latestGoal && (
        <div
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid var(--accent-gold)',
            color: 'var(--accent-gold)',
            padding: '8px 16px',
            borderRadius: 8,
            textAlign: 'center',
            fontWeight: 700,
            marginBottom: 12
          }}
        >
          {latestGoal}
        </div>
      )}

      {/* Canlı Anlatım Akışı */}
      <div
        style={{
          maxHeight: 120,
          overflowY: 'auto',
          backgroundColor: 'var(--bg-tertiary)',
          borderRadius: 8,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}
      >
        {tickerLogs.slice(0, 4).map((log, idx) => (
          <div key={idx} style={{ fontSize: '0.85rem', color: idx === 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
            {log}
          </div>
        ))}
      </div>

      {/* Devam Butonu */}
      {isFinished && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            onClick={() => onCompleteRef.current(resultRef.current)}
            style={{
              backgroundColor: 'var(--accent-green)',
              color: '#000',
              fontWeight: 800,
              padding: '10px 24px',
              fontSize: '0.95rem'
            }}
          >
            Ağaca İşle ve Sonraki Tura Geç ✓
          </button>
        </div>
      )}
    </div>
  );
};
