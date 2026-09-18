import {
  applyKick,
  createPRNG,
  createShootout,
  fallbackFootballer,
  nextKick,
  orderShooters,
  pickKeeper,
  resolveKick,
  PENALTY_DIRECTIONS,
  SHOOTOUT_CHOOSE_MS,
  SHOOTOUT_REVEAL_MS,
  type AckResult,
  type Footballer,
  type PenaltyDirection,
  type ShootoutProgress,
  type ShootoutState,
} from '@fal/shared';
import { roomStore } from '../rooms/roomStore.js';
import { emitRoomState } from '../rooms/broadcast.js';
import type { TypedServer, TypedSocket } from '../socketTypes.js';
import { botKeeperDirection, botPenaltyDelayMs, botShotDirection } from './penaltyBot.js';

/**
 * ============================================================================
 *  CANLI SERİ PENALTI MOTORU
 * ----------------------------------------------------------------------------
 *  İnsan içeren bir turnuva maçı uzatma sonunda berabere kaldığında
 *  (`MatchResult.pendingShootout`) seri burada, vuruş vuruş oynanır:
 *
 *   1. `beginKick`  — sıradaki atıcı/kaleci belirlenir, `RoomState.shootout`
 *                     güncellenir ve `tournament:shootoutPrompt` yayınlanır.
 *                     Taraflar `SHOOTOUT_CHOOSE_MS` içinde köşe seçer. Bot
 *                     taraflar insan gibi bir gecikmeyle seçer (penaltyBot.ts).
 *   2. `resolve`    — süre dolunca ya da iki taraf da seçince. Seçmeyen
 *                     BAĞLI insan → ORTA (dikkatsizlik cezası, öngörülebilir);
 *                     kopuk insan ya da bot → bot zekâsı (rakip kopan
 *                     oyuncuya karşı bedava gol atmasın). Sonuç saf
 *                     `resolveKick` ile, seriye özel seed'li zarla çözülür.
 *   3. `shootoutKick` yayınlanır, `SHOOTOUT_REVEAL_MS` bekleme (animasyon),
 *      sonra ya sıradaki vuruş ya da bitiş (`onDone`).
 *
 *  Seçilen köşeler açıklanana kadar YALNIZ sunucuda tutulur (`choices`);
 *  yayınlanan durumda sadece "seçti / seçmedi" bayrakları vardır.
 *  Tek doğruluk kaynağı sunucudur (CLAUDE.md §5).
 * ============================================================================
 */

/** Sunucu, istemci geri sayımı 0'ı gördükten hemen sonra çözer (gecikme payı). */
const DEADLINE_GRACE_MS = 150;

interface TeamRef {
  id: string;
  nickname: string;
  shooters: Footballer[];
  keeper: Footballer;
}

/** Sıradaki vuruşun tarafları — `beginKick`te sabitlenir, `resolve`da kullanılır. */
interface KickRef {
  isHome: boolean;
  shooterTeam: TeamRef;
  keeperTeam: TeamRef;
  shooter: Footballer;
  keeper: Footballer;
  round: number;
}

interface ActiveShootout {
  roomId: string;
  matchId: string;
  home: TeamRef;
  away: TeamRef;
  progress: ShootoutProgress;
  /** Global vuruş sırası (0 tabanlı) — istemci seçimlerini eşlemek için. */
  kickIndex: number;
  /** Şu an oynanan (ya da az önce açıklanan) vuruş. */
  kick: KickRef;
  choices: { shot: PenaltyDirection | null; keeper: PenaltyDirection | null };
  endsAt: number;
  deadlineTimer: NodeJS.Timeout | null;
  revealTimer: NodeJS.Timeout | null;
  botTimers: NodeJS.Timeout[];
  prng: () => number;
  onDone: (progress: ShootoutProgress) => void;
  resolved: boolean;
}

const activeShootouts = new Map<string, ActiveShootout>();

export interface ShootoutTeamInput {
  id: string;
  nickname: string;
  players: Footballer[];
}

