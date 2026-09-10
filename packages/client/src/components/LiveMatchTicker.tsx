import { useEffect, useRef, useState, type FC } from 'react';
import type { MatchResult, PenaltyShootoutAttempt } from '@fal/shared';

interface LiveMatchTickerProps {
  homeName: string;
  awayName: string;
  result: MatchResult;
  /** Yerel önizlemede kullanıcı "sonraki tura geç" der. Sunucu temposunda verilmez. */
  onComplete?: (result: MatchResult) => void;
  speedMs?: number;
  /**
   * Sunucu maç akışını yönetiyor: "ağaca işle" butonu ve otomatik ilerleme
   * gizlenir, animasyon bitince sadece "maç sonu" gösterilir; sıradaki maça
   * geçişi sunucu `tournament:matchResult` ile tetikler.
   */
  serverPaced?: boolean;
}

const AIMING_PHRASES = [
  'Nefesler tutuldu... Topun arkasına geçti, vuruş geliyor!',
  'Gerildi, gözler hakemde... Vuruş için odaklandı!',
  'Topu beyaz noktaya koydu, stadyumda büyük sessizlik!',
  'Derin bir nefes aldı... Hakem düdüğünü çaldı!',
  'Kaleciyle göz göze geldi... Gerilim dorukta!',
];

const GOAL_PHRASES = [
  'Topu doksana astı!',
  'Kaleciyi ters köşeye yatırdı!',
  'Panenka vuruşuyla kaleciyi çaresiz bıraktı!',
  'İnanılmaz bir soğukkanlılık, top filelerle buluştu!',
  'Kalecinin uzanamayacağı köşeye adeta çivi gibi çaktı!',
  'Ağları adeta sarstı, kusursuz bir penaltı vuruşu!',
  'Örümcek ağlarını temizledi, müthiş bir vuruş!',
  'Kaleci köşeyi tahmin etti ama top o kadar sert ki filelerle buluştu!',
];

const MISS_PHRASES = [
  'Dağa taşa vurdu, top auta gitti!',
  'Direğe nişanladı, inanılmaz bir şanssızlık!',
  'Kaleci devleşti, köşeden müthiş uzandı ve kurtardı!',
  'Çok zayıf bir vuruş, kaleci zorlanmadan kontrol etti!',
  'Kaleci köşeyi kusursuz tahmin etti ve penaltıyı çeldi!',
  'Çerçeveyi bulamadı, top farklı şekilde dışarıda!',
  'Direkten döndü! Büyük talihsizlik!',
];

function getPhrase(list: string[], seedKey: string | number): string {
  const num =
    typeof seedKey === 'number'
      ? seedKey
      : seedKey.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return list[Math.abs(num) % list.length]!;
}

