import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import {
  SHOOTOUT_CHOOSE_MS,
  type MatchResult,
  type PenaltyDirection,
  type PenaltyShootoutAttempt,
  type ShootoutState,
} from '@fal/shared';
import { PenaltyScene } from './PenaltyScene.js';

interface LiveMatchTickerProps {
  homeName: string;
  awayName: string;
  homePower?: number | null;
  awayPower?: number | null;
  roundTitle?: string;
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
  /**
   * CANLI SERİ PENALTI (sunucu güdümlü). `result.pendingShootout` iken seri
   * burada oynanmaz; sunucunun her vuruşta yayınladığı durum gelir, taraflar
   * köşe seçer (`onChoose`). Bot–bot / önizleme maçlarında `result.penaltyShootout`
   * hazır gelir ve seri senaryolu oynatılır.
   */
  shootout?: ShootoutState | null;
  /** Bu istemcinin katılımcı id'si — seride rolünü belirler. */
  youId?: string | null;
  /** Köşe seçimini sunucuya gönderir; reddedilirse reject olur. */
  onChoose?: (kickIndex: number, direction: PenaltyDirection) => Promise<unknown>;
  /** Maçın sunucudaki başlangıç anı — yeniden bağlanınca dakika buradan türer. */
  startedAt?: number;
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
  'İnanılmaz bir soğukkanlılık, top filelerle buluştu!',
  'Kalecinin uzanamayacağı köşeye adeta çivi gibi çaktı!',
  'Ağları adeta sarstı, kusursuz bir penaltı vuruşu!',
  'Örümcek ağlarını temizledi, müthiş bir vuruş!',
];

/** Kaleci köşeyi bildi ama top yine de girdi. */
const GOAL_SAME_SIDE_PHRASES = [
  'Kaleci köşeyi tahmin etti ama top o kadar sert ki filelerle buluştu!',
  'Doğru tarafa uzandı, yine de yetişemedi — top fileye gitti!',
  'Eldivenine sürdü ama engelleyemedi, GOL!',
];

const SAVE_PHRASES = [
  'Kaleci devleşti, köşeden müthiş uzandı ve kurtardı!',
  'Kaleci köşeyi kusursuz tahmin etti ve penaltıyı çeldi!',
  'Doğru köşeye yattı, topu eldivenleriyle uzaklaştırdı!',
  'Çok zayıf bir vuruş, kaleci zorlanmadan kontrol etti!',
];

const MISS_PHRASES = [
  'Dağa taşa vurdu, top auta gitti!',
  'Direğe nişanladı, inanılmaz bir şanssızlık!',
  'Çerçeveyi bulamadı, top dışarıda!',
  'Direkten döndü! Büyük talihsizlik!',
  'Topun altına girdi, üstten aut!',
];

const DIR_LABEL: Record<PenaltyDirection, string> = { left: 'sol', center: 'orta', right: 'sağ' };

function getPhrase(list: string[], seedKey: string | number): string {
  const num =
    typeof seedKey === 'number'
      ? seedKey
      : seedKey.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return list[Math.abs(num) % list.length]!;
}

/** Açıklanan vuruşun anlatım satırı (her iki modda ortak). */
function describeKick(attempt: PenaltyShootoutAttempt, teamName: string, idx: number): string {
  const key = attempt.playerName + idx + (attempt.playerId ?? '');
  const corners = `(vuruş ${DIR_LABEL[attempt.shotDirection]} · kaleci ${DIR_LABEL[attempt.keeperDirection]})`;
  const score = `(${attempt.scoreHomeAfter} - ${attempt.scoreAwayAfter})`;
  if (attempt.outcome === 'goal') {
    const same = attempt.shotDirection === attempt.keeperDirection;
    const text = getPhrase(same ? GOAL_SAME_SIDE_PHRASES : GOAL_PHRASES, key);
    return `⚽ GOOOL! ${attempt.playerName} (${teamName}) — ${text} ${corners} ${score}`;
  }
  if (attempt.outcome === 'saved') {
    const keeper = attempt.keeperName ? `${attempt.keeperName} ` : 'Kaleci ';
    return `🧤 KURTARDI! ${keeper}— ${getPhrase(SAVE_PHRASES, key)} ${attempt.playerName} kaçırdı ${corners} ${score}`;
  }
  return `❌ DIŞARI! ${attempt.playerName} (${teamName}) — ${getPhrase(MISS_PHRASES, key)} ${corners} ${score}`;
}

