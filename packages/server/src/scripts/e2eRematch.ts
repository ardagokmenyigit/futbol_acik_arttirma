/**
 * UÇTAN UCA RÖVANŞ TESTİ — gerçek sunucu + gerçek Socket.io istemcileri.
 *
 * Aynı odada art arda 5 oyun oynar ve rövanşın her yolunu dener (CLAUDE.md
 * §3.4): kabul/geri çek/iptal → otomatik lobi, zorla başlat + kick, kodla
 * geri katılma, host reddedip çıkınca hostluk devri, teklif edenin çıkışında
 * teklif devri, lobide teklif reddi. Hızlı oda ayarlarıyla ~8-12 dakika sürer (canlı maçlar gerçek tempoda oynanır).
 *
 * Çalıştır: caffeinate -i npx tsx packages/server/src/scripts/e2eRematch.ts
 * (Sunucuyu kendisi rastgele bir portta başlatır ve kapatır. `caffeinate`
 * şart: Mac uykuya geçerse sunucu timer'ları durur ve test zaman aşımına
 * düşer — gerçek bir hata gibi görünür.)
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
  TournamentSize,
} from '@fal/shared';

const PORT = 4000 + Math.floor(Math.random() * 1000);
const SERVER_URL = `http://localhost:${PORT}`;
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
const FAST: Partial<RoomConfig> = { bidDurationSec: 1, turnDurationSec: 1, tournamentSize: 2 };

let failures = 0;
function ok(cond: boolean, msg: string): void {
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
  if (!cond) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type S = Socket<ServerToClientEvents, ClientToServerEvents>;
type Enter = { roomState: RoomState; you: Participant };

class Player {
  state: RoomState | null = null;
  kicked: { reason: string } | null = null;
  youId = '';
  constructor(
    readonly name: string,
    readonly s: S,
  ) {
    s.on('room:state', (st) => (this.state = st));
    s.on('room:kicked', (p) => (this.kicked = p));
  }
  static connect(name: string): Promise<Player> {
    const s: S = io(SERVER_URL, { transports: ['websocket'] });
    return new Promise((r) => s.on('connect', () => r(new Player(name, s))));
  }
  private ack<T>(resolve: (v: T) => void, reject: (e: Error) => void, ev: string) {
    return (res: AckResult<T>) =>
      res.ok ? resolve(res.data) : reject(new Error(`${this.name}: ${ev} → ${res.error}`));
  }
  create(nickname: string): Promise<Enter> {
    return new Promise((res, rej) =>
      this.s.emit('room:create', { nickname, config: FAST }, this.ack(res, rej, 'create')),
    );
  }
  join(code: string, nickname: string): Promise<Enter> {
    return new Promise((res, rej) =>
      this.s.emit('room:join', { code, nickname }, this.ack(res, rej, 'join')),
    );
  }
  rejoin(roomId: string, playerId: string): Promise<Enter> {
    return new Promise((res, rej) =>
      this.s.emit('room:rejoin', { roomId, playerId }, this.ack(res, rej, 'rejoin')),
    );
  }
  start(): Promise<{ roomState: RoomState }> {
    return new Promise((res, rej) => this.s.emit('room:start', this.ack(res, rej, 'start')));
  }
  setFormat(tournamentSize: TournamentSize): Promise<{ roomState: RoomState }> {
    return new Promise((res, rej) =>
      this.s.emit('room:setFormat', { tournamentSize }, this.ack(res, rej, 'setFormat')),
    );
  }
  propose(): Promise<{ roomState: RoomState }> {
    return new Promise((res, rej) =>
      this.s.emit('room:rematchPropose', this.ack(res, rej, 'rematchPropose')),
    );
  }
  respond(accept: boolean): Promise<{ roomState: RoomState }> {
    return new Promise((res, rej) =>
      this.s.emit('room:rematchRespond', { accept }, this.ack(res, rej, 'rematchRespond')),
    );
  }
  forceStart(): Promise<{ roomState: RoomState }> {
    return new Promise((res, rej) =>
      this.s.emit('room:rematchStart', this.ack(res, rej, 'rematchStart')),
    );
  }
  cancel(): Promise<{ roomState: RoomState }> {
    return new Promise((res, rej) =>
      this.s.emit('room:rematchCancel', this.ack(res, rej, 'rematchCancel')),
    );
  }
  ready(): void {
    this.s.emit('room:setReady', { ready: true });
  }
  leave(): void {
    this.s.emit('room:leave');
  }
  waitFor(pred: (p: Player) => boolean, label: string, ms = 120_000): Promise<void> {
    return new Promise((res, rej) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (pred(this)) {
          clearInterval(iv);
          res();
        } else if (Date.now() - t0 > ms) {
          clearInterval(iv);
          rej(new Error(`${this.name}: zaman aşımı — ${label}`));
        }
      }, 50);
    });
  }
  participant(id: string): Participant | undefined {
    return this.state?.participants.find((p) => p.id === id);
  }
}

/** Reddedilmesi gereken bir çağrı. */
async function mustFail(p: Promise<unknown>, msg: string, pattern?: RegExp): Promise<void> {
  try {
    await p;
    ok(false, `${msg} (reddedilmedi)`);
  } catch (err) {
    ok(!pattern || pattern.test((err as Error).message), msg);
  }
}

