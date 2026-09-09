import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { registerAuctionHandlers } from './auction/index.js';
import { registerRoomHandlers } from './rooms/index.js';
import type { InterServerEvents, SocketData, TypedServer } from './socketTypes.js';
import type { ClientToServerEvents, ServerToClientEvents } from '@fal/shared';

const PORT = Number(process.env.PORT ?? 3001);

/**
 * İzin verilen istemci origin'leri. Virgülle ayrılmış birden fazla değer
 * verilebilir (örn. prod Vercel URL'si + yerel geliştirme).
 * Prod'da Render/host paneline `CLIENT_ORIGIN` olarak Vercel adresini girin.
 */
const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/** '*' verildiyse tüm origin'lere izin ver (yalnız hızlı deneme için). */
const ALLOW_ANY = ALLOWED_ORIGINS.includes('*');

/**
 * Yerel geliştirme origin'i mi? (localhost / 127.0.0.1 / ::1, port fark etmez)
 * Vite 5173 doluysa 5174'e kayar, kimi zaman 127.0.0.1 yazılır — bunların
 * hepsi geliştiricinin kendi makinesi, hepsine izin veriyoruz. Böylece iki
 * tarayıcı penceresiyle yerel çok oyunculu test sorunsuz çalışır.
 */
function isLocalhostOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin: string | undefined): boolean {
  // origin yoksa (curl, health check, aynı-origin istek) serbest bırak.
  if (!origin) return true;
  if (ALLOW_ANY) return true;
  if (isLocalhostOrigin(origin)) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
};

const app = express();
app.use(cors(corsOptions));
app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

const httpServer = createServer(app);

const io: TypedServer = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: {
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
  },
});

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  // Faz 0 hello-world: istemci "hello" gönderir, sunucu ack ile yanıtlar.
  socket.on('hello', (msg, ack) => {
    console.log(`[hello] ${socket.id}: ${msg}`);
    ack(`merhaba ${socket.id} — sunucu seni duydu`);
  });

  registerRoomHandlers(io, socket);
  registerAuctionHandlers(io, socket);

  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected: ${socket.id} (${reason})`);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(
    `⚽ server hazır: http://0.0.0.0:${PORT}  (izinli origin: ${ALLOW_ANY ? '*' : ALLOWED_ORIGINS.join(', ')})`,
  );
});
