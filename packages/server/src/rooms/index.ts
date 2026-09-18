import {
  beginDraft,
  cancelAuction,
  dropBidderIfLeading,
  handleBotTakeover,
} from '../auction/index.js';
import type { RoomState } from '@fal/shared';
import {
  cancelTournament,
  resendLiveMatch,
  startTournamentImmediately,
} from '../tournament/runTournament.js';
import { handlePenaltyChoose } from '../tournament/shootout.js';
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
      // Canlı maç sürüyorsa kaçırdığı `matchLive`i tekrar al (ticker açılsın).
      resendLiveMatch(socket, room.roomId);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('tournament:penaltyChoose', (payload, ack) => {
    handlePenaltyChoose(io, socket, payload, ack);
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

  /* ------------------------------ rövanş ------------------------------ */

  socket.on('room:rematchPropose', (ack) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) {
      ack({ ok: false, error: 'Bir odada değilsin' });
      return;
    }
    try {
      const room = roomStore.proposeRematch(roomId, playerId);
      ack({ ok: true, data: { roomState: room } });
      // Tek insan varsa (solo) teklif anında tamamlanır → doğrudan lobi.
      if (!maybeStartRematch(io, roomId)) broadcastRoomState(io, room);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('room:rematchRespond', ({ accept }, ack) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) {
      ack({ ok: false, error: 'Bir odada değilsin' });
      return;
    }
    try {
      const room = roomStore.respondRematch(roomId, playerId, accept === true);
      ack({ ok: true, data: { roomState: room } });
      if (!maybeStartRematch(io, roomId)) broadcastRoomState(io, room);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('room:rematchStart', (ack) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) {
      ack({ ok: false, error: 'Bir odada değilsin' });
      return;
    }
    try {
      const { room, kickedIds } = roomStore.startRematch(roomId, playerId);
      ack({ ok: true, data: { roomState: room } });
      finishRematchStart(io, room, kickedIds);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('room:rematchCancel', (ack) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) {
      ack({ ok: false, error: 'Bir odada değilsin' });
      return;
    }
    try {
      const room = roomStore.cancelRematch(roomId, playerId);
      ack({ ok: true, data: { roomState: room } });
      broadcastRoomState(io, room);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
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

/* ------------------------------ rövanş ------------------------------ */

/**
 * Odadaki tüm insanlar kabul ettiyse rövanşı başlatır (oda lobiye döner) ve
 * `true` döner. İnsan sayısı her değiştiğinde (kabul, çıkış, bot devri)
 * çağrılmalı — "son bekleyen çıktı" durumunda da tamamlanır.
 */
function maybeStartRematch(io: TypedServer, roomId: string): boolean {
  const room = roomStore.getRoom(roomId);
  if (!room || !roomStore.isRematchComplete(room)) return false;
  try {
    const { room: reset, kickedIds } = roomStore.startRematch(roomId);
    finishRematchStart(io, reset, kickedIds);
    return true;
  } catch (err) {
    console.error('[rooms] rövanş başlatılamadı:', err);
    return false;
  }
}

/**
 * Oda lobiye döndü: eski oyunun timer'larını temizle, çıkarılanları
 * bilgilendirip soketlerini odadan al, herkese yeni durumu yayınla.
 */
function finishRematchStart(io: TypedServer, room: RoomState, kickedIds: string[]): void {
  cancelAuction(room.roomId);
  cancelTournament(room.roomId);
  const kicked = new Set(kickedIds);
  for (const s of io.sockets.sockets.values()) {
    if (s.data.roomId !== room.roomId || !s.data.playerId) continue;
    if (!kicked.has(s.data.playerId)) continue;
    cancelBotTakeover(room.roomId, s.data.playerId);
    s.data.roomId = undefined;
    s.data.playerId = undefined;
    void s.leave(room.roomId);
    s.emit('room:kicked', {
      reason: `Rövanş sensiz başladı. İstersen ${room.code} koduyla lobiye yeniden katılabilirsin.`,
    });
  }
  // Bağlı olmayan (kopuk) kicked oyuncuların bekleyen devir timer'ları da gitsin.
  for (const id of kickedIds) cancelBotTakeover(room.roomId, id);
  console.log(
    `[rooms] ${room.code}: rövanş #${room.gameNumber} lobisi — ${room.participants.length} oyuncu, ${kickedIds.length} çıkarıldı`,
  );
  broadcastRoomState(io, room);
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

    // Oda bu arada lobiye döndüyse (rövanş) bot değil, lobi kuralı: silinir.
    if (current.phase === 'lobby') {
      const room = roomStore.leaveRoom(roomId, playerId);
      if (room) {
        io.to(roomId).emit('room:playerLeft', { playerId });
        broadcastRoomState(io, room);
      } else {
        closeRoom(roomId);
      }
      return;
    }

    const room = roomStore.convertToBot(roomId, playerId);
    if (room) {
      handleBotTakeover(io, roomId, playerId);
      // Bota dönüşen artık beklenmez — kalanların hepsi kabul ettiyse rövanş başlar.
      if (!maybeStartRematch(io, roomId)) broadcastRoomState(io, room);
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
    // Çıkan, rövanş teklifini reddetmiş sayılır; kalanlar tamamsa rövanş başlar.
    if (!maybeStartRematch(io, room.roomId)) broadcastRoomState(io, room);
  } else {
    closeRoom(roomId);
  }
}
