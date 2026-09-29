import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@fal/shared';
import { currentLang, useLangStore } from './i18n/index.js';

export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Tek paylaşılan socket bağlantısı. autoConnect kapalı — uygulama başlatınca connect().
 * websocket öncelikli; proxy/host WebSocket'i düşürürse polling'e geri düşer.
 */
export const socket: AppSocket = io(SERVER_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  // Sunucu hata / uyarı mesajlarını bu dilde gönderir; her (yeniden)
  // bağlanmada güncel dil gider.
  auth: (cb) => cb({ lang: currentLang() }),
});

// Dil değişince açık bağlantıya bildir (kapalıysa bağlanırken `auth` taşır).
useLangStore.subscribe((s, prev) => {
  if (s.lang !== prev.lang && socket.connected) socket.emit('client:setLang', { lang: s.lang });
});