function toTeamRef(t: ShootoutTeamInput): TeamRef {
  return {
    id: t.id,
    nickname: t.nickname,
    shooters: orderShooters(t.players),
    keeper: pickKeeper(t.players) ?? fallbackFootballer(t.id, t.nickname, 99),
  };
}

function kickRef(home: TeamRef, away: TeamRef, progress: ShootoutProgress): KickRef {
  const { isHome, teamKickIndex, round } = nextKick(progress);
  const shooterTeam = isHome ? home : away;
  const keeperTeam = isHome ? away : home;
  const shooter =
    shooterTeam.shooters.length > 0
      ? shooterTeam.shooters[teamKickIndex % shooterTeam.shooters.length]!
      : fallbackFootballer(shooterTeam.id, shooterTeam.nickname, teamKickIndex);
  return { isHome, shooterTeam, keeperTeam, shooter, keeper: keeperTeam.keeper, round };
}

/** Seri başlat. `seed` maç tohumundan türetilir — zar dizisi tekrar üretilebilir. */
export function startInteractiveShootout(
  io: TypedServer,
  roomId: string,
  opts: {
    matchId: string;
    home: ShootoutTeamInput;
    away: ShootoutTeamInput;
    seed: number;
    onDone: (progress: ShootoutProgress) => void;
  },
): void {
  cancelShootout(roomId);
  const home = toTeamRef(opts.home);
  const away = toTeamRef(opts.away);
  const progress = createShootout(opts.home.id, opts.away.id);
  const active: ActiveShootout = {
    roomId,
    matchId: opts.matchId,
    home,
    away,
    progress,
    kickIndex: 0,
    kick: kickRef(home, away, progress),
    choices: { shot: null, keeper: null },
    endsAt: 0,
    deadlineTimer: null,
    revealTimer: null,
    botTimers: [],
    prng: createPRNG(opts.seed),
    onDone: opts.onDone,
    resolved: false,
  };
  activeShootouts.set(roomId, active);
  beginKick(io, active);
}

/** Oda kapandı / rövanş / iptal — timer'ları temizle, durumu sil. */
export function cancelShootout(roomId: string): void {
  const active = activeShootouts.get(roomId);
  if (!active) return;
  clearTimers(active);
  activeShootouts.delete(roomId);
  const room = roomStore.getRoom(roomId);
  if (room) room.shootout = null;
}

function clearTimers(active: ActiveShootout): void {
  if (active.deadlineTimer) clearTimeout(active.deadlineTimer);
  if (active.revealTimer) clearTimeout(active.revealTimer);
  for (const t of active.botTimers) clearTimeout(t);
  active.deadlineTimer = null;
  active.revealTimer = null;
  active.botTimers = [];
}

/* ------------------------------ vuruş akışı ------------------------------ */

function buildState(
  active: ActiveShootout,
  phase: ShootoutState['phase'],
  endsAt: number,
): ShootoutState {
  const k = active.kick;
  const last = active.progress.attempts[active.progress.attempts.length - 1] ?? null;
  return {
    matchId: active.matchId,
    homeId: active.home.id,
    awayId: active.away.id,
    penaltiesHome: active.progress.penaltiesHome,
    penaltiesAway: active.progress.penaltiesAway,
    attempts: active.progress.attempts,
    kickIndex: active.kickIndex,
    round: k.round,
    shooterTeamId: k.shooterTeam.id,
    keeperTeamId: k.keeperTeam.id,
    shooter: k.shooter,
    keeper: k.keeper,
    phase,
    endsAt,
    remainingMs: phase === 'choosing' ? Math.max(0, endsAt - Date.now()) : 0,
    shooterChosen: active.choices.shot !== null,
    keeperChosen: active.choices.keeper !== null,
    lastAttempt: phase === 'revealed' ? last : null,
    winnerId: active.progress.winnerId,
  };
}

/** Takımın şu anki kontrolü: bot mu, insan bağlı mı? */
function controller(roomId: string, teamId: string): 'bot' | 'human' | 'offline' {
  const room = roomStore.getRoom(roomId);
  const p = room?.participants.find((x) => x.id === teamId);
  if (!p || p.isBot) return 'bot';
  return p.connected ? 'human' : 'offline';
}