/* ---------------- seri görünüm modeli (senaryolu + canlı ortak) ---------------- */

type Stage = 'waiting' | 'aiming' | 'revealed' | 'done';
type Role = 'shooter' | 'keeper' | 'spectator';

interface ShootoutView {
  attempts: PenaltyShootoutAttempt[];
  scoreHome: number;
  scoreAway: number;
  stage: Stage;
  round: number;
  shooterTeamId: string | null;
  shooterName: string;
  keeperName: string;
  revealed: PenaltyShootoutAttempt | null;
  winnerId: string | null;
  /** Anlatım cümlesi seçimi için vuruş anahtarı (kart ve akış aynı cümleyi kullanır). */
  kickKey: number;
  /** Yalnız canlı seride: seçim bilgisi. */
  live: {
    kickIndex: number;
    endsAt: number;
    role: Role;
    shooterChosen: boolean;
    keeperChosen: boolean;
  } | null;
}

/** Senaryolu seride açıklanmadan önce kalecinin adı bilinmez; kadrodan tahmin. */
function scriptedKeeperName(result: MatchResult, shooterTeamId: string): string {
  const other = result.penaltyShootout?.find((a) => a.teamId !== shooterTeamId && a.keeperName);
  const own = result.penaltyShootout?.find((a) => a.teamId === shooterTeamId && a.keeperName);
  return own?.keeperName ?? other?.keeperName ?? 'Kaleci';
}

