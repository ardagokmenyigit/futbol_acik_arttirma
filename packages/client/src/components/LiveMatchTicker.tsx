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
  /**
   * Canlı oynatmanın YEREL saate göre başlangıç anı (alınma anı − sunucuda
   * geçen süre) — yeniden bağlanınca dakika buradan türer. Sunucu saati
   * kullanılmaz: saat kayması olan cihazda maç "anında bitmiş" görünmesin.
   */
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

  // Seriye geçiş iki yoldan tetiklenebilir (saat 120'ye geldi / sunucu seriyi
  // başlattı); anons ve faz değişimi maç başına bir kez uygulanır.
  const enteredRef = useRef<string | null>(null);
  const enterShootout = useCallback(
    (silent: boolean) => {
      if (enteredRef.current === result.matchId) return;
      enteredRef.current = result.matchId;
      setPhase('shootout');
      const endLabel = result.extraTime ? 'Uzatma da' : '90 Dakika';
      if (!silent) {
        log(
          `${lastMinute}' ⏱️ ${endLabel} Berabere Bitti (${result.scoreHome} - ${result.scoreAway})! Kazananı SERİ PENALTI ATIŞLARI belirleyecek! 🔥`,
        );
      }
    },
    [lastMinute, log, result.extraTime, result.matchId, result.scoreAway, result.scoreHome],
  );

  // 90 dakikalık normal süre + (beraberlikte) 30 dakikalık uzatma simülasyonu
  useEffect(() => {
    enteredRef.current = null;
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
  // Son tarih YEREL saate göre kurulur: durum geldiği anda `remainingMs` kadar
  // ileri (sunucu `endsAt`i kullanılmaz — saat kayması sayacı bozmasın).
  const liveKickIndex = liveShootout?.kickIndex ?? -1;
  const livePhase = liveShootout?.phase ?? null;
  const deadlineRef = useRef<{ kickIndex: number; at: number } | null>(null);
  if (liveShootout && liveShootout.phase === 'choosing') {
    if (deadlineRef.current?.kickIndex !== liveShootout.kickIndex) {
      deadlineRef.current = {
        kickIndex: liveShootout.kickIndex,
        at: Date.now() + Math.min(SHOOTOUT_CHOOSE_MS, Math.max(0, liveShootout.remainingMs)),
      };
    }
  }
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
      <div className="pen-dots" aria-label="Penaltı atışları">
        {shootoutRounds.map((rnd) => {
          const attempt = view.attempts.find((a) => a.teamId === teamId && a.round === rnd);
          const isCurrent = current !== null && current.teamId === teamId && current.round === rnd;
          const cls = attempt
            ? attempt.scored
              ? 'pen-dot scored'
              : 'pen-dot missed'
            : isCurrent
              ? 'pen-dot current'
              : 'pen-dot';
          const title = attempt
            ? `${attempt.playerName}: ${attempt.outcome === 'goal' ? 'Gol' : attempt.outcome === 'saved' ? 'Kurtarıldı' : 'Dışarı'}`
            : isCurrent
              ? 'Vuruş yapılıyor'
              : `${rnd}. penaltı`;
          return (
            <span key={rnd} className={cls} title={title}>
              {attempt ? (attempt.scored ? '✓' : '✕') : ''}
            </span>
          );
        })}
      </div>
    );
  };

  const teamNameOf = (id: string | null) =>
    id === result.homeId ? homeName : id === result.awayId ? awayName : '';

  const remainingMs =
    view?.live && deadlineRef.current?.kickIndex === view.live.kickIndex
      ? Math.max(0, deadlineRef.current.at - now)
      : 0;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const ringDeg = Math.round(Math.max(0, Math.min(1, remainingMs / SHOOTOUT_CHOOSE_MS)) * 360);
  const ringLead = remainingSec <= 2 ? 'var(--crimson)' : 'var(--gold)';

  const cardState = phase === 'shootout' ? 'gold' : isFinished ? 'ready' : 'crimson';
  const statusLabel =
    phase === 'shootout'
      ? 'Seri penaltı atışları'
      : isFinished
        ? 'Maç tamamlandı'
        : phase === 'extra'
          ? 'Uzatma · canlı'
          : 'Canlı maç';
  const clockText =
    phase === 'shootout'
      ? view
        ? `${view.scoreHome} – ${view.scoreAway}`
        : '0 – 0'
      : `${minute}'`;
  const clockLabel =
    phase === 'shootout'
      ? 'Penaltılar'
      : isFinished
        ? `Maç sonu${result.extraTime ? ' · u.s.' : ''}`
        : phase === 'extra'
          ? 'Uzatma'
          : 'Dakika';

  const revealedPhrase = (a: PenaltyShootoutAttempt): string => {
    const key = a.playerName + (view?.kickKey ?? 0) + (a.playerId ?? '');
    if (a.outcome === 'goal') {
      return getPhrase(
        a.shotDirection === a.keeperDirection ? GOAL_SAME_SIDE_PHRASES : GOAL_PHRASES,
        key,
      );
    }
    return getPhrase(a.outcome === 'saved' ? SAVE_PHRASES : MISS_PHRASES, key);
  };

  return (
    <div className={`panel ${cardState} live-card`}>
      {/* Başlık: tur · durum · saat */}
      <div className="live-head lm-head">
        <div>
          <div className={`round-label lm-label ${cardState}`}>
            <span className={`lm-dot ${cardState}`} />
            {roundTitle ? `${roundTitle} · ` : ''}
            {statusLabel}
          </div>
          <div className="lm-title">
            {homeName} <span className="lm-title-vs">–</span> {awayName}
          </div>
        </div>
        <div className="lm-clock-block">
          <div className="lm-clock">{clockText}</div>
          <div className="lm-clock-label">{clockLabel}</div>
        </div>
      </div>

      {/* Skor tabelası — sitenin scoreline bileşeni */}
      <div className="scoreline lm-scoreline">
        <div className="side home">
          <div className="name">{homeName}</div>
          <div className="score">{liveHomeScore}</div>
          <div className="lm-side-meta">
            <span>Ev sahibi</span>
            {homePower != null && <span className="lm-power">Güç {homePower}</span>}
          </div>
          {hasShootout && renderPenaltyDots(result.homeId)}
        </div>
        <div className="sep" />
        <div className="side away">
          <div className="name">{awayName}</div>
          <div className="score">{liveAwayScore}</div>
          <div className="lm-side-meta">
            <span>Deplasman</span>
            {awayPower != null && <span className="lm-power">Güç {awayPower}</span>}
          </div>
          {hasShootout && renderPenaltyDots(result.awayId)}
        </div>
      </div>

      {/* Süre ilerleme çubuğu (normal süre + uzatma) */}
      {(phase === 'regular' || phase === 'extra') && (
        <div className="stat-track lm-track">
          <div
            className={`stat-fill${phase === 'extra' ? ' extra' : ''}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* Son gol anonsu (oyun sürerken) — sitenin ticker bildirimi */}
      {latestGoal && (phase === 'regular' || phase === 'extra') && (
        <div className="ticker lm-notice">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7l4.5 3.3-1.7 5.4H9.2L7.5 10.3z" />
          </svg>
          <span>{latestGoal}</span>
        </div>
      )}

      {/* Seri penaltı — 2D sahne + seçim (canlı) ya da senaryolu oynatma */}
      {phase === 'shootout' && view && view.stage !== 'done' && (
        <div
          className={`player-card pen-card${
            view.stage === 'revealed' && view.revealed ? ` is-${view.revealed.outcome}` : ''
          }`}
        >
          <div className="pen-head">
            <span className="section-label">
              {view.stage === 'waiting' ? 'Seri penaltı' : `${view.round}. seri penaltı`}
            </span>
            {view.shooterTeamId && (
              <span className="tag waiting">{teamNameOf(view.shooterTeamId)}</span>
            )}
          </div>

          {view.stage === 'waiting' ? (
            <div className="pen-waiting">Seri penaltılar başlıyor…</div>
          ) : (
            <div className="pen-matchup">
              <div className="pen-side">
                <div className="lbl">Atıyor</div>
                <div className="nm">{view.shooterName}</div>
              </div>
              <div className="pen-vs">vs</div>
              <div className="pen-side right">
                <div className="lbl">Kalede</div>
                <div className="nm">{view.keeperName}</div>
              </div>
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
              <div className="pen-role-row">
                <div className={`pen-role${view.live.role !== 'spectator' ? ' mine' : ''}`}>
                  {view.live.role === 'shooter'
                    ? 'Sen atıyorsun — köşeyi seç'
                    : view.live.role === 'keeper'
                      ? 'Sen kaledesin — bir tarafa uzan'
                      : 'Taraflar köşe seçiyor'}
                  {view.live.role === 'spectator' && (
                    <span className="pen-role-sub">İzleyicisin, seçimler gizli yapılıyor.</span>
                  )}
                </div>
                <div
                  className="timer-ring"
                  style={{
                    background: `conic-gradient(${ringLead} 0deg ${ringDeg}deg, var(--panel) ${ringDeg}deg 360deg)`,
                  }}
                  aria-live="polite"
                >
                  <div className="timer-ring-inner pen-ring-inner">{remainingSec}</div>
                </div>
              </div>

              {view.live.role !== 'spectator' && (
                <>
                  <div className="format-row pen-choice">
                    {(['left', 'center', 'right'] as const).map((dir) => (
                      <button
                        key={dir}
                        type="button"
                        className={`format-btn${myChoice === dir ? ' active' : ''}`}
                        onClick={() => choose(dir)}
                      >
                        <span className="ft">{DIR_LABEL[dir]}</span>
                        <span className="fs">
                          {dir === 'left'
                            ? '← ya da 1'
                            : dir === 'center'
                              ? '↑ ya da 2'
                              : '→ ya da 3'}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="footnote pen-footnote">
                    {myChoice
                      ? `Seçimin ${DIR_LABEL[myChoice]} — süre dolana kadar değiştirebilirsin.`
                      : view.live.role === 'shooter'
                        ? 'Süre dolarsa ortaya vurursun. Kaleci yanlış köşeye giderse gol neredeyse kesin.'
                        : 'Süre dolarsa ortada kalırsın. Doğru köşeyi bilirsen kurtarma şansın yüksek.'}
                  </p>
                  {chooseError && <p className="error pen-error">{chooseError}</p>}
                </>
              )}

              <div className="pen-tags">
                <span className={`tag ${view.live.shooterChosen ? 'ready' : 'waiting'}`}>
                  {teamNameOf(view.shooterTeamId)} ·{' '}
                  {view.live.shooterChosen ? 'köşeyi seçti' : 'seçiyor…'}
                </span>
                <span className={`tag ${view.live.keeperChosen ? 'ready' : 'waiting'}`}>
                  {teamNameOf(view.shooterTeamId === result.homeId ? result.awayId : result.homeId)}{' '}
                  · {view.live.keeperChosen ? 'tarafını seçti' : 'seçiyor…'}
                </span>
              </div>
            </div>
          )}

          {!view.live && view.stage === 'aiming' && (
            <div className="pen-aim">
              <span className="lm-dot crimson" />
              {getPhrase(AIMING_PHRASES, view.shooterName + view.kickKey)}
            </div>
          )}

          {view.stage === 'revealed' && view.revealed && (
            <>
              <div className={`ticker pen-result is-${view.revealed.outcome}`}>
                <b>
                  {view.revealed.outcome === 'goal'
                    ? 'Gol'
                    : view.revealed.outcome === 'saved'
                      ? 'Kurtardı'
                      : 'Dışarı'}
                </b>
                <span>{revealedPhrase(view.revealed)}</span>
              </div>
              {/* İki tarafın seçimi açıkça: atış köşesi ve kalecinin uzandığı taraf */}
              <div className="pen-picks">
                <span className="tag waiting">Atış · {DIR_LABEL[view.revealed.shotDirection]}</span>
                <span
                  className={`tag ${view.revealed.shotDirection === view.revealed.keeperDirection ? 'host' : 'waiting'}`}
                >
                  Kaleci · {DIR_LABEL[view.revealed.keeperDirection]}
                  {view.revealed.shotDirection === view.revealed.keeperDirection
                    ? ' · köşeyi bildi'
                    : ' · ters köşe'}
                </span>
              </div>
            </>
          )}

          {view.stage === 'revealed' && view.winnerId && (
            <div className="pen-winner">
              <div className="section-label">
                Penaltılar {view.scoreHome} – {view.scoreAway}
              </div>
              <div className="pen-winner-name">{teamNameOf(view.winnerId)}</div>
              <div className="pen-winner-meta">
                penaltılar sonucunda tur atladı{view.winnerId === youId ? ' · tebrikler' : ''}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Penaltı sonucu özeti (maç bittiğinde) */}
      {isFinished && hasShootout && (
        <div className="pen-winner lm-final">
          <div className="section-label">
            Penaltılar {finalPenH} – {finalPenA}
          </div>
          <div className="pen-winner-name">
            {finalWinnerId === result.homeId ? homeName : awayName}
          </div>
          <div className="pen-winner-meta">penaltılar sonucunda tur atladı</div>
        </div>
      )}

      {/* Canlı anlatım akışı */}
      <div className="lm-feed">
        {tickerLogs.slice(0, 4).map((line, idx) => (
          <div key={idx} className={`lm-feed-row${idx === 0 ? ' latest' : ''}`}>
            {line}
          </div>
        ))}
      </div>

      {/* Devam butonu — yalnız yerel önizlemede */}
      {isFinished && !serverPaced && (
        <div className="btn-row">
          <button
            type="button"
            className="btn-primary"
            onClick={() => onCompleteRef.current?.(resultRef.current)}
          >
            Ağaca işle ve sonraki tura geç
          </button>
        </div>
      )}
      {isFinished && serverPaced && <p className="footnote lm-next">Sonraki maç birazdan…</p>}
    </div>
  );
};