function publish(io: TypedServer, active: ActiveShootout, state: ShootoutState): void {
  const room = roomStore.getRoom(active.roomId);
  if (!room) return;
  room.shootout = state;
  emitRoomState(io, room);
}

/**
 * Bu vuruş seriyi bitirebilir mi? (gol → atan taraf kazanır ya da kaçırma →
 * karşı taraf kazanır). Botların "baskı altında" biraz daha uzun düşünmesi için.
 */
function isDecisiveKick(active: ActiveShootout): boolean {
  const k = active.kick;
  const goal = applyKick(active.progress, {
    shooter: k.shooter,
    keeper: k.keeper,
    shotDirection: 'center',
    keeperDirection: 'left',
    outcome: 'goal',
  });
  const miss = applyKick(active.progress, {
    shooter: k.shooter,
    keeper: k.keeper,
    shotDirection: 'center',
    keeperDirection: 'center',
    outcome: 'saved',
  });
  return goal.winnerId !== null || miss.winnerId !== null;
}

function beginKick(io: TypedServer, active: ActiveShootout): void {
  const room = roomStore.getRoom(active.roomId);
  if (!room) {
    cancelShootout(active.roomId);
    return;
  }
  active.kick = kickRef(active.home, active.away, active.progress);
  active.choices = { shot: null, keeper: null };
  active.resolved = false;
  active.endsAt = Date.now() + SHOOTOUT_CHOOSE_MS;
  const state = buildState(active, 'choosing', active.endsAt);
  publish(io, active, state);
  io.to(active.roomId).emit('tournament:shootoutPrompt', state);

  // Bot taraflar insan gibi düşünüp seçer (kopuk insan için süre sonunda karar verilir).
  const k = active.kick;
  const decisive = isDecisiveKick(active);
  const scheduleBot = (teamId: string, role: 'shot' | 'keeper'): void => {
    if (controller(active.roomId, teamId) !== 'bot') return;
    const delay = botPenaltyDelayMs(teamId, SHOOTOUT_CHOOSE_MS, decisive);
    const timer = setTimeout(() => {
      if (active.resolved || active.kickIndex !== state.kickIndex) return;
      active.choices[role] = botDecision(active, teamId, role);
      publish(io, active, buildState(active, 'choosing', active.endsAt));
      maybeResolve(io, active);
    }, delay);
    active.botTimers.push(timer);
  };
  scheduleBot(k.shooterTeam.id, 'shot');
  scheduleBot(k.keeperTeam.id, 'keeper');

  active.deadlineTimer = setTimeout(
    () => resolve(io, active),
    SHOOTOUT_CHOOSE_MS + DEADLINE_GRACE_MS,
  );
}

function botDecision(active: ActiveShootout, teamId: string, role: 'shot' | 'keeper') {
  const k = active.kick;
  const ctx = {
    botId: teamId,
    matchId: active.matchId,
    kickIndex: active.kickIndex,
    shooter: k.shooter,
    keeper: k.keeper,
    attempts: active.progress.attempts,
    botTeamId: teamId,
  };
  return role === 'shot' ? botShotDirection(ctx) : botKeeperDirection(ctx);
}

function maybeResolve(io: TypedServer, active: ActiveShootout): void {
  if (active.choices.shot !== null && active.choices.keeper !== null) resolve(io, active);
}

