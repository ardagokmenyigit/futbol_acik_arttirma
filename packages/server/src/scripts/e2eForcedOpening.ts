/**
 * ZORUNLU AÇILIŞ BEKLETİLMEZ — gerçek sunucu + Socket.io istemcisi.
 *
 * Kural (`engine.ts` → `openerHasNoChoice`): açılış sırası, pas hakkı bitmiş
 * VE bütçesi asgari teklifin üstüne çıkamayan (0M ya da tam asgari)
 * katılımcıya gelirse sunucu `turnDurationSec`'i beklemeden hemen asgari
 * açılışı yapar. Pas hakkı olan beklenir (pas diyebilir).
 *
 * Senaryo (2 takım: insan + 1 bot, 1 pas hakkı, açılış süresi bilerek uzun):
 *  1. İnsanın ilk açılışı: bütçenin tamamını (150M) basar → bütçe 0.
 *  2. Sonraki açılışı: bütçe 0 ama pas hakkı VAR → sunucu beklemeli; pas der.
 *  3. Sonraki açılışları: bütçe 0, pas YOK → açılış anında (auto) gelmeli.
 *
 * Kullanım: npm run build && caffeinate -i npx tsx packages/server/src/scripts/e2eForcedOpening.ts
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { io, type Socket } from 'socket.io-client';
import type {
  AckResult,
  AuctionState,
  ClientToServerEvents,
  Participant,
  RoomState,
  ServerToClientEvents,
} from '@fal/shared';

const PORT = 4000 + Math.floor(Math.random() * 1000);
const SERVER_URL = `http://localhost:${PORT}`;
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
/** Açılış süresi uzun: "beklemedi" ile "süre dolunca açıldı" net ayrışsın. */
const TURN_SEC = 20;

