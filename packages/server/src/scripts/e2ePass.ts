/**
 * UÇTAN UCA AÇILIŞ PASI TESTİ — gerçek sunucu + gerçek Socket.io istemcileri.
 *
 * Oyun 1 (2 takım, 2 insan, 1'er pas): açıcı pas geçer → açılış diğerine
 * geçer, pas diyen teklif veremez; diğeri de pas geçer → kimsede hak yok →
 * biri açmak zorunda kalır ve tek başına kaldığı için futbolcuyu asgariden
 * alır. Hatalı çağrılar (sıra sende değil, serbest evrede pas, hak bitti)
 * reddedilir. Draft tam kadroyla biter.
 *
 * Oyun 2 (4 takım, 2 insan + 2 bot, 2'şer pas): insanlar her açılışta pas
 * dener (haklar bitene kadar), botlar kendi kararlarıyla pas geçer. Her pas
 * event'inde değişmezler denetlenir; draft 28 turda tam kadroyla biter.
 *
 * Çalıştır: caffeinate -i npx tsx packages/server/src/scripts/e2ePass.ts
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

const PORT = 4000 + Math.floor(Math.random() * 1000);
const SERVER_URL = `http://localhost:${PORT}`;
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
/** Açılış 2 sn: pas için yeterli pencere, otomatik açılış çok beklemesin. */
const FAST: Partial<RoomConfig> = { bidDurationSec: 1, turnDurationSec: 2 };

let failures = 0;
function ok(cond: boolean, msg: string): void {
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
  if (!cond) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type S = Socket<ServerToClientEvents, ClientToServerEvents>;
type Enter = { roomState: RoomState; you: Participant };
type PassedPayload = Parameters<ServerToClientEvents['auction:passed']>[0];

class Player {
  state: RoomState | null = null;
  youId = '';
  passed: PassedPayload[] = [];
  constructor(
    readonly name: string,
    readonly s: S,
  ) {
    s.on('room:state', (st) => (this.state = st));
    s.on('auction:passed', (p) => this.passed.push(p));
  }
  static connect(name: string): Promise<Player> {
    const s: S = io(SERVER_URL, { transports: ['websocket'] });
    return new Promise((r) => s.on('connect', () => r(new Player(name, s))));
  }
  private ack<T>(resolve: (v: T) => void, reject: (e: Error) => void, ev: string) {
    return (res: AckResult<T>) =>
      res.ok ? resolve(res.data) : reject(new Error(`${this.name}: ${ev} → ${res.error}`));
  }
  create(nickname: string, config: Partial<RoomConfig>): Promise<Enter> {
    return new Promise((res, rej) =>
      this.s.emit('room:create', { nickname, config }, this.ack(res, rej, 'create')),
    );
  }
  join(code: string, nickname: string): Promise<Enter> {
    return new Promise((res, rej) =>
      this.s.emit('room:join', { code, nickname }, this.ack(res, rej, 'join')),
    );
  }
  start(): Promise<{ roomState: RoomState }> {
    return new Promise((res, rej) => this.s.emit('room:start', this.ack(res, rej, 'start')));
  }
  bid(amount: number): Promise<unknown> {
    return new Promise((res, rej) =>
      this.s.emit('auction:bid', { amount }, this.ack(res, rej, 'bid')),
    );
  }
  pass(): Promise<{ passesLeft: number }> {
    return new Promise((res, rej) => this.s.emit('auction:pass', this.ack(res, rej, 'pass')));
  }
  ready(): void {
    this.s.emit('room:setReady', { ready: true });
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
      }, 30);
    });
  }
  me(): Participant | undefined {
    return this.state?.participants.find((p) => p.id === this.youId);
  }
}

async function mustFail(p: Promise<unknown>, msg: string, pattern?: RegExp): Promise<void> {
  try {
    await p;
    ok(false, `${msg} (reddedilmedi)`);
  } catch (err) {
    ok(!pattern || pattern.test((err as Error).message), msg);
  }
}

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
    /* zaten kapalı */
  }
};
process.on('exit', stopServer);
await sleep(2500);

