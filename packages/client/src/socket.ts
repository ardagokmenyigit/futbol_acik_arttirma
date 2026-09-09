import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@fal/shared';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Tek paylaşılan socket bağlantısı. autoConnect kapalı — uygulama başlatınca connect().
 * websocket öncelikli; proxy/host WebSocket'i düşürürse polling'e geri düşer.
 */
export const socket: AppSocket = io(SERVER_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
});