/** Lobiden bitişe kadar tam bir oyun. Güncel host kimse o başlatır. */
async function playFullGame(players: Player[]): Promise<void> {
  const hostId = players[0]!.state!.hostId;
  const host = players.find((p) => p.youId === hostId) ?? players[0]!;
  await host.start();
  await host.waitFor((p) => p.state?.phase === 'draft', 'draft başladı');
  await host.waitFor((p) => p.state?.phase === 'simulation', 'draft bitti', 600_000);
  host.s.emit('room:startSimulation');
  // Canlı maç 14 sn + penaltı serisi başına 3 sn — uzun seriye pay bırak.
  for (const p of players)
    await p.waitFor((x) => x.state?.phase === 'finished', 'oyun bitti', 600_000);
}

// tsx'i doğrudan ve ayrı süreç grubunda başlat: `npx` katmanı olsa
// `server.kill()` alttaki node sürecini öldürmez, sunucu yetim kalır.
const server = spawn(`${REPO}node_modules/.bin/tsx`, ['packages/server/src/index.ts'], {
  cwd: REPO,
  detached: true,
  env: { ...process.env, PORT: String(PORT), CLIENT_ORIGIN: '*' },
  stdio: ['ignore', process.env.VERBOSE ? 'inherit' : 'ignore', 'inherit'],
});
const stopServer = (): void => {
  try {
    process.kill(-server.pid!, 'SIGTERM');
  } catch {
    /* zaten kapalı */
  }
};
process.on('exit', stopServer);
await sleep(2500);

