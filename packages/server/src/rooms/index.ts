import { beginDraft, cancelAuction, dropBidderIfLeading } from '../auction/index.js';
import { cancelTournament, startTournamentImmediately } from '../tournament/runTournament.js';
import type { TypedServer, TypedSocket } from '../socketTypes.js';
import { emitRoomState, redactRoomState } from './broadcast.js';
import { RoomError, roomStore } from './roomStore.js';

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
    if (room) broadcastRoomState(io, room);
  });
}

function handleLeave(io: TypedServer, socket: TypedSocket): void {
  const { roomId, playerId } = socket.data;
  if (!roomId || !playerId) return;
  const room = roomStore.leaveRoom(roomId, playerId);
  void socket.leave(roomId);
  socket.data.roomId = undefined;
  socket.data.playerId = undefined;
  if (room) {
    dropBidderIfLeading(io, room.roomId, playerId);
    io.to(room.roomId).emit('room:playerLeft', { playerId });
    broadcastRoomState(io, room);
  } else {
    // Oda kapandı — devam eden açık artırma / turnuva timer'larını temizle.
    cancelAuction(roomId);
    cancelTournament(roomId);
  }
}