function resolve(io: TypedServer, active: ActiveShootout): void {
  if (active.resolved) return;
  active.resolved = true;
  clearTimers(active);
  const room = roomStore.getRoom(active.roomId);
  if (!room) {
    cancelShootout(active.roomId);
    return;
  }
  const k = active.kick;

  // Seçmeyenler: bağlı insan → orta; kopuk insan / bot → bot zekâsı.
  const fill = (teamId: string, role: 'shot' | 'keeper'): PenaltyDirection => {
    const chosen = active.choices[role];
    if (chosen) return chosen;
    return controller(active.roomId, teamId) === 'human'
      ? 'center'
      : botDecision(active, teamId, role);
  };
  const shotDirection = fill(k.shooterTeam.id, 'shot');
  const keeperDirection = fill(k.keeperTeam.id, 'keeper');

  const outcome = resolveKick(k.shooter, k.keeper, shotDirection, keeperDirection, active.prng);
  active.progress = applyKick(active.progress, {
    shooter: k.shooter,
    keeper: k.keeper,
    shotDirection,
    keeperDirection,
    outcome,
  });
  const attempt = active.progress.attempts[active.progress.attempts.length - 1]!;

  const decided = active.progress.winnerId !== null;
  // Açıklanan durumda `shooter/keeper/round` HÂLÂ bu vuruşa aittir (active.kick).
  const state = buildState(active, 'revealed', Date.now() + SHOOTOUT_REVEAL_MS);
  publish(io, active, state);
  io.to(active.roomId).emit('tournament:shootoutKick', { state, attempt });

  active.revealTimer = setTimeout(() => {
    active.revealTimer = null;
    if (activeShootouts.get(active.roomId) !== active) return;
    if (decided) {
      // `room.shootout` burada TEMİZLENMEZ: kazanan banner'ı sonuç ağaca
      // işlenene kadar kalır (araya giren bir `room:state` yayını istemcide
      // seriyi "başlıyor…" durumuna düşürmesin). `finalize` / `cancelShootout` siler.
      const done = active.progress;
      activeShootouts.delete(active.roomId);
      active.onDone(done);
      return;
    }
    active.kickIndex += 1;
    beginKick(io, active);
  }, SHOOTOUT_REVEAL_MS);
}

/* ------------------------------ istemci girişi ------------------------------ */

/** `tournament:penaltyChoose` — yalnız sıradaki vuruşun insan tarafları. */
export function handlePenaltyChoose(
  io: TypedServer,
  socket: TypedSocket,
  payload: { matchId: string; kickIndex: number; direction: PenaltyDirection },
  ack: (res: AckResult<{ role: 'shooter' | 'keeper' }>) => void,
): void {
  const { roomId, playerId } = socket.data;
  if (!roomId || !playerId) return ack({ ok: false, error: 'Odada değilsin.' });
  // Payload istemciden gelir — şekli doğrulanmadan hiçbir alanına güvenilmez.
  if (!payload || typeof payload !== 'object') {
    return ack({ ok: false, error: 'Geçersiz istek.' });
  }
  const active = activeShootouts.get(roomId);
  if (!active || active.matchId !== payload.matchId) {
    return ack({ ok: false, error: 'Şu an oynanan bir seri penaltı yok.' });
  }
  if (
    active.resolved ||
    !Number.isInteger(payload.kickIndex) ||
    active.kickIndex !== payload.kickIndex
  ) {
    return ack({ ok: false, error: 'Bu vuruş için süre doldu.' });
  }
  if (!PENALTY_DIRECTIONS.includes(payload.direction)) {
    return ack({ ok: false, error: 'Geçersiz köşe.' });
  }
  const k = active.kick;
  let role: 'shooter' | 'keeper';
  if (playerId === k.shooterTeam.id) role = 'shooter';
  else if (playerId === k.keeperTeam.id) role = 'keeper';
  else return ack({ ok: false, error: 'Bu vuruşta rolün yok — izleyicisin.' });

  const participant = roomStore.getRoom(roomId)?.participants.find((p) => p.id === playerId);
  if (!participant || participant.isBot)
    return ack({ ok: false, error: 'Takımın bot kontrolünde.' });

  const slot = role === 'shooter' ? 'shot' : 'keeper';
  const changed = active.choices[slot] !== payload.direction;
  active.choices[slot] = payload.direction;
  ack({ ok: true, data: { role } });

  // Aynı köşe yeniden gönderildiyse odaya tekrar yayın yapma (spam koruması).
  if (changed) publish(io, active, buildState(active, 'choosing', active.endsAt));
  maybeResolve(io, active);
}