try {
  console.log('\n[OYUN 1] kabul / hatalı çağrılar / otomatik lobi');
  const A = await Player.connect('A');
  const B = await Player.connect('B');
  const { roomState: r0, you: youA } = await A.create('Arda');
  A.youId = youA.id;
  const { you: youB } = await B.join(r0.code, 'Berk');
  B.youId = youB.id;
  B.ready();
  await A.waitFor((p) => !!p.participant(youB.id)?.isReady, 'B hazır');
  await playFullGame([A, B]);
  ok(A.state!.phase === 'finished' && A.state!.gameNumber === 1, 'oyun 1 bitti (gameNumber 1)');
  ok(!!A.state!.tournament?.championId, 'şampiyon belli');

  await mustFail(B.respond(true), 'teklif yokken kabul reddedildi', /Aktif bir rövanş teklifi yok/);
  await B.propose(); // host olmayan teklif edebilir
  await A.waitFor((p) => p.state?.rematch?.proposerId === youB.id, 'A daveti gördü');
  ok(A.state!.rematch!.acceptedIds.join() === youB.id, 'teklif eden kabul edenler listesinde');
  await mustFail(B.respond(false), 'teklif eden kabulünü geri çekemedi (iptal etmeli)');
  await mustFail(A.cancel(), 'teklif etmeyen iptal edemedi');
  await mustFail(A.forceStart(), 'teklif etmeyen zorla başlatamadı');

  await A.respond(true);
  await B.waitFor((p) => p.state?.phase === 'lobby', 'herkes kabul → lobi');
  const L = B.state!;
  ok(L.gameNumber === 2, 'oda lobiye döndü, gameNumber 2');
  ok(L.code === r0.code && L.roomId === r0.roomId, 'aynı oda kodu/id korundu');
  ok(
    L.rematch === null && L.tournament === null && L.auction === null,
    'rematch/tournament/auction temizlendi',
  );
  ok(
    L.participants.length === 2 && L.participants.every((p) => !p.isBot),
    'botlar atıldı, 2 insan kaldı',
  );
  ok(
    L.participants.every((p) => p.budget === 150 && p.squad.length === 0),
    'bütçe ve kadro sıfırlandı',
  );
  ok(L.hostId === youA.id && !!B.participant(youA.id)?.isHost, 'host (A) host kaldı');
  ok(B.participant(youB.id)?.isReady === false, 'B lobide hazır değil (yeniden hazır vermeli)');

  console.log('\n[OYUN 2] reconnect / iptal / geri çekme / zorla başlat + kick / kodla geri katıl');
  A.s.disconnect();
  await sleep(300);
  A.s.connect();
  await sleep(300);
  const rj = await A.rejoin(r0.roomId, youA.id);
  ok(rj.roomState.phase === 'lobby' && rj.you.id === youA.id, 'A rejoin ile rövanş lobisine döndü');
  ok(
    rj.roomState.hostId === youB.id,
    "lobide kopan host'un hostluğu B'ye devredildi (mevcut lobi kuralı)",
  );
  A.ready();
  B.ready();
  await B.waitFor((p) => !!p.participant(youA.id)?.isReady, 'A hazır');
  await playFullGame([A, B]);
  ok(A.state!.gameNumber === 2, 'oyun 2 bitti');

  await A.propose();
  await B.waitFor((p) => p.state?.rematch?.proposerId === youA.id, 'B daveti gördü');
  await A.cancel();
  await B.waitFor((p) => p.state?.rematch === null && p.state.phase === 'finished', 'iptal');
  ok(true, 'teklif eden iptal etti, herkes bitiş ekranında kaldı');

  await A.propose();
  await B.waitFor((p) => !!p.state?.rematch, 'B daveti gördü (2)');
  await B.respond(false); // kabul etmemişken geri çekme no-op
  ok(A.state!.rematch!.acceptedIds.length === 1, 'kabul etmemişken geri çekme no-op');
  await A.forceStart();
  await B.waitFor((p) => !!p.kicked, 'B kicked aldı');
  ok(
    /Rövanş sensiz başladı/.test(B.kicked!.reason) && B.kicked!.reason.includes(r0.code),
    'kick mesajı oda kodunu içeriyor',
  );
  await A.waitFor((p) => p.state?.phase === 'lobby' && p.state.gameNumber === 3, 'A lobide (3)');
  ok(
    A.state!.participants.length === 1 && A.state!.participants[0]!.id === youA.id,
    'lobide yalnız A var',
  );
  ok(A.state!.hostId === youA.id, "host (B) çıkarıldığı için hostluk teklif eden A'ya geçti");
  await mustFail(B.rejoin(r0.roomId, youB.id), 'kicked oyuncu rejoin edemedi (oturum silinir)');
  const { you: youB2 } = await B.join(r0.code, 'Berk');
  B.youId = youB2.id;
  await A.waitFor((p) => !!p.participant(youB2.id), 'B kodla geri katıldı');
  ok(true, 'B lobiye kodla geri katıldı');

  console.log('\n[OYUN 3] host reddeder ve çıkar → hostluk teklif edene geçer');
  B.ready();
  await A.waitFor((p) => !!p.participant(youB2.id)?.isReady, 'B hazır');
  await playFullGame([A, B]);
  ok(A.state!.gameNumber === 3, 'oyun 3 bitti');
  await B.propose();
  await A.waitFor((p) => p.state?.rematch?.proposerId === youB2.id, 'A (host) daveti gördü');
  A.leave();
  await B.waitFor(
    (p) => p.state?.phase === 'lobby' && p.state.gameNumber === 4,
    'host çıkınca kalan tek insan → lobi',
  );
  ok(B.state!.hostId === youB2.id && !!B.participant(youB2.id)?.isHost, "hostluk B'ye geçti");
  ok(B.state!.participants.length === 1, 'çıkan host (bota dönüşmüştü) lobiye taşınmadı');

  console.log('\n[OYUN 4-5] teklif eden çıkarsa teklif kabul edene devrolur');
  const C = await Player.connect('C');
  const { you: youC } = await C.join(r0.code, 'Can');
  C.youId = youC.id;
  C.ready();
  await B.waitFor((p) => !!p.participant(youC.id)?.isReady, 'C hazır');
  await playFullGame([B, C]);
  await C.propose();
  await B.waitFor((p) => !!p.state?.rematch, 'B daveti gördü');
  await B.respond(true);
  await B.waitFor((p) => p.state?.phase === 'lobby' && p.state.gameNumber === 5, 'lobi (5)');
  ok(B.state!.participants.length === 2, 'B ve C lobide');

  const D = await Player.connect('D');
  await B.setFormat(4);
  const { you: youD } = await D.join(r0.code, 'Deniz');
  D.youId = youD.id;
  C.ready();
  D.ready();
  await B.waitFor(
    (p) => !!p.participant(youC.id)?.isReady && !!p.participant(youD.id)?.isReady,
    'C,D hazır',
  );
  await playFullGame([B, C, D]);
  ok(
    B.state!.participants.length === 4 && B.state!.participants.filter((p) => p.isBot).length === 1,
    '4 takım: 3 insan + 1 bot',
  );
  await C.propose();
  await D.waitFor((p) => p.state?.rematch?.proposerId === youC.id, 'D daveti gördü');
  await D.respond(true);
  await B.waitFor((p) => !!p.state?.rematch?.acceptedIds.includes(youD.id), 'D kabul etti');
  await D.respond(false);
  await B.waitFor((p) => !p.state?.rematch?.acceptedIds.includes(youD.id), 'D geri çekti');
  ok(
    B.state!.phase === 'finished' && !!B.state!.rematch,
    'kabul geri çekilince teklif açık kaldı, lobiye geçilmedi',
  );
  await D.respond(true);
  await B.waitFor((p) => !!p.state?.rematch?.acceptedIds.includes(youD.id), 'D yeniden kabul etti');
  C.leave();
  await B.waitFor((p) => p.state?.rematch?.proposerId === youD.id, "teklif D'ye devroldu");
  ok(!B.state!.rematch!.acceptedIds.includes(youC.id), 'çıkan C kabul listesinden düştü');
  ok(B.participant(youC.id)?.isBot === true, 'C bota dönüştü (bracket okunur kalır)');
  await B.respond(true);
  await D.waitFor((p) => p.state?.phase === 'lobby', 'B kabul → lobi');
  ok(
    D.state!.participants.length === 2 && D.state!.participants.every((p) => !p.isBot),
    'lobide B ve D; C ve bot yok',
  );
  ok(D.state!.hostId === youB2.id, 'host B kaldı');
  ok(
    D.state!.config.tournamentSize === 4 && D.state!.config.bidDurationSec === 1,
    'oda ayarları korundu',
  );
  await mustFail(D.propose(), 'lobide teklif reddedildi');

  for (const p of [A, B, C, D]) p.s.disconnect();
} catch (err) {
  console.error('\nHATA:', (err as Error).message);
  failures++;
} finally {
  stopServer();
}

console.log(failures === 0 ? '\nTÜM SENARYOLAR GEÇTİ' : `\n${failures} BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
