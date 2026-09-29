import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, Lang, ServerToClientEvents } from '@fal/shared';

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  playerId?: string;
  roomId?: string;
  /** Arayüz dili — sunucu mesajları bu dilde gider (`i18n.ts`). */
  lang?: Lang;
}

export type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