try {
  /* ------------------------- OYUN 1: 2 takım, 1 pas ------------------------- */
  console.log('\n[OYUN 1] 2 takım · 2 insan · 1 pas');
  const A = await Player.connect('A');
  const B = await Player.connect('B');
  const { roomState: r0, you: youA } = await A.create('Arda', { ...FAST, tournamentSize: 2 });
  A.youId = youA.id;
  const { you: youB } = await B.join(r0.code, 'Berk');
  B.youId = youB.id;
  ok(youA.passesLeft === 1 && youB.passesLeft === 1, 'lobide herkesin 1 pas hakkı var');
  B.ready();
  await A.waitFor((p) => !!p.state?.participants.find((x) => x.id === youB.id)?.isReady, 'B hazır');
  await mustFail(A.pass(), 'lobide pas reddedildi', /aktif bir açık artırma yok/);
  await A.start();
  await A.waitFor((p) => p.state?.auction?.phase === 'opening', 'ilk tur açılış');

  const first = A.state!.auction!;
  const opener = first.openerId === youA.id ? A : B;
  const other = opener === A ? B : A;
  ok(first.passedIds.length === 0, 'tur başında passedIds boş');
  await mustFail(other.pass(), 'sırası olmayan pas geçemedi', /sırası sende değil/);

  const round1 = first.round;
  await sleep(300);
  const { passesLeft } = await opener.pass();
  ok(passesLeft === 0, `${opener.name} pas geçti, hak 0'a düştü`);
  await other.waitFor(
    (p) => p.state?.auction?.openerId === other.youId && p.state.auction.round === round1,
    'tek uygun alıcıya otomatik atama başladı',
  );
  const afterPass = other.state!.auction!;
  ok(afterPass.phase === 'bidding', 'evre otomatik atama için teklif evresine geçti');
  ok(afterPass.footballer.id === first.footballer.id, 'futbolcu masada kaldı');
  ok(afterPass.passedIds.join() === opener.youId, 'pas diyen passedIds içinde');
  ok(!afterPass.eligibleIds.includes(opener.youId), 'pas diyen eligibleIds dışında');
  ok(afterPass.eligibleIds.join() === other.youId, 'yalnız diğer katılımcı uygun alıcı');
  ok(afterPass.highestBid?.playerId === other.youId, 'otomatik teklif diğer katılımcı adına');
  ok(afterPass.endsAt - Date.now() > 4000, 'otomatik atama ekranı yaklaşık beş saniye kalıyor');
  ok(other.me()!.passesLeft === 1 && opener.me()!.passesLeft === 0, 'haklar doğru yayınlandı');
  const ev = other.passed.at(-1)!;
  ok(
    ev.passerId === opener.youId &&
      ev.nextOpenerId === other.youId &&
      ev.passesLeft === 0 &&
      ev.autoAssigned,
    'auction:passed otomatik atamayı doğru bildiriyor',
  );
  await mustFail(
    opener.pass(),
    'pas diyen tekrar pas geçemedi (tur otomatik atamada)',
    /yalnızca açılış/,
  );

  await mustFail(other.pass(), 'tek uygun alıcı serbest evrede pas geçemedi', /yalnızca açılış/);
  await mustFail(opener.bid(2), 'pas diyen teklif veremedi', /pas geçtin/);
  const fid = afterPass.footballer.id;
  await other.waitFor(
    (p) => !!p.me()?.squad.some((f) => f.id === fid),
    'futbolcu tek uygun alıcının kadrosuna girdi',
  );
  ok(
    other.me()!.budget === r0.config.startingBudget - r0.config.minBidIncrement,
    'otomatik atamada asgari fiyatı (1M) ödedi',
  );

  await A.waitFor((p) => p.state?.phase !== 'draft', 'draft bitti', 300_000);
  ok(
    A.state!.participants.every((p) => p.squad.length === r0.config.squadSize),
    'herkes tam kadroyla bitirdi',
  );
  A.s.disconnect();
  B.s.disconnect();

  /* ------------------ OYUN 2: 4 takım, 2 insan + 2 bot, 2 pas ------------------ */
  console.log('\n[OYUN 2] 4 takım · 2 insan + 2 bot · 2 pas');
  const C = await Player.connect('C');
  const D = await Player.connect('D');
  const { roomState: r1, you: youC } = await C.create('Ceren', { ...FAST, tournamentSize: 4 });
  C.youId = youC.id;
  const { you: youD } = await D.join(r1.code, 'Deniz');
  D.youId = youD.id;
  ok(youC.passesLeft === 2, '4 takımda 2 pas hakkı');
  D.ready();
  await C.waitFor((p) => !!p.state?.participants.find((x) => x.id === youD.id)?.isReady, 'D hazır');
  await C.start();
  await C.waitFor((p) => p.state?.phase === 'draft', 'draft başladı');
  ok(
    C.state!.participants.every((p) => p.passesLeft === 2),
    'botlar dahil herkes 2 pas',
  );

  // İnsanlar: açılış sırası gelince hak varsa hemen pas. Değişmezleri her
  // auction:passed'da denetle.
  let humanPasses = 0;
  let botPasses = 0;
  let invariantsOk = true;
  const botIds = new Set(C.state!.participants.filter((p) => p.isBot).map((p) => p.id));
  C.s.on('auction:passed', (ev) => {
    if (botIds.has(ev.passerId)) botPasses++;
    else humanPasses++;
    const a = C.state?.auction;
    if (!a) return;
    if (ev.passerId === ev.nextOpenerId) invariantsOk = false;
    if (ev.passesLeft < 0) invariantsOk = false;
  });
  const autoPass = (p: Player) => {
    p.s.on('room:state', (st) => {
      const a = st.auction;
      const me = st.participants.find((x) => x.id === p.youId);
      if (a?.phase === 'opening' && a.openerId === p.youId && me && me.passesLeft > 0) {
        p.pass().catch(() => {});
      }
    });
  };
  autoPass(C);
  autoPass(D);
  // Pas kullanıldıktan sonra passer'ın eligibleIds dışında olduğunu her state'te doğrula.
  C.s.on('room:state', (st) => {
    const a = st.auction;
    if (!a) return;
    for (const id of a.passedIds) if (a.eligibleIds.includes(id)) invariantsOk = false;
  });

  await C.waitFor((p) => p.state?.phase !== 'draft', 'draft bitti', 400_000);
  const fin = C.state!;
  ok(
    fin.participants.every((p) => p.squad.length === r1.config.squadSize),
    'herkes tam kadro (28 tur)',
  );
  ok(
    fin.participants.filter((p) => !p.isBot).every((p) => p.passesLeft === 0),
    'insanlar iki hakkını da kullandı',
  );
  ok(humanPasses === 4, `insan pası 4 (${humanPasses})`);
  ok(invariantsOk, 'pas değişmezleri her event/state için tuttu');
  console.log(`  · bot pası: ${botPasses}`);
  ok(
    fin.participants.every((p) => p.passesLeft >= 0),
    'hiçbir hak eksiye düşmedi',
  );
  C.s.disconnect();
  D.s.disconnect();
} catch (err) {
  console.error('\n✗ TEST HATASI:', err);
  failures++;
} finally {
  stopServer();
}

console.log(failures === 0 ? '\nTÜM TESTLER GEÇTİ' : `\n${failures} BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
