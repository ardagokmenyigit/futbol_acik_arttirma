/**
 * Son pas kuralı için odaklı uçtan uca test.
 * Dört insanlı bir draftta ilk üç açıcı pas verir. Üçüncü pas, futbolcuyu
 * kalan tek uygun alıcıya beş saniyelik otomatik atama ile vermelidir.
 *
 * Çalıştır: npm run build -w @fal/shared; npm run build -w @fal/server;
 * node packages/server/dist/scripts/e2eTerminalPass.js
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { io, type Socket } from 'socket.io-client';
import type {
  AckResult,
  ClientToServerEvents,
  Participant,
  RoomConfig,
  RoomState,
  ServerToClientEvents,
} from '@fal/shared';

const port = 5000 + Math.floor(Math.random() * 1000);
const serverUrl = `http://localhost:${port}`;
const repo = fileURLToPath(new URL('../../../..', import.meta.url));
const config: Partial<RoomConfig> = { tournamentSize: 4, turnDurationSec: 3, bidDurationSec: 1 };

type S = Socket<ServerToClientEvents, ClientToServerEvents>;
type Enter = { roomState: RoomState; you: Participant };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check: () => boolean, label: string, timeoutMs = 12_000): Promise<void> {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(`Zaman aşımı: ${label}`);
    await sleep(25);
  }
}

class Player {
  state: RoomState | null = null;
  youId = '';
  autoAssigned = false;

  constructor(readonly socket: S) {
    socket.on('room:state', (state) => (this.state = state));
    socket.on('auction:passed', (event) => {
      if (event.autoAssigned) this.autoAssigned = true;
    });
  }

  static async connect(): Promise<Player> {
    const socket: S = io(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    return new Player(socket);
  }

  private ack<T>(event: string, resolve: (value: T) => void, reject: (error: Error) => void) {
    return (result: AckResult<T>) =>
      result.ok ? resolve(result.data) : reject(new Error(`${event}: ${result.error}`));
  }

  create(nickname: string): Promise<Enter> {
    return new Promise((resolve, reject) =>
      this.socket.emit('room:create', { nickname, config }, this.ack('create', resolve, reject)),
    );
  }

  join(code: string, nickname: string): Promise<Enter> {
    return new Promise((resolve, reject) =>
      this.socket.emit('room:join', { code, nickname }, this.ack('join', resolve, reject)),
    );
  }

  start(): Promise<{ roomState: RoomState }> {
    return new Promise((resolve, reject) =>
      this.socket.emit('room:start', this.ack('start', resolve, reject)),
    );
  }

  pass(): Promise<{ passesLeft: number }> {
    return new Promise((resolve, reject) =>
      this.socket.emit('auction:pass', this.ack('pass', resolve, reject)),
    );
  }
}

const server = spawn(process.execPath, ['packages/server/dist/index.js'], {
  cwd: repo,
  detached: true,
  env: { ...process.env, PORT: String(port), CLIENT_ORIGIN: '*' },
  stdio: 'ignore',
});

try {
  await sleep(1000);
  const players = await Promise.all([
    Player.connect(),
    Player.connect(),
    Player.connect(),
    Player.connect(),
  ]);
  const [a, b, c, d] = players;
  const { roomState, you } = await a.create('A');
  a.youId = you.id;
  for (const [player, nickname] of [
    [b, 'B'],
    [c, 'C'],
    [d, 'D'],
  ] as const) {
    const joined = await player.join(roomState.code, nickname);
    player.youId = joined.you.id;
    player.socket.emit('room:setReady', { ready: true });
  }

  await a.start();
  await waitFor(() => !!a.state?.auction && a.state.auction.phase === 'opening', 'ilk açılış');

  for (let passNumber = 1; passNumber <= 3; passNumber++) {
    const auction = a.state!.auction!;
    const opener = players.find((player) => player.youId === auction.openerId)!;
    const previousPassers = new Set(auction.passedIds);
    await opener.pass();
    await waitFor(
      () => a.state?.auction?.passedIds.length === passNumber,
      `${passNumber}. pasın yayınlanması`,
    );
    const next = a.state!.auction!;
    if (next.passedIds.some((id) => previousPassers.has(id) && id === opener.youId)) {
      throw new Error('Bir katılımcı aynı turda ikinci kez pas verdi');
    }

    if (passNumber < 3) {
      if (next.phase !== 'opening' || next.eligibleIds.length !== 4 - passNumber) {
        throw new Error(`${passNumber}. pas sonrası açılış doğru devredilmedi`);
      }
      if (next.passedIds.includes(next.openerId)) {
        throw new Error('Daha önce pas veren katılımcı yeniden açılış sahibi oldu');
      }
    } else {
      if (
        next.phase !== 'bidding' ||
        next.eligibleIds.length !== 1 ||
        next.highestBid?.playerId !== next.eligibleIds[0] ||
        next.endsAt - Date.now() < 4000
      ) {
        throw new Error('Son iki alıcıdaki pas otomatik atamaya dönüşmedi');
      }
    }
  }

  if (!players.some((player) => player.autoAssigned)) {
    throw new Error('Otomatik atama olayı tüm istemcilere yayınlanmadı');
  }
  console.log('✓ Üç pas sonrası futbolcu kalan tek alıcıya 5 saniyelik otomatik atama ile verildi');
  for (const player of players) player.socket.disconnect();
} finally {
  try {
    process.kill(-server.pid!, 'SIGTERM');
  } catch {
    // Sunucu zaten kapanmış olabilir.
  }
}