let failures = 0;
function ok(cond: boolean, msg: string): void {
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
  if (!cond) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type S = Socket<ServerToClientEvents, ClientToServerEvents>;
type Enter = { roomState: RoomState; you: Participant };

const server = spawn(process.execPath, ['packages/server/dist/index.js'], {
  cwd: REPO,
  detached: true,
  env: { ...process.env, PORT: String(PORT), CLIENT_ORIGIN: '*' },
  stdio: ['ignore', process.env.VERBOSE ? 'inherit' : 'ignore', 'inherit'],
});
const stopServer = (): void => {
  try {
    process.kill(-server.pid!, 'SIGTERM');
  } catch {
    /* zaten kapandı */
  }
};
process.on('exit', stopServer);

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${SERVER_URL}/health`);
      if (r.ok) return;
    } catch {
      /* henüz ayakta değil */
    }
    await sleep(250);
  }
  throw new Error('sunucu açılmadı');
}

function ack<T>(emit: (cb: (r: AckResult<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) =>
    emit((r) => (r.ok ? resolve(r.data) : reject(new Error(r.error)))),
  );
}

async function main(): Promise<void> {
  await waitForServer();
  const s: S = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise<void>((r) => s.on('connect', () => r()));

  let room: RoomState | null = null;
  s.on('room:state', (st) => (room = st));

  const enter = await ack<Enter>((cb) =>
    s.emit(
      'room:create',
      {
        nickname: 'Harcayan',
        config: { tournamentSize: 2, turnDurationSec: TURN_SEC, bidDurationSec: 1 },
      },
      cb,
    ),
  );
  const me = enter.you.id;
  room = enter.roomState;

  // Her açılış evresi için: ne zaman başladı, ne zaman açıldı, açıcının durumu.
  interface Opening {
    round: number;
    startedAt: number;
    openedAt?: number;
    auto?: boolean;
    budget: number;
    passes: number;
    action?: string;
  }
  const mine: Opening[] = [];
  let current: Opening | null = null;
  let draftDone = false;

  const handleOpening = async (auction: AuctionState) => {
    // Yeni tur: önceki turun kaydına başka turun olayı yazılmasın (örn. tek
    // uygun alıcıya otomatik atamanın `auction:opened`ı).
    if (current && current.round !== auction.round) current = null;
    if (auction.phase !== 'opening' || auction.openerId !== me) return;
    const p = room?.participants.find((x) => x.id === me);
    if (!p) return;
    current = {
      round: auction.round,
      startedAt: Date.now(),
      budget: p.budget,
      passes: p.passesLeft,
    };
    mine.push(current);
    const snapshot = current;
    if (p.budget > room!.config.minBidIncrement) {
      snapshot.action = `bütçenin tamamı (${p.budget}M)`;
      await ack((cb) => s.emit('auction:bid', { amount: p.budget }, cb));
    } else if (p.passesLeft > 0) {
      // Sunucu beklemeli: 1.5 sn içinde açılış GELMEMELİ, sonra pas.
      await sleep(1500);
      snapshot.action = 'pas (1.5 sn bekledikten sonra)';
      if (snapshot.openedAt === undefined) {
        await ack((cb) => s.emit('auction:pass', cb));
      }
    } else {
      snapshot.action = 'hiçbir şey (otomatik açılış beklenir)';
    }
  };

  s.on('auction:started', (a) => void handleOpening(a));
  s.on('auction:passed', (p) => {
    // Pas zinciri açılışı bize geri getirirse (2 takımda olmaz) yine ele al.
    if (p.nextOpenerId === me && room?.auction) void handleOpening(room.auction);
  });
  s.on('auction:opened', (o) => {
    if (current && o.openerId === me && current.openedAt === undefined) {
      current.openedAt = Date.now();
      current.auto = o.auto;
    }
  });
  s.on('auction:finished', () => (draftDone = true));
  if (process.env.TRACE) {
    const t0 = Date.now();
    const tr = (ev: string, x: unknown) =>
      console.log(`    [${String(Date.now() - t0).padStart(6)}] ${ev} ${JSON.stringify(x)}`);
    s.on('auction:started', (a) =>
      tr('started', {
        r: a.round,
        opener: a.openerId === me ? 'BEN' : 'bot',
        elig: a.eligibleIds.length,
      }),
    );
    s.on('auction:passed', (p) =>
      tr('passed', { by: p.passerNickname, next: p.nextOpenerNickname, auto: p.autoAssigned }),
    );
    s.on('auction:opened', (o) =>
      tr('opened', { by: o.openerId === me ? 'BEN' : 'bot', amount: o.amount, auto: o.auto }),
    );
    s.on('auction:won', (w) => tr('won', { r: w.round, who: w.winnerNickname, amount: w.amount }));
  }

  await ack((cb) => s.emit('room:start', cb));
  const t0 = Date.now();
  while (!draftDone && Date.now() - t0 < 240_000) await sleep(200);
  ok(draftDone, 'draft sonuna kadar oynandı');

  console.log('\n  insanın açılışları:');
  for (const o of mine) {
    const ms = o.openedAt !== undefined ? o.openedAt - o.startedAt : null;
    console.log(
      `    tur ${o.round}: bütçe ${o.budget}M · pas ${o.passes} · ${o.action} → ` +
        (ms === null ? 'açılmadı (pas)' : `${ms} ms sonra açıldı${o.auto ? ' (otomatik)' : ''}`),
    );
  }

  const spent = mine.find((o) => o.budget > 1);
  ok(!!spent && spent.auto === false, 'ilk açılış: bütçenin tamamı elle basıldı');

  const withPass = mine.filter((o) => o.budget <= 1 && o.passes > 0);
  ok(withPass.length >= 1, 'bütçe 0 + pas hakkı olan bir açılış yaşandı');
  ok(
    withPass.every((o) => o.openedAt === undefined || o.openedAt - o.startedAt >= 1400),
    'pas hakkı varken sunucu BEKLEDİ (anında açmadı)',
  );

  const forced = mine.filter((o) => o.budget <= 1 && o.passes === 0);
  ok(forced.length >= 1, `bütçe 0 + pas yok açılışı yaşandı (${forced.length} kez)`);
  ok(
    forced.every(
      (o) => o.auto === true && o.openedAt !== undefined && o.openedAt - o.startedAt < 1000,
    ),
    `hepsi ANINDA otomatik açıldı (en yavaş ${Math.max(...forced.map((o) => (o.openedAt ?? Infinity) - o.startedAt))} ms; süre ${TURN_SEC} sn)`,
  );

  const final = (room as RoomState | null)?.participants.find((p) => p.id === me);
  ok(
    !!final && final.squad.length === 7 && final.budget >= 0,
    `kadro tam (${final?.squad.length}/7), bütçe ${final?.budget}M`,
  );

  s.close();
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(() => {
    stopServer();
    console.log(failures ? `\n${failures} KONTROL BAŞARISIZ` : '\nTÜM KONTROLLER GEÇTİ');
    process.exit(failures ? 1 : 0);
  });
