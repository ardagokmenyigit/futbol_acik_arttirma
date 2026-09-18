/**
 * SUNUCU SAĞLAMLIK TESTİ — bozuk / kötü niyetli istemci paketleri sunucuyu
 * düşürmemeli (bkz. server/src/harden.ts).
 *
 * Gerçek sunucu açılır, bir istemci oda kurar ve sırayla: ack bekleyen
 * event'lere ack'siz paket, null / string / yanlış tipli payload, handler'ı
 * patlatan girdi (`room:setReady` null → destructuring), bilinmeyen event,
 * 500 paketlik spam ve spam sonrası normal istek gönderir. Her adımdan sonra
 * süreç ayakta mı (`/health`) ve yanıt veriyor mu kontrol edilir.
 *
 * 18 Eylül 2026'dan önce ilk adım (`ack is not a function`) süreci öldürüyordu.
 *
 * Çalıştır: npx tsx packages/server/src/scripts/e2eHardening.ts
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@fal/shared';

const PORT = 4000 + Math.floor(Math.random() * 1000);
const SERVER_URL = `http://localhost:${PORT}`;
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));

let failures = 0;
function ok(cond: boolean, msg: string): void {
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
  if (!cond) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type S = Socket<ServerToClientEvents, ClientToServerEvents>;
/** Tip denetimini bilerek aşan emit — testin amacı sözleşme dışı paket. */
const raw = (s: S): { emit: (event: string, ...args: unknown[]) => void } =>
  s as unknown as { emit: (event: string, ...args: unknown[]) => void };

const server = spawn(`${REPO}node_modules/.bin/tsx`, ['packages/server/src/index.ts'], {
  cwd: REPO,
  detached: true,
  env: { ...process.env, PORT: String(PORT), CLIENT_ORIGIN: '*' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout?.on('data', (d: Buffer) => (serverLog += d.toString()));
server.stderr?.on('data', (d: Buffer) => (serverLog += d.toString()));
let exitCode: number | null = null;
server.on('exit', (c) => (exitCode = c));
const stopServer = (): void => {
  try {
    process.kill(-server.pid!, 'SIGTERM');
  } catch {
    /* zaten kapalı */
  }
};
process.on('exit', stopServer);
await sleep(2500);

const alive = async (): Promise<boolean> => {
  if (exitCode !== null) return false;
  try {
    return (await fetch(`${SERVER_URL}/health`)).ok;
  } catch {
    return false;
  }
};

try {
  const s: S = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise<void>((r) => s.on('connect', () => r()));
  await new Promise<void>((r) =>
    s.emit('room:create', { nickname: 'Fuzz', config: {} }, () => r()),
  );
  const r = raw(s);

  const probes: [string, () => void][] = [
    [
      "ack'siz tournament:penaltyChoose",
      () => r.emit('tournament:penaltyChoose', { matchId: 'x', kickIndex: 0, direction: 'left' }),
    ],
    ["ack'siz room:create", () => r.emit('room:create', { nickname: 'Y', config: {} })],
    ["ack'siz room:rejoin", () => r.emit('room:rejoin', { roomId: 'x', playerId: 'y' })],
    ["ack'siz auction:bid", () => r.emit('auction:bid', { amount: 5 })],
    ['penaltyChoose payload null', () => r.emit('tournament:penaltyChoose', null, () => undefined)],
    [
      'penaltyChoose payload string',
      () => r.emit('tournament:penaltyChoose', 'garbage', () => undefined),
    ],
    [
      'penaltyChoose kickIndex string',
      () =>
        r.emit(
          'tournament:penaltyChoose',
          { matchId: 'x', kickIndex: 'a', direction: 'left' },
          () => undefined,
        ),
    ],
    [
      'penaltyChoose direction nesne',
      () =>
        r.emit(
          'tournament:penaltyChoose',
          { matchId: 'x', kickIndex: 0, direction: {} },
          () => undefined,
        ),
    ],
    ['room:setReady null (handler içinde istisna)', () => r.emit('room:setReady', null)],
    ['room:setReady string', () => r.emit('room:setReady', 'x')],
    ['room:join payload null', () => r.emit('room:join', null, () => undefined)],
    ['bilinmeyen event', () => r.emit('nope:nope', {})],
    [
      '500 paket spam',
      () => {
        for (let i = 0; i < 500; i++) r.emit('room:setReady', { ready: i % 2 === 0 });
      },
    ],
  ];
  for (const [name, fn] of probes) {
    fn();
    await sleep(700);
    ok(await alive(), `sunucu ayakta — ${name}`);
    if (exitCode !== null) break;
  }

  // Spam sonrası (yeni saniye penceresinde) meşru istek yanıt almalı.
  await sleep(1200);
  const answered = await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 3000);
    s.emit('room:start', () => {
      clearTimeout(t);
      resolve(true);
    });
  });
  ok(answered, 'spam sonrası meşru istek yanıtlandı (ack geldi)');
  ok(/ack'siz geldi — düşürüldü/.test(serverLog), "ack'siz paketler loglandı");
  ok(/kısıldı/.test(serverLog), 'spam kısıtlaması loglandı');
  ok(/dinleyicisi hata verdi/.test(serverLog), 'handler istisnası yakalanıp loglandı');
  s.disconnect();
} catch (err) {
  console.error('\n✗ HATA:', err);
  failures++;
}

stopServer();
console.log(failures === 0 ? '\n✓ TÜM SENARYOLAR GEÇTİ' : `\n✗ ${failures} başarısız`);
process.exit(failures === 0 ? 0 : 1);
