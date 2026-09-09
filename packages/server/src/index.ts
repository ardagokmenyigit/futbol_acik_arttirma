import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@fal/shared';

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

const httpServer = createServer(app);

/** Faz 0: sadece bağlantı + hello-world doğrulaması. */
interface InterServerEvents {
  ping: () => void;
}
interface SocketData {
  playerId?: string;
  roomId?: string;
}

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
  httpServer,
  {
    cors: { origin: CLIENT_ORIGIN },
  },
);

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  // Faz 0 hello-world: istemci "hello" gönderir, sunucu ack ile yanıtlar.
  socket.on('hello', (msg, ack) => {
    console.log(`[hello] ${socket.id}: ${msg}`);
    ack(`merhaba ${socket.id} — sunucu seni duydu`);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected: ${socket.id} (${reason})`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`⚽ server hazır: http://localhost:${PORT}  (client origin: ${CLIENT_ORIGIN})`);
});
