import type { AckResult, Bid, Footballer, RoomState } from '@fal/shared';
import { runLeague } from '../league/runLeague.js';
import { roomStore } from '../rooms/roomStore.js';
import type { TypedServer, TypedSocket } from '../socketTypes.js';
import { findFootballer, loadFootballers, shuffled } from './pool.js';
import { positionCount, validateBid } from './validateBid.js';

const TICK_MS = 1000;
/**
 * Bitişe bu süreden az kala gelen teklif turu uzatır (sniping önleme).
 * Teklif sonrası rakibin karşılık verebilmesi için garanti edilen süre.
 */
const ANTI_SNIPE_MS = 5000;

interface RoomTimers {
  tick: NodeJS.Timeout;
  end: NodeJS.Timeout;
}
const timers = new Map<string, RoomTimers>();

/** Lobi 'start' sonrası: havuzu karıştır, ilk round'u başlat. */
export function beginDraft(io: TypedServer, roomId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room || room.phase !== 'draft') return;
  room.remainingPoolIds = shuffled(loadFootballers().map((f) => f.id));
  startNextRound(io, roomId);
}

/** Oda silinince / draft yarıda kalınca timer'ları temizle. */
export function cancelAuction(roomId: string): void {
  const t = timers.get(roomId);
  if (!t) return;
  clearInterval(t.tick);
  clearTimeout(t.end);
  timers.delete(roomId);
}

/** Ayrılan oyuncu aktif turda en yüksek teklif sahibiyse teklifi düşür. */
export function dropBidderIfLeading(io: TypedServer, roomId: string, playerId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room?.auction || room.auction.highestBid?.playerId !== playerId) return;
  room.auction.highestBid = null;
  io.to(roomId).emit('auction:bid', { highestBid: null, history: room.auction.history });
  io.to(roomId).emit('room:state', room);
}

export function handleBid(
  io: TypedServer,
  socket: TypedSocket,
  rawAmount: unknown,
  ack: (res: AckResult<{ highestBid: Bid }>) => void,
): void {
  const { roomId, playerId } = socket.data;
  if (!roomId || !playerId) {
    ack({ ok: false, error: 'Bir odada değilsin' });
    return;
  }
  const room = roomStore.getRoom(roomId);
  if (!room || room.phase !== 'draft' || !room.auction) {
    ack({ ok: false, error: 'Şu an aktif bir açık artırma yok' });
    return;
  }
  const bidder = room.participants.find((p) => p.id === playerId);
  if (!bidder) {
    ack({ ok: false, error: 'Katılımcı bulunamadı' });
    return;
  }

  const check = validateBid(room.auction, bidder, room.config, rawAmount);
  if (!check.ok) {
    ack({ ok: false, error: check.error });
    return;
  }

  const bid: Bid = { playerId, amount: check.amount, at: Date.now() };
  room.auction.highestBid = bid;
  room.auction.history.push(bid);

  if (room.auction.endsAt - Date.now() < ANTI_SNIPE_MS) {
    room.auction.endsAt = Date.now() + ANTI_SNIPE_MS;
    rescheduleEnd(io, roomId, ANTI_SNIPE_MS);
  }

  ack({ ok: true, data: { highestBid: bid } });
  io.to(roomId).emit('auction:bid', { highestBid: bid, history: room.auction.history });
  io.to(roomId).emit('room:state', room);
}

/* --------------------------- iç mantık --------------------------- */

function anyoneCanUse(room: RoomState, f: Footballer): boolean {
  return room.participants.some(
    (p) =>
      p.squad.length < room.config.squadSize &&
      positionCount(p, f.position) < room.config.squad[f.position] &&
      p.budget >= f.basePrice,
  );
}

function everySquadFull(room: RoomState): boolean {
  return room.participants.every((p) => p.squad.length >= room.config.squadSize);
}

function startNextRound(io: TypedServer, roomId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room) return;
  cancelAuction(roomId);

  if (everySquadFull(room)) {
    finishDraft(io, room);
    return;
  }

  // Havuzdan kullanılabilir bir sonraki futbolcuyu çek (kimsenin
  // alamayacağı futbolcuları atla). next bulunamazsa havuz tükenmiştir.
  let next: Footballer | undefined;
  while (room.remainingPoolIds.length > 0) {
    const id = room.remainingPoolIds.shift();
    if (!id) break;
    const candidate = findFootballer(id);
    if (candidate && anyoneCanUse(room, candidate)) {
      next = candidate;
      break;
    }
  }

  if (!next) {
    finishDraft(io, room);
    return;
  }

  const round = (room.auction?.round ?? 0) + 1;
  const durationMs = room.config.bidDurationSec * 1000;
  room.auction = {
    round,
    footballer: next,
    highestBid: null,
    endsAt: Date.now() + durationMs,
    history: [],
  };

  io.to(roomId).emit('auction:started', room.auction);
  io.to(roomId).emit('room:state', room);

  const tick = setInterval(() => emitTick(io, roomId), TICK_MS);
  const end = setTimeout(() => endRound(io, roomId), durationMs);
  timers.set(roomId, { tick, end });
}

function emitTick(io: TypedServer, roomId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room?.auction) return;
  io.to(roomId).emit('auction:tick', {
    round: room.auction.round,
    remainingMs: Math.max(0, room.auction.endsAt - Date.now()),
  });
}

function rescheduleEnd(io: TypedServer, roomId: string, inMs: number): void {
  const t = timers.get(roomId);
  if (!t) return;
  clearTimeout(t.end);
  t.end = setTimeout(() => endRound(io, roomId), inMs);
}

function endRound(io: TypedServer, roomId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room?.auction) return;
  cancelAuction(roomId);

  const { footballer, highestBid, round } = room.auction;
  const winner = highestBid
    ? room.participants.find((p) => p.id === highestBid.playerId)
    : undefined;

  if (highestBid && winner) {
    winner.budget -= highestBid.amount;
    winner.squad.push(footballer);
  }

  io.to(roomId).emit('auction:won', {
    round,
    footballerId: footballer.id,
    footballerName: footballer.name,
    winnerId: winner?.id ?? null,
    winnerNickname: winner?.nickname ?? null,
    amount: winner ? highestBid!.amount : 0,
  });
  io.to(roomId).emit('room:state', room);

  startNextRound(io, roomId);
}

function finishDraft(io: TypedServer, room: RoomState): void {
  cancelAuction(room.roomId);
  room.auction = null;
  room.phase = 'simulation';
  io.to(room.roomId).emit('room:state', room);
  io.to(room.roomId).emit('auction:finished', room);
  // Lig/simülasyon motorunu devral (phase === 'simulation').
  runLeague(io, room.roomId);
}
