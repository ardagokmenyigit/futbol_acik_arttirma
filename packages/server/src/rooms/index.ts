import {
  beginDraft,
  cancelAuction,
  dropBidderIfLeading,
  handleBotTakeover,
} from '../auction/index.js';
import { cancelTournament, startTournamentImmediately } from '../tournament/runTournament.js';
import type { TypedServer, TypedSocket } from '../socketTypes.js';
import { emitRoomState, redactRoomState } from './broadcast.js';
import { DISCONNECT_GRACE_MS, RoomError, roomStore } from './roomStore.js';

/** Odadaki herkese güncel tam durumu yayınlar (client sadece render eder). */
const broadcastRoomState = emitRoomState;

function errorMessage(err: unknown): string {
  if (err instanceof RoomError) return err.message;
  console.error('[rooms] beklenmeyen hata:', err);
  return 'Beklenmeyen bir hata oluştu';
}

/** Bir socket için tüm `room:*` event handler'larını bağlar. */
export function registerRoomHandlers(io: TypedServer, socket: TypedSocket): void {
  socket.on('room:create', ({ nickname, config }, ack) => {
    try {
      const { room, you } = roomStore.createRoom(nickname, config);
      socket.data.playerId = you.id;
      socket.data.roomId = room.roomId;
      void socket.join(room.roomId);
      ack({ ok: true, data: { roomState: room, you } });
      broadcastRoomState(io, room);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('room:join', ({ code, nickname }, ack) => {
    try {
      const { room, you } = roomStore.joinRoom(code, nickname);
      socket.data.playerId = you.id;
      socket.data.roomId = room.roomId;
      void socket.join(room.roomId);
      ack({ ok: true, data: { roomState: room, you } });
      socket.to(room.roomId).emit('room:playerJoined', you);
      broadcastRoomState(io, room);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('room:rejoin', ({ roomId, playerId }, ack) => {
    try {
      const { room, you } = roomStore.rejoinRoom(roomId, playerId);
      // Geri döndü — bekleyen bot devrini iptal et.
      cancelBotTakeover(room.roomId, you.id);
      socket.data.playerId = you.id;
      socket.data.roomId = room.roomId;
      void socket.join(room.roomId);
      // Draft sırasında gizli bütçe modunda geri dönen oyuncu da yalnız
      // kendi bütçesini görür.
      ack({ ok: true, data: { roomState: redactRoomState(room, you.id), you } });
      broadcastRoomState(io, room);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('room:setReady', ({ ready }) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    try {
      const room = roomStore.setReady(roomId, playerId, ready);
      broadcastRoomState(io, room);
    } catch (err) {
      socket.emit('room:error', { message: errorMessage(err) });
    }
  });

  socket.on('room:setFormat', ({ tournamentSize }, ack) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) {
      ack({ ok: false, error: 'Bir odada değilsin' });
      return;
    }
    try {
      const room = roomStore.setFormat(roomId, playerId, tournamentSize);
      ack({ ok: true, data: { roomState: room } });
      broadcastRoomState(io, room);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('room:start', (ack) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) {
      ack({ ok: false, error: 'Bir odada değilsin' });
      return;
    }
    try {
      const room = roomStore.startDraft(roomId, playerId);
      ack({ ok: true, data: { roomState: room } });
      broadcastRoomState(io, room);
      beginDraft(io, room.roomId);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('room:startSimulation', () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    const room = roomStore.getRoom(roomId);
    if (!room || room.hostId !== playerId) return;
    startTournamentImmediately(roomId);
  });

  socket.on('room:leave', () => {
    handleLeave(io, socket);
  });

  socket.on('disconnect', () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    const room = roomStore.markDisconnected(roomId, playerId);
    if (!room) return;
    broadcastRoomState(io, room);
    // Oyun sürüyorsa süresiz bekleyemeyiz: yeniden bağlanma penceresi
    // dolunca yerine bot geçer (aksi halde tur onun sırasında kilitlenir
    // ve terk edilmiş odalar sunucuda süresiz yaşardı).
    if (room.phase !== 'lobby') scheduleBotTakeover(io, roomId, playerId);
  });
}

/* --------------------- kopan bağlantı → bot devri --------------------- */

/** roomId:playerId -> bekleyen devir timer'ı. */
const takeoverTimers = new Map<string, NodeJS.Timeout>();

const takeoverKey = (roomId: string, playerId: string): string => `${roomId}:${playerId}`;

/** Oyuncu geri döndüğünde (ya da odadan çıktığında) bekleyen devri iptal et. */
function cancelBotTakeover(roomId: string, playerId: string): void {
  const key = takeoverKey(roomId, playerId);
  const timer = takeoverTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    takeoverTimers.delete(key);
  }
}

function scheduleBotTakeover(io: TypedServer, roomId: string, playerId: string): void {
  cancelBotTakeover(roomId, playerId);
  const key = takeoverKey(roomId, playerId);
  const timer = setTimeout(() => {
    takeoverTimers.delete(key);
    const current = roomStore.getRoom(roomId);
    // Bu arada geri bağlandıysa dokunma.
    const participant = current?.participants.find((p) => p.id === playerId);
    if (!current || !participant || participant.connected || participant.isBot) return;

    const room = roomStore.convertToBot(roomId, playerId);
    if (room) {
      handleBotTakeover(io, roomId, playerId);
      broadcastRoomState(io, room);
    } else {
      closeRoom(roomId);
    }
  }, DISCONNECT_GRACE_MS);
  takeoverTimers.set(key, timer);
}

/** Oda kapandı — devam eden açık artırma / turnuva timer'larını temizle. */
function closeRoom(roomId: string): void {
  cancelAuction(roomId);
  cancelTournament(roomId);
  for (const key of [...takeoverTimers.keys()]) {
    if (key.startsWith(`${roomId}:`)) {
      clearTimeout(takeoverTimers.get(key)!);
      takeoverTimers.delete(key);
    }
  }
}

function handleLeave(io: TypedServer, socket: TypedSocket): void {
  const { roomId, playerId } = socket.data;
  if (!roomId || !playerId) return;

  // Lobide katılımcı silinir; oyun başladıysa yerine bot geçer.
  const wasInGame = roomStore.getRoom(roomId)?.phase !== 'lobby';
  const room = roomStore.leaveRoom(roomId, playerId);

  cancelBotTakeover(roomId, playerId);
  void socket.leave(roomId);
  socket.data.roomId = undefined;
  socket.data.playerId = undefined;

  if (room) {
    if (wasInGame) {
      // Katılımcı duruyor (artık bot): teklifi geçerli kalır, sırayı devralır.
      handleBotTakeover(io, room.roomId, playerId);
    } else {
      dropBidderIfLeading(io, room.roomId, playerId);
    }
    io.to(room.roomId).emit('room:playerLeft', { playerId });
    broadcastRoomState(io, room);
  } else {
    closeRoom(roomId);
  }
}
