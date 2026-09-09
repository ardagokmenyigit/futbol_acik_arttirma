import { randomUUID } from 'node:crypto';
import {
  DEFAULT_ROOM_CONFIG,
  type Participant,
  type Position,
  type RoomConfig,
  type RoomState,
} from '@fal/shared';
import { generateUniqueRoomCode } from './roomCode.js';

const NICKNAME_MAX = 20;

/** Alan bazlı hata — handler bunu ack.error'a çevirir. */
export class RoomError extends Error {}

/**
 * In-memory oda deposu. Sunucu tek doğruluk kaynağıdır (CLAUDE.md §5).
 * Tüm mutasyonlar buradan geçer; handler'lar sadece bu API'yi çağırır.
 */
class RoomStore {
  private readonly rooms = new Map<string, RoomState>();
  private readonly codeIndex = new Map<string, string>(); // code -> roomId

  getRoom(roomId: string): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  getRoomByCode(code: string): RoomState | undefined {
    const roomId = this.codeIndex.get(normalizeCode(code));
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  /** Yeni oda + host katılımcısı oluşturur. */
  createRoom(
    nickname: string,
    configOverride?: Partial<RoomConfig>,
  ): { room: RoomState; you: Participant } {
    const cleanNick = validateNickname(nickname);
    const config = mergeConfig(configOverride);

    const roomId = randomUUID();
    const code = generateUniqueRoomCode((c) => this.codeIndex.has(c));
    const host = makeParticipant(cleanNick, config, true);

    const room: RoomState = {
      roomId,
      code,
      phase: 'lobby',
      hostId: host.id,
      config,
      participants: [host],
      auction: null,
      remainingPoolIds: [],
      league: null,
    };

    this.rooms.set(roomId, room);
    this.codeIndex.set(code, roomId);
    return { room, you: host };
  }

  /** Koda göre odaya yeni katılımcı ekler. */
  joinRoom(code: string, nickname: string): { room: RoomState; you: Participant } {
    const room = this.getRoomByCode(code);
    if (!room) throw new RoomError('Böyle bir oda bulunamadı');
    if (room.phase !== 'lobby') throw new RoomError('Oyun başlamış, odaya katılınamaz');
    if (room.participants.length >= room.config.maxPlayers) {
      throw new RoomError(`Oda dolu (en fazla ${room.config.maxPlayers} kişi)`);
    }

    const cleanNick = validateNickname(nickname);
    if (room.participants.some((p) => p.nickname.toLowerCase() === cleanNick.toLowerCase())) {
      throw new RoomError('Bu takma ad odada kullanılıyor');
    }

    const participant = makeParticipant(cleanNick, room.config, false);
    room.participants.push(participant);
    return { room, you: participant };
  }

  /** Bağlantısı kopan bir oyuncunun kaldığı yerden dönmesi (CLAUDE.md §4.5). */
  rejoinRoom(roomId: string, playerId: string): { room: RoomState; you: Participant } {
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomError('Oda artık mevcut değil');
    const participant = room.participants.find((p) => p.id === playerId);
    if (!participant) throw new RoomError('Bu odada kayıtlı değilsin');
    participant.connected = true;
    return { room, you: participant };
  }

  setReady(roomId: string, playerId: string, ready: boolean): RoomState {
    const room = this.requireRoom(roomId);
    const participant = room.participants.find((p) => p.id === playerId);
    if (!participant) throw new RoomError('Katılımcı bulunamadı');
    participant.isReady = ready;
    return room;
  }

  /** Oyuncu odadan ayrılır. Host ayrılırsa sıradaki bağlı oyuncu host olur. */
  leaveRoom(roomId: string, playerId: string): RoomState | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    room.participants = room.participants.filter((p) => p.id !== playerId);

    if (room.participants.length === 0) {
      this.deleteRoom(room);
      return undefined;
    }

    if (room.hostId === playerId) {
      const nextHost = room.participants.find((p) => p.connected) ?? room.participants[0]!;
      nextHost.isHost = true;
      room.hostId = nextHost.id;
    }
    return room;
  }

  /**
   * Socket kopunca: katılımcıyı "bağlı değil" işaretler ama odadan silmez.
   * Lobide host koparsa hostluk bağlı bir oyuncuya devredilir (aksi halde
   * kimse oyunu başlatamaz).
   */
  markDisconnected(roomId: string, playerId: string): RoomState | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    const participant = room.participants.find((p) => p.id === playerId);
    if (!participant) return room;
    participant.connected = false;

    if (room.phase === 'lobby' && room.hostId === playerId) {
      const nextHost = room.participants.find((p) => p.connected);
      if (nextHost) {
        participant.isHost = false;
        nextHost.isHost = true;
        room.hostId = nextHost.id;
      }
    }
    return room;
  }

  /**
   * Host oyunu başlatabilir mi? Bağlantısı kopuk oyuncular "hazır" kilidini
   * açamayacağı için sadece BAĞLI oyuncular üzerinden değerlendirilir.
   */
  canStart(room: RoomState): { ok: true } | { ok: false; reason: string } {
    if (room.phase !== 'lobby') return { ok: false, reason: 'Oyun zaten başlamış' };
    if (room.participants.length > room.config.maxPlayers) {
      return { ok: false, reason: `En fazla ${room.config.maxPlayers} oyuncu` };
    }
    const connected = room.participants.filter((p) => p.connected);
    if (connected.length < room.config.minPlayers) {
      return { ok: false, reason: `En az ${room.config.minPlayers} bağlı oyuncu gerekli` };
    }
    if (!connected.every((p) => p.isReady)) {
      return { ok: false, reason: 'Bağlı oyuncuların hepsi hazır değil' };
    }
    return { ok: true };
  }

  /**
   * Lobiden draft fazına geçiş. Açık artırma motorunun (ayrı görev) devralması
   * için fazı 'draft' yapar; havuz doldurma auction/ tarafında yapılacak.
   */
  startDraft(roomId: string, requesterId: string): RoomState {
    const room = this.requireRoom(roomId);
    if (room.hostId !== requesterId) throw new RoomError('Sadece host başlatabilir');
    const gate = this.canStart(room);
    if (!gate.ok) throw new RoomError(gate.reason);
    room.phase = 'draft';
    return room;
  }

  private requireRoom(roomId: string): RoomState {
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomError('Oda bulunamadı');
    return room;
  }

  private deleteRoom(room: RoomState): void {
    this.codeIndex.delete(room.code);
    this.rooms.delete(room.roomId);
  }
}

/* ----------------------------- yardımcılar ----------------------------- */

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function validateNickname(raw: string): string {
  const nick = raw.trim();
  if (nick.length === 0) throw new RoomError('Takma ad boş olamaz');
  if (nick.length > NICKNAME_MAX) {
    throw new RoomError(`Takma ad en fazla ${NICKNAME_MAX} karakter`);
  }
  return nick;
}

function mergeConfig(override?: Partial<RoomConfig>): RoomConfig {
  const squad: Record<Position, number> = {
    ...DEFAULT_ROOM_CONFIG.squad,
    ...(override?.squad ?? {}),
  };
  const squadSize = (Object.values(squad) as number[]).reduce((a, b) => a + b, 0);
  return {
    ...DEFAULT_ROOM_CONFIG,
    ...override,
    squad,
    squadSize,
  };
}

function makeParticipant(nickname: string, config: RoomConfig, isHost: boolean): Participant {
  return {
    id: randomUUID(),
    nickname,
    isHost,
    isReady: false,
    connected: true,
    budget: config.startingBudget,
    squad: [],
  };
}

export const roomStore = new RoomStore();