export const LiveMatchTicker: FC<LiveMatchTickerProps> = ({
  homeName,
  awayName,
  homePower,
  awayPower,
  roundTitle,
  result,
  onComplete,
  speedMs = 30,
  serverPaced = false,
  shootout = null,
  youId = null,
  onChoose,
  startedAt,
}) => {
  const [phase, setPhase] = useState<'regular' | 'extra' | 'shootout' | 'finished'>('regular');
  const [minute, setMinute] = useState(1);
  const [liveHomeScore, setLiveHomeScore] = useState(0);
  const [liveAwayScore, setLiveAwayScore] = useState(0);
  const [tickerLogs, setTickerLogs] = useState<string[]>([]);
  const [latestGoal, setLatestGoal] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);

  // Senaryolu seri (bot–bot / önizleme) durumu
  const [currentKickIndex, setCurrentKickIndex] = useState<number>(-1);
  const [kickState, setKickState] = useState<'aiming' | 'revealed'>('aiming');
  const [completedAttempts, setCompletedAttempts] = useState<PenaltyShootoutAttempt[]>([]);

  // Canlı seri: kendi seçimim + sunucu yanıtı
  const [myChoice, setMyChoice] = useState<PenaltyDirection | null>(null);
  const [chooseError, setChooseError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shootoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const resultRef = useRef(result);
  resultRef.current = result;
  const shootoutRef = useRef(shootout);
  shootoutRef.current = shootout;

  const interactive = Boolean(result.pendingShootout);
  const liveShootout =
    interactive && shootout && shootout.matchId === result.matchId ? shootout : null;
  const lastMinute = result.extraTime ? 120 : 90;

  const log = useCallback((line: string) => setTickerLogs((prev) => [line, ...prev]), []);

  const enterShootout = useCallback(
    (silent: boolean) => {
      setPhase('shootout');
      const endLabel = result.extraTime ? 'Uzatma da' : '90 Dakika';
      if (!silent) {
        log(
          `${lastMinute}' ⏱️ ${endLabel} Berabere Bitti (${result.scoreHome} - ${result.scoreAway})! Kazananı SERİ PENALTI ATIŞLARI belirleyecek! 🔥`,
        );
      }
    },
    [lastMinute, log, result.extraTime, result.scoreAway, result.scoreHome],
  );

  // 90 dakikalık normal süre + (beraberlikte) 30 dakikalık uzatma simülasyonu
  useEffect(() => {
    setPhase('regular');
    setMinute(1);
    setLiveHomeScore(0);
    setLiveAwayScore(0);
    setIsFinished(false);
    setLatestGoal(null);
    setCurrentKickIndex(-1);
    setKickState('aiming');
    setCompletedAttempts([]);
    setTickerLogs([`0' ⏱️ Karşılaşma başladı! ${homeName} vs ${awayName}`]);

    // Yeniden bağlanma: dakikayı sunucu başlangıcından türet; seri zaten
    // sürüyorsa doğrudan seriye geç (maçı baştan oynatma).
    let min = 1;
    if (startedAt) {
      min = Math.max(1, Math.min(lastMinute + 1, Math.floor((Date.now() - startedAt) / speedMs)));
    }
    const s0 = shootoutRef.current;
    if (s0 && s0.matchId === result.matchId) min = lastMinute + 1;

    let hScore = 0;
    let aScore = 0;
    for (const e of result.events) {
      if (e.type !== 'goal' || e.minute >= min) continue;
      if (e.teamId === result.homeId) hScore += 1;
      else aScore += 1;
    }
    if (min > 1) {
      setLiveHomeScore(hScore);
      setLiveAwayScore(aScore);
      setMinute(Math.min(min, lastMinute));
      if (min > 90) setPhase('extra');
      log(`↻ Maça yeniden bağlandın (${Math.min(min, lastMinute)}' · ${hScore} - ${aScore})`);
    }

    const finishMatch = (): void => {
      const hasScripted = Boolean(result.penaltyShootout && result.penaltyShootout.length > 0);
      if (result.pendingShootout || hasScripted) {
        enterShootout(false);
      } else {
        setPhase('finished');
        setIsFinished(true);
        const suffix = result.extraTime ? ' (uzatmalar sonunda)' : '';
        log(
          `${lastMinute}' 🏁 Maç Bitti${suffix}! Sonuç: ${homeName} ${result.scoreHome} - ${result.scoreAway} ${awayName}`,
        );
      }
    };

    if (min > lastMinute) {
      setMinute(lastMinute);
      setLiveHomeScore(result.scoreHome);
      setLiveAwayScore(result.scoreAway);
      finishMatch();
      return;
    }

    const timer = setInterval(() => {
      min += 1;
      if (min > lastMinute) {
        clearInterval(timer);
        clockRef.current = null;
        finishMatch();
        return;
      }
      if (min === 91) {
        // Normal süre berabere bitti, uzatmaya gidiliyor.
        setPhase('extra');
        log(
          `90' ⏱️ Normal Süre Berabere Bitti (${hScore} - ${aScore})! 30 dakikalık UZATMA başlıyor! ⚡`,
        );
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
        log(msg);
      }
    }, speedMs);
    clockRef.current = timer;

    return () => {
      clearInterval(timer);
      clockRef.current = null;
      if (shootoutTimerRef.current) {
        clearTimeout(shootoutTimerRef.current);
      }
    };
  }, [
    result.matchId,
    homeName,
    awayName,
    result,
    speedMs,
    startedAt,
    lastMinute,
    enterShootout,
    log,
  ]);

  // Sunucu seriye geçti ama saat henüz 120'ye gelmedi (gecikme / yeniden
  // bağlanma): saati bitir, seriye geç.
  useEffect(() => {
    if (!liveShootout) return;
    if (phase !== 'regular' && phase !== 'extra') return;
    if (clockRef.current) {
      clearInterval(clockRef.current);
      clockRef.current = null;
    }
    setMinute(lastMinute);
    setLiveHomeScore(result.scoreHome);
    setLiveAwayScore(result.scoreAway);
    enterShootout(false);
  }, [liveShootout, phase, lastMinute, result.scoreHome, result.scoreAway, enterShootout]);

  // Senaryolu seri (bot–bot / önizleme): hazır gelen atışları sırayla oynat.
  useEffect(() => {
    if (phase !== 'shootout' || interactive) return;
    const shootoutList = result.penaltyShootout;
    if (!shootoutList || shootoutList.length === 0) {
      setPhase('finished');
      setIsFinished(true);
      return;
    }

    let active = true;

    const playKick = (index: number) => {
      if (!active) return;
      if (index >= shootoutList.length) {
        const winnerName = result.winnerId === result.homeId ? homeName : awayName;
        log(
          `🏆 SERİ PENALTILAR SONUCU: ${homeName} ${result.penaltiesHome} - ${result.penaltiesAway} ${awayName}! Kazanan: ${winnerName}!`,
        );
        setPhase('finished');
        setIsFinished(true);
        return;
      }

      const attempt = shootoutList[index];
      if (!attempt) return;
      const isHome = attempt.teamId === result.homeId;
      const teamName = isHome ? homeName : awayName;
      const aimText = getPhrase(AIMING_PHRASES, attempt.playerName + index);

      setCurrentKickIndex(index);
      setKickState('aiming');
      log(
        `🎯 ${attempt.round}. Penaltı: ${attempt.playerName} (${teamName}) topun başına geçti... ${aimText}`,
      );

      shootoutTimerRef.current = setTimeout(() => {
        if (!active) return;
        setKickState('revealed');
        setCompletedAttempts((prev) => [...prev, attempt]);
        log(describeKick(attempt, teamName, index));

        shootoutTimerRef.current = setTimeout(() => {
          if (!active) return;
          playKick(index + 1);
        }, 2200);
      }, 1500);
    };

    shootoutTimerRef.current = setTimeout(() => {
      playKick(0);
    }, 1200);

    return () => {
      active = false;
      if (shootoutTimerRef.current) {
        clearTimeout(shootoutTimerRef.current);
      }
    };
  }, [phase, interactive, result, homeName, awayName, log]);

  // Canlı seri anlatımı: yeni vuruş (seçim evresi) ve açıklanan vuruş.
  const promptedRef = useRef<number>(-1);
  const revealedRef = useRef<number>(-1);
  useEffect(() => {
    if (!liveShootout) return;
    const teamName = liveShootout.shooterTeamId === result.homeId ? homeName : awayName;
    if (liveShootout.phase === 'choosing' && promptedRef.current !== liveShootout.kickIndex) {
      promptedRef.current = liveShootout.kickIndex;
      const you =
        youId === liveShootout.shooterTeamId
          ? ' — SEN ATIYORSUN, köşeyi seç!'
          : youId === liveShootout.keeperTeamId
            ? ' — SEN KALEDESİN, bir tarafa uzan!'
            : '';
      log(
        `🎯 ${liveShootout.round}. Penaltı: ${liveShootout.shooter.name} (${teamName}) topun başına geçti, karşısında ${liveShootout.keeper.name}... ${getPhrase(AIMING_PHRASES, liveShootout.kickIndex)}${you}`,
      );
    }
    if (
      liveShootout.phase === 'revealed' &&
      liveShootout.lastAttempt &&
      revealedRef.current !== liveShootout.kickIndex
    ) {
      revealedRef.current = liveShootout.kickIndex;
      log(describeKick(liveShootout.lastAttempt, teamName, liveShootout.kickIndex));
      if (liveShootout.winnerId) {
        const winnerName = liveShootout.winnerId === result.homeId ? homeName : awayName;
        log(
          `🏆 SERİ PENALTILAR SONUCU: ${homeName} ${liveShootout.penaltiesHome} - ${liveShootout.penaltiesAway} ${awayName}! Kazanan: ${winnerName}!`,
        );
      }
    }
  }, [liveShootout, homeName, awayName, youId, log, result.homeId]);

  // Her yeni vuruşta seçim sıfırlanır; seçim evresinde geri sayım için saat işler.
  const liveKickIndex = liveShootout?.kickIndex ?? -1;
  const livePhase = liveShootout?.phase ?? null;
  useEffect(() => {
    setMyChoice(null);
    setChooseError(null);
  }, [liveKickIndex]);
  useEffect(() => {
    if (livePhase !== 'choosing') return;
    setNow(Date.now());
    const iv = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(iv);
  }, [livePhase, liveKickIndex]);

  // Otomatik tamamlama (yalnız yerel önizleme — sunucu temposunda değil).
  useEffect(() => {
    if (isFinished && !serverPaced) {
      const autoTimer = setTimeout(() => {
        onCompleteRef.current?.(resultRef.current);
      }, 1500);
      return () => clearTimeout(autoTimer);
    }
  }, [isFinished, serverPaced]);

  /* ---------------------------- görünüm modeli ---------------------------- */

  let view: ShootoutView | null = null;
  if (phase === 'shootout' || (phase === 'finished' && isFinished && !interactive)) {
    if (interactive) {
      if (!liveShootout) {
        view = {
          attempts: [],
          scoreHome: 0,
          scoreAway: 0,
          stage: 'waiting',
          round: 1,
          shooterTeamId: null,
          shooterName: '',
          keeperName: '',
          revealed: null,
          winnerId: null,
          kickKey: 0,
          live: null,
        };
      } else {
        const role: Role =
          youId === liveShootout.shooterTeamId
            ? 'shooter'
            : youId === liveShootout.keeperTeamId
              ? 'keeper'
              : 'spectator';
        const revealed = liveShootout.phase === 'revealed' ? liveShootout.lastAttempt : null;
        view = {
          attempts: liveShootout.attempts,
          scoreHome: liveShootout.penaltiesHome,
          scoreAway: liveShootout.penaltiesAway,
          stage: liveShootout.phase === 'choosing' ? 'aiming' : 'revealed',
          round: liveShootout.round,
          shooterTeamId: liveShootout.shooterTeamId,
          shooterName: liveShootout.shooter.name,
          keeperName: liveShootout.keeper.name,
          revealed,
          winnerId: liveShootout.winnerId,
          kickKey: liveShootout.kickIndex,
          live: {
            kickIndex: liveShootout.kickIndex,
            endsAt: liveShootout.endsAt,
            role,
            shooterChosen: liveShootout.shooterChosen,
            keeperChosen: liveShootout.keeperChosen,
          },
        };
      }
    } else if (result.penaltyShootout && result.penaltyShootout.length > 0) {
      const list = result.penaltyShootout;
      const current = currentKickIndex >= 0 ? list[currentKickIndex] : undefined;
      const last = completedAttempts[completedAttempts.length - 1];
      const done = phase === 'finished';
      view = {
        attempts: completedAttempts,
        scoreHome: last?.scoreHomeAfter ?? 0,
        scoreAway: last?.scoreAwayAfter ?? 0,
        stage: done
          ? 'done'
          : !current
            ? 'waiting'
            : kickState === 'aiming'
              ? 'aiming'
              : 'revealed',
        round: current?.round ?? 1,
        shooterTeamId: current?.teamId ?? null,
        shooterName: current?.playerName ?? '',
        keeperName:
          current?.keeperName ?? (current ? scriptedKeeperName(result, current.teamId) : ''),
        revealed: !done && kickState === 'revealed' && current ? current : null,
        winnerId: done ? (result.winnerId ?? null) : null,
        kickKey: Math.max(0, currentKickIndex),
        live: null,
      };
    }
  }

  const selectable = Boolean(
    view?.live && view.stage === 'aiming' && view.live.role !== 'spectator' && onChoose,
  );

  // Seçim: görünüm modeli her render'da yeniden kurulduğu için ref üzerinden okunur.
  const viewRef = useRef(view);
  viewRef.current = view;
  const onChooseRef = useRef(onChoose);
  onChooseRef.current = onChoose;
  const choose = useCallback((direction: PenaltyDirection) => {
    const v = viewRef.current;
    const send = onChooseRef.current;
    if (!v?.live || v.stage !== 'aiming' || v.live.role === 'spectator' || !send) return;
    setMyChoice(direction);
    setChooseError(null);
    send(v.live.kickIndex, direction).catch((err: unknown) => {
      setChooseError(err instanceof Error ? err.message : 'Seçim gönderilemedi.');
    });
  }, []);

  // Klavye: ← ↑ → (ya da 1 2 3) ile seçim.
  useEffect(() => {
    if (!selectable) return;
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, PenaltyDirection> = {
        ArrowLeft: 'left',
        ArrowUp: 'center',
        ArrowRight: 'right',
        '1': 'left',
        '2': 'center',
        '3': 'right',
      };
      const dir = map[e.key];
      if (!dir) return;
      e.preventDefault();
      choose(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectable, choose]);

  const totalMinutes = result.extraTime ? 120 : 90;
  const progressPct = Math.min(100, Math.round((minute / totalMinutes) * 100));

  const hasShootout = interactive || Boolean(result.penaltyShootout?.length);
  const shootoutScore = view ? `${view.scoreHome} - ${view.scoreAway}` : '0 - 0';
  const finalPenH = interactive ? (view?.scoreHome ?? 0) : result.penaltiesHome;
  const finalPenA = interactive ? (view?.scoreAway ?? 0) : result.penaltiesAway;
  const finalWinnerId = interactive ? view?.winnerId : result.winnerId;

  // Nokta sayısı serinin uzayıp uzamayacağını ELE VERMEMELİ: baştan yalnız
  // klasik 5 gösterilir; ani ölüm turları ancak sıra geldikçe eklenir.
  const revealedRound = Math.max(
    5,
    ...(view?.attempts.map((a) => a.round) ?? [0]),
    view?.stage === 'aiming' || view?.stage === 'revealed' ? view.round : 0,
  );
  const shootoutRounds = Array.from({ length: revealedRound }, (_, i) => i + 1);

  const renderPenaltyDots = (teamId: string) => {
    if (!hasShootout || !view || phase === 'regular' || phase === 'extra') return null;
    const current =
      view.stage === 'aiming' && view.shooterTeamId
        ? { teamId: view.shooterTeamId, round: view.round }
        : null;

    return (
      <div className="penalty-dots-row">
        {shootoutRounds.map((rnd) => {
          const attempt = view.attempts.find((a) => a.teamId === teamId && a.round === rnd);
          const isCurrent = current !== null && current.teamId === teamId && current.round === rnd;

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
                  ? `${attempt.playerName}: ${attempt.outcome === 'goal' ? 'Gol' : attempt.outcome === 'saved' ? 'Kurtarıldı' : 'Dışarı'}`
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

  const teamNameOf = (id: string | null) =>
    id === result.homeId ? homeName : id === result.awayId ? awayName : '';

  const remainingMs = view?.live ? Math.max(0, view.live.endsAt - now) : 0;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const remainingPct = Math.max(0, Math.min(100, (remainingMs / SHOOTOUT_CHOOSE_MS) * 100));

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
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {roundTitle && (
            <span
              style={{
                backgroundColor: 'rgba(201, 151, 74, 0.22)',
                color: 'var(--accent-gold, #f59e0b)',
                border: '1px solid rgba(201, 151, 74, 0.45)',
                padding: '4px 12px',
                borderRadius: 16,
                fontSize: '0.8rem',
                fontWeight: 900,
                letterSpacing: 1,
                textTransform: 'uppercase',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              🏆 {roundTitle}
            </span>
          )}
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
        </div>
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 4,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>EV SAHİBİ</span>
            {homePower != null && (
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  backgroundColor: 'rgba(59, 130, 246, 0.2)',
                  color: '#93c5fd',
                  border: '1px solid rgba(147, 197, 253, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                ⚡ Kadro Gücü: {homePower}
              </span>
            )}
          </div>
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
              ? `Penaltılar: ${shootoutScore}`
              : isFinished
                ? `Maç Sonu (${totalMinutes}')${result.extraTime ? ' · U.S.' : ''}`
                : phase === 'extra'
                  ? `Uzatma: ${minute}'`
                  : `Dakika: ${minute}'`}
          </div>
        </div>

        <div style={{ textAlign: 'left' }}>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>{awayName}</h3>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 8,
              marginTop: 4,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>DEPLASMAN</span>
            {awayPower != null && (
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  backgroundColor: 'rgba(59, 130, 246, 0.2)',
                  color: '#93c5fd',
                  border: '1px solid rgba(147, 197, 253, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                ⚡ Kadro Gücü: {awayPower}
              </span>
            )}
          </div>
          {hasShootout && renderPenaltyDots(result.awayId)}
        </div>
      </div>

      {/* Süre İlerleme Çubuğu (normal süre + uzatma) */}
      {(phase === 'regular' || phase === 'extra') && (
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
              backgroundColor:
                phase === 'extra' ? 'var(--accent-gold)' : 'var(--accent-green, #10b981)',
              transition: 'width 0.1s linear',
            }}
          />
        </div>
      )}

      {/* Seri Penaltı — 2D sahne + seçim (canlı) ya da senaryolu oynatma */}
      {phase === 'shootout' && view && view.stage !== 'done' && (
        <div
          className={`penalty-active-card pen-live ${
            view.stage === 'revealed' && view.revealed
              ? view.revealed.outcome === 'goal'
                ? 'is-goal'
                : 'is-miss'
              : 'is-aiming'
          }`}
        >
          <div className="penalty-active-header">
            <span className="penalty-round-badge">
              {view.stage === 'waiting' ? 'SERİ PENALTI' : `${view.round}. SERİ PENALTI`}
            </span>
            <span className="penalty-team-tag">{teamNameOf(view.shooterTeamId)}</span>
          </div>

          {view.stage === 'waiting' ? (
            <div className="penalty-kicker-name">Seri penaltılar başlıyor…</div>
          ) : (
            <div className="pen-matchup">
              <span className="pen-matchup-side">
                <span className="pen-matchup-icon">⚽</span>
                <span>{view.shooterName}</span>
              </span>
              <span className="pen-vs">vs</span>
              <span className="pen-matchup-side">
                <span className="pen-matchup-icon">🧤</span>
                <span>{view.keeperName}</span>
              </span>
            </div>
          )}

          <PenaltyScene
            reveal={view.revealed}
            selectable={selectable}
            selected={myChoice}
            onSelect={choose}
            role={view.live?.role ?? 'spectator'}
          />

          {view.live && view.stage === 'aiming' && (
            <div className="pen-controls">
              <div className={`pen-role-banner role-${view.live.role}`}>
                {view.live.role === 'shooter'
                  ? '🎯 SEN ATIYORSUN — köşeyi seç'
                  : view.live.role === 'keeper'
                    ? '🧤 SEN KALEDESİN — bir tarafa uzan'
                    : 'Taraflar köşe seçiyor…'}
              </div>

              <div className="pen-countdown" aria-live="polite">
                <div className="pen-countdown-track">
                  <div
                    className={`pen-countdown-bar${remainingSec <= 2 ? ' urgent' : ''}`}
                    style={{ width: `${remainingPct}%` }}
                  />
                </div>
                <span className={`pen-countdown-num${remainingSec <= 2 ? ' urgent' : ''}`}>
                  {remainingSec}
                </span>
              </div>

              {view.live.role !== 'spectator' && (
                <>
                  <div className="pen-btn-row">
                    {(['left', 'center', 'right'] as const).map((dir) => (
                      <button
                        key={dir}
                        type="button"
                        className={`pen-btn${myChoice === dir ? ' selected' : ''}`}
                        onClick={() => choose(dir)}
                      >
                        {dir === 'left' ? '◀ SOL' : dir === 'center' ? '▲ ORTA' : 'SAĞ ▶'}
                      </button>
                    ))}
                  </div>
                  <div className="pen-hint">
                    {myChoice
                      ? `Seçimin: ${DIR_LABEL[myChoice].toUpperCase()} · süre dolana kadar değiştirebilirsin`
                      : view.live.role === 'shooter'
                        ? 'Süre dolarsa ortaya vurursun. Klavye: ← ↑ →'
                        : 'Süre dolarsa ortada kalırsın. Klavye: ← ↑ →'}
                  </div>
                  {chooseError && <div className="pen-error">{chooseError}</div>}
                </>
              )}

              <div className="pen-chips">
                <span className={`pen-chip${view.live.shooterChosen ? ' done' : ''}`}>
                  ⚽ {teamNameOf(view.shooterTeamId)}{' '}
                  {view.live.shooterChosen ? '· köşeyi seçti' : '· seçiyor…'}
                </span>
                <span className={`pen-chip${view.live.keeperChosen ? ' done' : ''}`}>
                  🧤{' '}
                  {teamNameOf(view.shooterTeamId === result.homeId ? result.awayId : result.homeId)}{' '}
                  {view.live.keeperChosen ? '· tarafını seçti' : '· seçiyor…'}
                </span>
              </div>
            </div>
          )}

          {!view.live && view.stage === 'aiming' && (
            <div className="penalty-status-message">
              <span className="penalty-aiming-text">
                <span className="pulse-indicator">●</span>{' '}
                {getPhrase(AIMING_PHRASES, view.shooterName + view.kickKey)}
              </span>
            </div>
          )}

          {view.stage === 'revealed' && view.revealed && (
            <div className="penalty-status-message">
              {view.revealed.outcome === 'goal' ? (
                <span className="penalty-goal-text">
                  ⚽ GOOOL!{' '}
                  {getPhrase(
                    view.revealed.shotDirection === view.revealed.keeperDirection
                      ? GOAL_SAME_SIDE_PHRASES
                      : GOAL_PHRASES,
                    view.revealed.playerName + view.kickKey + (view.revealed.playerId ?? ''),
                  )}
                </span>
              ) : view.revealed.outcome === 'saved' ? (
                <span className="penalty-miss-text">
                  🧤 KURTARDI!{' '}
                  {getPhrase(
                    SAVE_PHRASES,
                    view.revealed.playerName + view.kickKey + (view.revealed.playerId ?? ''),
                  )}
                </span>
              ) : (
                <span className="penalty-miss-text">
                  ❌ DIŞARI!{' '}
                  {getPhrase(
                    MISS_PHRASES,
                    view.revealed.playerName + view.kickKey + (view.revealed.playerId ?? ''),
                  )}
                </span>
              )}
            </div>
          )}

          {view.stage === 'revealed' && view.winnerId && (
            <div className="penalty-final-banner pen-winner">
              <span style={{ fontSize: '1.4rem' }}>🏆</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                  Penaltı Atışları: {homeName} {view.scoreHome} - {view.scoreAway} {awayName}
                </div>
                <div
                  style={{
                    fontSize: '0.82rem',
                    color: 'var(--accent-green, #10b981)',
                    marginTop: 2,
                  }}
                >
                  ✓ {teamNameOf(view.winnerId)} penaltılar sonucunda galip geldi!
                  {view.winnerId === youId ? ' Tebrikler!' : ''}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Penaltı Sonucu Özeti (Maç bittiğinde) */}
      {isFinished && hasShootout && (
        <div className="penalty-final-banner">
          <span style={{ fontSize: '1.4rem' }}>🏆</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
              Penaltı Atışları: {homeName} {finalPenH} - {finalPenA} {awayName}
            </div>
            <div
              style={{
                fontSize: '0.82rem',
                color: 'var(--accent-green, #10b981)',
                marginTop: 2,
              }}
            >
              ✓ {finalWinnerId === result.homeId ? homeName : awayName} penaltılar sonucunda galip
              geldi!
            </div>
          </div>
        </div>
      )}

      {/* Son Gol Anonsu (oyun sürerken) */}
      {latestGoal && (phase === 'regular' || phase === 'extra') && (
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