export const LiveMatchTicker: FC<LiveMatchTickerProps> = ({
  homeName,
  awayName,
  result,
  onComplete,
  speedMs = 30,
  serverPaced = false,
}) => {
  const [phase, setPhase] = useState<'regular' | 'shootout' | 'finished'>('regular');
  const [minute, setMinute] = useState(1);
  const [liveHomeScore, setLiveHomeScore] = useState(0);
  const [liveAwayScore, setLiveAwayScore] = useState(0);
  const [tickerLogs, setTickerLogs] = useState<string[]>([]);
  const [latestGoal, setLatestGoal] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);

  // Seri penaltı atışları durumu
  const [currentKickIndex, setCurrentKickIndex] = useState<number>(-1);
  const [kickState, setKickState] = useState<'aiming' | 'revealed'>('aiming');
  const [shootoutHomeScore, setShootoutHomeScore] = useState<number>(0);
  const [shootoutAwayScore, setShootoutAwayScore] = useState<number>(0);
  const [completedAttempts, setCompletedAttempts] = useState<PenaltyShootoutAttempt[]>([]);

  const shootoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const resultRef = useRef(result);
  resultRef.current = result;

  // Hızlı atlama
  const handleSkip = () => {
    if (shootoutTimerRef.current) {
      clearTimeout(shootoutTimerRef.current);
    }
    setMinute(90);
    setLiveHomeScore(result.scoreHome);
    setLiveAwayScore(result.scoreAway);

    if (result.penaltyShootout && result.penaltyShootout.length > 0) {
      setShootoutHomeScore(result.penaltiesHome ?? 0);
      setShootoutAwayScore(result.penaltiesAway ?? 0);
      setCompletedAttempts(result.penaltyShootout);
      setCurrentKickIndex(result.penaltyShootout.length - 1);
      setKickState('revealed');
      const winnerName = result.winnerId === result.homeId ? homeName : awayName;
      setTickerLogs((prev) => [
        `🏆 SERİ PENALTILAR SONUCU: ${homeName} ${result.penaltiesHome} - ${result.penaltiesAway} ${awayName}! (${winnerName} kazandı)`,
        `90' 🏁 90 Dakika Berabere: ${homeName} ${result.scoreHome} - ${result.scoreAway} ${awayName}`,
        ...prev,
      ]);
    } else {
      setTickerLogs((prev) => [
        `90' 🏁 Maç Bitti: ${homeName} ${result.scoreHome} - ${result.scoreAway} ${awayName}`,
        ...prev,
      ]);
    }
    setPhase('finished');
    setIsFinished(true);
  };

  // 90 dakikalık normal süre simülasyonu
  useEffect(() => {
    setPhase('regular');
    setMinute(1);
    setLiveHomeScore(0);
    setLiveAwayScore(0);
    setIsFinished(false);
    setLatestGoal(null);
    setCurrentKickIndex(-1);
    setKickState('aiming');
    setShootoutHomeScore(0);
    setShootoutAwayScore(0);
    setCompletedAttempts([]);
    setTickerLogs([`0' ⏱️ Karşılaşma başladı! ${homeName} vs ${awayName}`]);

    let min = 1;
    let hScore = 0;
    let aScore = 0;

    const timer = setInterval(() => {
      min += 1;
      if (min > 90) {
        clearInterval(timer);
        const shootout = result.penaltyShootout;
        if (shootout && shootout.length > 0) {
          setPhase('shootout');
          setTickerLogs((prev) => [
            `90' ⏱️ 90 Dakika Berabere Bitti (${result.scoreHome} - ${result.scoreAway})! Kazananı SERİ PENALTI ATIŞLARI belirleyecek! 🔥`,
            ...prev,
          ]);
        } else {
          setPhase('finished');
          setIsFinished(true);
          setTickerLogs((prev) => [
            `90' 🏁 Maç Bitti! Sonuç: ${homeName} ${result.scoreHome} - ${result.scoreAway} ${awayName}`,
            ...prev,
          ]);
        }
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

        const teamName = isHome ? homeName : awayName;
        const scorer = goal.playerName ? `${goal.playerName} (${teamName})` : teamName;
        const msg = `⚽ ${min}' GOOOL! ${scorer} topu ağlara gönderdi! (${hScore} - ${aScore})`;
        setLatestGoal(msg);
        setTickerLogs((prev) => [msg, ...prev]);
      }
    }, speedMs);

    return () => {
      clearInterval(timer);
      if (shootoutTimerRef.current) {
        clearTimeout(shootoutTimerRef.current);
      }
    };
  }, [result.matchId, homeName, awayName, result, speedMs]);

  // Heyecanlı seri penaltı atışları adımları (1.5s gerilim beklemesi)
  useEffect(() => {
    if (phase !== 'shootout') return;
    const shootout = result.penaltyShootout;
    if (!shootout || shootout.length === 0) {
      setPhase('finished');
      setIsFinished(true);
      return;
    }

    let active = true;

    const playKick = (index: number) => {
      if (!active) return;
      if (index >= shootout.length) {
        // Tüm atışlar tamamlandı
        const winnerName = result.winnerId === result.homeId ? homeName : awayName;
        setTickerLogs((prev) => [
          `🏆 SERİ PENALTILAR SONUCU: ${homeName} ${result.penaltiesHome} - ${result.penaltiesAway} ${awayName}! Kazanan: ${winnerName}!`,
          ...prev,
        ]);
        setPhase('finished');
        setIsFinished(true);
        return;
      }

      const attempt = shootout[index];
      if (!attempt) return;
      const isHome = attempt.teamId === result.homeId;
      const teamName = isHome ? homeName : awayName;
      const aimText = getPhrase(AIMING_PHRASES, attempt.playerName + index);

      // 1. Oyuncu topun başına geçiyor (Heyecan / Bekleme Aşaması)
      setCurrentKickIndex(index);
      setKickState('aiming');
      setTickerLogs((prev) => [
        `🎯 ${attempt.round}. Penaltı: ${attempt.playerName} (${teamName}) topun başına geçti... ${aimText}`,
        ...prev,
      ]);

      // 1.5 saniyelik heyecan verici bekleme süresi
      shootoutTimerRef.current = setTimeout(() => {
        if (!active) return;

        // 2. Vuruş sonucu açıklanıyor!
        setKickState('revealed');
        setShootoutHomeScore(attempt.scoreHomeAfter);
        setShootoutAwayScore(attempt.scoreAwayAfter);
        setCompletedAttempts((prev) => [...prev, attempt]);

        if (attempt.scored) {
          const goalText = getPhrase(
            GOAL_PHRASES,
            attempt.playerName + index + (attempt.playerId ?? ''),
          );
          setTickerLogs((prev) => [
            `⚽ GOOOL! ${attempt.playerName} (${teamName}) — ${goalText} (${attempt.scoreHomeAfter} - ${attempt.scoreAwayAfter})`,
            ...prev,
          ]);
        } else {
          const missText = getPhrase(
            MISS_PHRASES,
            attempt.playerName + index + (attempt.playerId ?? ''),
          );
          setTickerLogs((prev) => [
            `❌ KAÇIRDI! ${attempt.playerName} (${teamName}) — ${missText} (${attempt.scoreHomeAfter} - ${attempt.scoreAwayAfter})`,
            ...prev,
          ]);
        }

        // Bir sonraki atıcıya geçmeden önce 1.2 saniyelik nefes payı
        shootoutTimerRef.current = setTimeout(() => {
          if (!active) return;
          playKick(index + 1);
        }, 1200);
      }, 1500);
    };

    // 90. dakika düdüğünden sonra penaltılara geçiş esnası (1.2s ara)
    shootoutTimerRef.current = setTimeout(() => {
      playKick(0);
    }, 1200);

    return () => {
      active = false;
      if (shootoutTimerRef.current) {
        clearTimeout(shootoutTimerRef.current);
      }
    };
  }, [phase, result, homeName, awayName]);

  // Otomatik tamamlama (yalnız yerel önizleme — sunucu temposunda değil).
  useEffect(() => {
    if (isFinished && !serverPaced) {
      const autoTimer = setTimeout(() => {
        onCompleteRef.current?.(resultRef.current);
      }, 1500);
      return () => clearTimeout(autoTimer);
    }
  }, [isFinished, serverPaced]);

  const progressPct = Math.min(100, Math.round((minute / 90) * 100));

  const hasShootout = Boolean(result.penaltyShootout && result.penaltyShootout.length > 0);
  const maxShootoutRound = hasShootout
    ? Math.max(5, ...result.penaltyShootout!.map((a) => a.round))
    : 5;
  const shootoutRounds = Array.from({ length: maxShootoutRound }, (_, i) => i + 1);

  const renderPenaltyDots = (teamId: string) => {
    if (!hasShootout) return null;
    const shootout = result.penaltyShootout!;

    return (
      <div className="penalty-dots-row">
        {shootoutRounds.map((rnd) => {
          const attempt = completedAttempts.find((a) => a.teamId === teamId && a.round === rnd);
          const activeKick =
            phase === 'shootout' && currentKickIndex >= 0 ? shootout[currentKickIndex] : undefined;
          const isCurrent =
            activeKick !== undefined && activeKick.teamId === teamId && activeKick.round === rnd;

          let dotClass = 'penalty-dot pending';
          let dotLabel = '•';

          if (attempt) {
            if (attempt.scored) {
              dotClass = 'penalty-dot scored';
              dotLabel = '✓';
            } else {
              dotClass = 'penalty-dot missed';
              dotLabel = '✕';
            }
          } else if (isCurrent) {
            dotClass = 'penalty-dot active';
            dotLabel = '⚽';
          }

          return (
            <div
              key={rnd}
              className={dotClass}
              title={
                attempt
                  ? `${attempt.playerName}: ${attempt.scored ? 'Gol' : 'Kaçtı'}`
                  : isCurrent
                    ? 'Vuruş yapılıyor...'
                    : `${rnd}. Penaltı`
              }
            >
              {dotLabel}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="card"
      style={{
        background: 'linear-gradient(145deg, #131d27 0%, #0d1117 100%)',
        border:
          phase === 'shootout'
            ? '1px solid var(--accent-gold)'
            : isFinished
              ? '1px solid var(--accent-green, #10b981)'
              : '1px solid var(--accent-gold)',
        boxShadow:
          phase === 'shootout'
            ? '0 0 24px rgba(245, 158, 11, 0.3)'
            : '0 0 20px var(--accent-gold-glow, rgba(201, 151, 74, 0.2))',
        padding: 24,
        marginBottom: 24,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <span
          style={{
            backgroundColor:
              phase === 'shootout'
                ? 'rgba(245, 158, 11, 0.3)'
                : isFinished
                  ? 'rgba(16, 185, 129, 0.2)'
                  : 'rgba(245, 158, 11, 0.2)',
            color:
              phase === 'shootout'
                ? 'var(--accent-gold)'
                : isFinished
                  ? 'var(--accent-green, #10b981)'
                  : 'var(--accent-gold)',
            padding: '4px 14px',
            borderRadius: 16,
            fontSize: '0.8rem',
            fontWeight: 800,
            letterSpacing: 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {phase === 'shootout' ? (
            <>
              <span className="live-pulse-dot" />⚡ SERİ PENALTI ATIŞLARI
            </>
          ) : isFinished ? (
            '✓ MAÇ TAMAMLANDI'
          ) : (
            '● CANLI MAÇ OYNANIYOR'
          )}
        </span>

        {!isFinished && (
          <button
            onClick={handleSkip}
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              padding: '4px 12px',
              fontSize: '0.8rem',
              border: '1px solid var(--border-color)',
              cursor: 'pointer',
              borderRadius: 6,
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
          margin: '16px 0',
        }}
      >
        <div style={{ textAlign: 'right' }}>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>{homeName}</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>EV SAHİBİ</span>
          {hasShootout && renderPenaltyDots(result.homeId)}
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
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
            }}
          >
            {liveHomeScore} - {liveAwayScore}
          </div>

          <div
            style={{
              fontSize: '0.95rem',
              color: 'var(--accent-gold)',
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            {phase === 'shootout'
              ? `Penaltılar: ${shootoutHomeScore} - ${shootoutAwayScore}`
              : isFinished
                ? "Maç Sonu (90')"
                : `Dakika: ${minute}'`}
          </div>
        </div>

        <div style={{ textAlign: 'left' }}>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>{awayName}</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>DEPLASMAN</span>
          {hasShootout && renderPenaltyDots(result.awayId)}
        </div>
      </div>

      {/* Normal Süre İlerleme Çubuğu */}
      {phase === 'regular' && (
        <div
          style={{
            height: 6,
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: 3,
            overflow: 'hidden',
            margin: '16px 0',
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              backgroundColor: 'var(--accent-green, #10b981)',
              transition: 'width 0.1s linear',
            }}
          />
        </div>
      )}

      {/* Canlı Seri Penaltı Vuruşu Kartı */}
      {phase === 'shootout' &&
        currentKickIndex >= 0 &&
        currentKickIndex < (result.penaltyShootout?.length ?? 0) &&
        (() => {
          const currentAttempt = result.penaltyShootout?.[currentKickIndex];
          if (!currentAttempt) return null;
          const isHome = currentAttempt.teamId === result.homeId;
          const kickerTeamName = isHome ? homeName : awayName;

          return (
            <div
              className={`penalty-active-card ${
                kickState === 'revealed'
                  ? currentAttempt.scored
                    ? 'is-goal'
                    : 'is-miss'
                  : 'is-aiming'
              }`}
            >
              <div className="penalty-active-header">
                <span className="penalty-round-badge">{currentAttempt.round}. SERİ PENALTI</span>
                <span className="penalty-team-tag">{kickerTeamName}</span>
              </div>
              <div className="penalty-kicker-name">⚽ {currentAttempt.playerName}</div>
              <div className="penalty-status-message">
                {kickState === 'aiming' ? (
                  <span className="penalty-aiming-text">
                    <span className="pulse-indicator">●</span>{' '}
                    {getPhrase(AIMING_PHRASES, currentAttempt.playerName + currentKickIndex)}
                  </span>
                ) : currentAttempt.scored ? (
                  <span className="penalty-goal-text">
                    ⚽ GOOOL!{' '}
                    {getPhrase(
                      GOAL_PHRASES,
                      currentAttempt.playerName +
                        currentKickIndex +
                        (currentAttempt.playerId ?? ''),
                    )}
                  </span>
                ) : (
                  <span className="penalty-miss-text">
                    ❌ KAÇIRDI!{' '}
                    {getPhrase(
                      MISS_PHRASES,
                      currentAttempt.playerName +
                        currentKickIndex +
                        (currentAttempt.playerId ?? ''),
                    )}
                  </span>
                )}
              </div>
            </div>
          );
        })()}

      {/* Penaltı Sonucu Özeti (Maç bittiğinde) */}
      {isFinished && hasShootout && (
        <div className="penalty-final-banner">
          <span style={{ fontSize: '1.4rem' }}>🏆</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
              Penaltı Atışları: {homeName} {result.penaltiesHome} - {result.penaltiesAway}{' '}
              {awayName}
            </div>
            <div
              style={{
                fontSize: '0.82rem',
                color: 'var(--accent-green, #10b981)',
                marginTop: 2,
              }}
            >
              ✓ {result.winnerId === result.homeId ? homeName : awayName} penaltılar sonucunda galip
              geldi!
            </div>
          </div>
        </div>
      )}

      {/* Son Gol Anonsu (Normal süre boyunca) */}
      {latestGoal && phase === 'regular' && (
        <div
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid var(--accent-gold)',
            color: 'var(--accent-gold)',
            padding: '8px 16px',
            borderRadius: 8,
            textAlign: 'center',
            fontWeight: 700,
            marginBottom: 12,
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
          gap: 6,
          marginTop: 12,
        }}
      >
        {tickerLogs.slice(0, 4).map((log, idx) => (
          <div
            key={idx}
            style={{
              fontSize: '0.85rem',
              color: idx === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {log}
          </div>
        ))}
      </div>

      {/* Devam Butonu — yalnız yerel önizlemede */}
      {isFinished && !serverPaced && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            onClick={() => onCompleteRef.current?.(resultRef.current)}
            style={{
              backgroundColor: 'var(--accent-green, #10b981)',
              color: '#000',
              fontWeight: 800,
              padding: '10px 24px',
              fontSize: '0.95rem',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Ağaca İşle ve Sonraki Tura Geç ✓
          </button>
        </div>
      )}
      {isFinished && serverPaced && (
        <div
          style={{
            textAlign: 'center',
            marginTop: 16,
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
          }}
        >
          Sonraki maç birazdan…
        </div>
      )}
    </div>
  );
};
