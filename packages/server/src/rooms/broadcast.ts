import { HIDDEN_BUDGET, type RoomState } from '@fal/shared';
import type { TypedServer } from '../socketTypes.js';

/**
 * Gizli bütçe modu draft sırasında etkin mi? Lobide bütün bütçeler zaten
 * `startingBudget`'e eşit (bilgi yok), draft bitince bütçeler açılır.
 */
function shouldRedact(room: RoomState): boolean {
  return room.config.hiddenBudgets && room.phase === 'draft';
}

/**
 * `viewerId` dışındaki katılımcıların `budget` alanını `HIDDEN_BUDGET` yapar.
 * Kadrolar görünür kalır — yalnız kalan para gizlenir. Sığ kopya; iç içe
 * futbolcu nesneleri paylaşılır (salt-okunur gösterilir).
 */
export function redactRoomState(room: RoomState, viewerId: string | undefined): RoomState {
  if (!shouldRedact(room)) return room;
  return {
    ...room,
    participants: room.participants.map((p) =>
      p.id === viewerId ? p : { ...p, budget: HIDDEN_BUDGET },
    ),
  };
}

/**
 * `room:state` yayını — tek doğruluk kaynağı sunucu (CLAUDE.md §5).
 * Açık bütçe modunda odaya tek mesaj gider. Gizli bütçe modunda draft
 * sırasında her sokete YALNIZ kendi bütçesini içeren kopya gönderilir.
 */
export function emitRoomState(io: TypedServer, room: RoomState): void {
  if (!shouldRedact(room)) {
    io.to(room.roomId).emit('room:state', room);
    return;
  }
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.roomId !== room.roomId) continue;
    socket.emit('room:state', redactRoomState(room, socket.data.playerId));
  }
}
