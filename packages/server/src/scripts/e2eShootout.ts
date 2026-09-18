/**
 * UÇTAN UCA CANLI SERİ PENALTI TESTİ — gerçek sunucu + gerçek Socket.io istemcileri.
 *
 * Sunucu `FAL_FORCE_SHOOTOUT=1` ile açılır: insanlı her maç için uzatma sonu
 * beraberlik veren bir tohum aranır (motor değişmez), böylece seri her oyunda
 * kesin oynanır.
 *
 * Oyun 1 (2 takım, 1 insan + 1 bot): `matchLive` `pendingShootout` ile gelir,
 * seri vuruş vuruş `shootoutPrompt` / `shootoutKick` ile ilerler. İnsan atıcı
 * ve kaleci rolünde köşe seçer (ack rolü doğrular), seçim değiştirilebilir,
 * yanlış vuruş no reddedilir, bir vuruşta hiç seçmez → ORTA (dikkatsizlik
 * kuralı). Seri bitince `matchResult` tam döküm + kazananla gelir, oda biter.
 *
 * Oyun 2 (2 takım, 2 insan): iki taraf eş zamanlı seçer; ikisi de seçince
 * vuruş süre dolmadan çözülür ve açıklanan köşeler seçimlerle birebir aynıdır.
 * Bir vuruşta B bağlantıyı koparır → vuruş süre sonunda bot kararıyla
 * çözülür; B geri bağlanınca `room:state.shootout` + `matchLive` (startedAt)
 * yeniden gelir ve seri kaldığı yerden sürer.
 *
 * Oyun 3 (4 takım, 2 insan + 2 bot): maçta olmayan insanın seçimi reddedilir
 * (izleyici), turnuva şampiyonla biter.
 *
 * Çalıştır: caffeinate -i npx tsx packages/server/src/scripts/e2eShootout.ts
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { io, type Socket } from 'socket.io-client';
import type {
  AckResult,
  ClientToServerEvents,
  MatchResult,
  Participant,
  PenaltyDirection,
  PenaltyShootoutAttempt,
  RoomConfig,
  RoomState,
  ServerToClientEvents,
  ShootoutState,
  TournamentState,
} from '@fal/shared';

const PORT = 4000 + Math.floor(Math.random() * 1000);
const SERVER_URL = `http://localhost:${PORT}`;
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
const FAST: Partial<RoomConfig> = { bidDurationSec: 1, turnDurationSec: 1 };

let failures = 0;
function ok(cond: boolean, msg: string): void {
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
  if (!cond) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type S = Socket<ServerToClientEvents, ClientToServerEvents>;
type Enter = { roomState: RoomState; you: Participant };
type LivePayload = Parameters<ServerToClientEvents['tournament:matchLive']>[0];
type KickPayload = Parameters<ServerToClientEvents['tournament:shootoutKick']>[0];

class Player {
  state: RoomState | null = null;
  youId = '';
  lives: LivePayload[] = [];
  prompts: ShootoutState[] = [];
  kicks: KickPayload[] = [];
  results: MatchResult[] = [];
  finished: TournamentState | null = null;
  /** room:state içinde shootout görüldü mü? */
  sawShootoutInState = false;
  constructor(
    readonly name: string,
    public s: S,
  ) {
    this.bind(s);
  }
  bind(s: S): void {
    s.on('room:state', (st) => {
      this.state = st;
      if (st.shootout) this.sawShootoutInState = true;
    });
    s.on('tournament:matchLive', (p) => this.lives.push(p));
    s.on('tournament:shootoutPrompt', (p) => this.prompts.push(p));
    s.on('tournament:shootoutKick', (p) => this.kicks.push(p));
    s.on('tournament:matchResult', (p) => this.results.push(p.result));
    s.on('tournament:finished', (p) => (this.finished = p.tournament));
  }
  static connect(name: string): Promise<Player> {
    const s: S = io(SERVER_URL, { transports: ['websocket'] });
    return new Promise((r) => s.on('connect', () => r(new Player(name, s))));
  }
  /** Bağlantıyı kopar; yeni soketle geri dön (room:rejoin). */
  async reconnect(roomId: string): Promise<Enter> {
    this.s.disconnect();
    const s: S = io(SERVER_URL, { transports: ['websocket'] });
    await new Promise<void>((r) => s.on('connect', () => r()));
    this.s = s;
    this.bind(s);
    return new Promise((res, rej) =>
      s.emit('room:rejoin', { roomId, playerId: this.youId }, this.ack<Enter>(res, rej, 'rejoin')),
    );
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
  ready(): void {
    this.s.emit('room:setReady', { ready: true });
  }
  choose(
    matchId: string,
    kickIndex: number,
    direction: PenaltyDirection,
  ): Promise<{ role: 'shooter' | 'keeper' }> {
    return new Promise((res, rej) =>
      this.s.emit(
        'tournament:penaltyChoose',
        { matchId, kickIndex, direction },
        this.ack(res, rej, 'choose'),
      ),
    );
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
      }, 20);
    });
  }
  /** Sıradaki seçim evresi (kickIndex > son görülen). */
  nextPrompt(after: number, ms = 30_000): Promise<ShootoutState> {
    return this.waitFor(
      (p) => p.prompts.some((x) => x.phase === 'choosing' && x.kickIndex > after),
      `prompt > ${after}`,
      ms,
    ).then(() => this.prompts.filter((x) => x.phase === 'choosing' && x.kickIndex > after)[0]!);
  }
  kickFor(kickIndex: number, ms = 30_000): Promise<KickPayload> {
    return this.waitFor(
      (p) => p.kicks.some((k) => k.state.kickIndex === kickIndex),
      `kick ${kickIndex}`,
      ms,
    ).then(() => this.kicks.find((k) => k.state.kickIndex === kickIndex)!);
  }
  roleIn(st: ShootoutState): 'shooter' | 'keeper' | 'spectator' {
    if (st.shooterTeamId === this.youId) return 'shooter';
    if (st.keeperTeamId === this.youId) return 'keeper';
    return 'spectator';
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

/** Draft'ı bitirip turnuvayı hemen başlat; ilk insanlı maçın matchLive'ını bekle. */
async function toLiveMatch(host: Player, all: Player[]): Promise<LivePayload> {
  await host.waitFor((p) => p.state?.phase === 'draft', 'draft başladı');
  await host.waitFor((p) => p.state?.phase === 'simulation', 'draft bitti', 600_000);
  host.s.emit('room:startSimulation');
  await Promise.all(all.map((p) => p.waitFor((x) => x.lives.length > 0, 'matchLive', 60_000)));
  return host.lives[host.lives.length - 1]!;
}

const DIRS: PenaltyDirection[] = ['left', 'center', 'right'];
const ATTEMPT_OK = (a: PenaltyShootoutAttempt): boolean =>
  DIRS.includes(a.shotDirection) &&
  DIRS.includes(a.keeperDirection) &&
  ['goal', 'saved', 'missed'].includes(a.outcome) &&
  a.scored === (a.outcome === 'goal');

const server = spawn(`${REPO}node_modules/.bin/tsx`, ['packages/server/src/index.ts'], {
  cwd: REPO,
  detached: true,
  env: { ...process.env, PORT: String(PORT), CLIENT_ORIGIN: '*', FAL_FORCE_SHOOTOUT: '1' },
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
  /* ---------------------- OYUN 1: 1 insan + 1 bot ---------------------- */
  console.log('\n[OYUN 1] 2 takım · 1 insan + 1 bot · zorunlu seri');
  {
    const A = await Player.connect('A');
    const { you } = await A.create('Arda', { ...FAST, tournamentSize: 2 });
    A.youId = you.id;
    A.ready();
    await A.start();
    const live = await toLiveMatch(A, [A]);
    ok(live.result.pendingShootout === true, 'matchLive pendingShootout ile geldi');
    ok(live.result.winnerId === undefined, 'pendingShootout iken winnerId yok');
    ok(live.result.extraTime === true, 'uzatma oynandı (extraTime)');
    ok(live.elapsedMs === 0, 'matchLive ilk yayında elapsedMs 0');
    ok(live.result.scoreHome === live.result.scoreAway, 'skor berabere');

    const t0 = Date.now();
    const first = await A.nextPrompt(-1, 40_000);
    ok(
      Date.now() - t0 > 12_000,
      `seri, canlı maç animasyonundan sonra başladı (${Date.now() - t0} ms)`,
    );
    ok(
      first.kickIndex === 0 && first.round === 1 && first.phase === 'choosing',
      'ilk vuruş: index 0, tur 1',
    );
    ok(first.shooterTeamId === first.homeId, 'ev sahibi başlar');
    ok(
      !('shot' in first) && first.shooterChosen === false && first.keeperChosen === false,
      'yayınlanan durumda köşe yok, bayraklar false',
    );
    ok(A.state?.shootout?.matchId === live.matchId, 'room:state.shootout dolu');

    let idx = -1;
    let skippedOnce = false;
    let changedOnce = false;
    let lastState: ShootoutState = first;
    const myChoices = new Map<number, PenaltyDirection>();
    for (;;) {
      const st = await A.nextPrompt(idx, 40_000);
      idx = st.kickIndex;
      lastState = st;
      const role = A.roleIn(st);
      ok(role !== 'spectator', `vuruş ${idx}: A'nın rolü var (${role})`);
      if (idx === 0) {
        await mustFail(
          A.choose(live.matchId, 99, 'left'),
          'yanlış kickIndex reddedilir',
          /süre doldu/,
        );
        await mustFail(
          A.choose(live.matchId, idx, 'up' as PenaltyDirection),
          'geçersiz köşe reddedilir',
          /Geçersiz/,
        );
      }
      if (!skippedOnce && idx >= 2) {
        // Bilerek seçme → süre dolunca ORTA olmalı.
        skippedOnce = true;
        myChoices.set(idx, 'center');
      } else {
        const dir = DIRS[idx % 3]!;
        const res = await A.choose(live.matchId, idx, dir);
        ok(res.role === role, `vuruş ${idx}: ack rolü ${res.role}`);
        myChoices.set(idx, dir);
        if (!changedOnce) {
          changedOnce = true;
          const res2 = await A.choose(live.matchId, idx, 'right');
          ok(res2.role === role, 'seçim süre dolmadan değiştirilebilir');
          myChoices.set(idx, 'right');
        }
      }
      const kick = await A.kickFor(idx, 20_000);
      const a = kick.attempt;
      ok(
        ATTEMPT_OK(a),
        `vuruş ${idx}: köşeler/sonuç tutarlı (${a.shotDirection}/${a.keeperDirection} → ${a.outcome})`,
      );
      const mine = role === 'shooter' ? a.shotDirection : a.keeperDirection;
      ok(mine === myChoices.get(idx), `vuruş ${idx}: benim köşem = seçimim (${mine})`);
      ok(
        kick.state.phase === 'revealed' && kick.state.lastAttempt?.outcome === a.outcome,
        'revealed durumu lastAttempt taşıyor',
      );
      ok(
        kick.state.round === a.round && kick.state.shooter.id === a.playerId,
        'revealed durumunda atıcı/tur açıklanan vuruşa ait',
      );
      if (kick.state.winnerId) break;
      if (idx > 40) {
        ok(false, 'seri bitmedi');
        break;
      }
    }
    ok(skippedOnce && changedOnce, 'seçmeme ve değiştirme senaryoları koşuldu');
    ok(lastState.phase === 'choosing', 'son prompt seçim evresiydi');

    await A.waitFor((p) => p.results.length > 0, 'matchResult', 30_000);
    const res = A.results[0]!;
    ok(res.pendingShootout === undefined, 'nihai sonuçta pendingShootout yok');
    ok(
      !!res.winnerId && res.penaltyShootout?.length === A.kicks.length,
      `nihai döküm ${res.penaltyShootout?.length} vuruş, kazanan var`,
    );
    const lastA = res.penaltyShootout![res.penaltyShootout!.length - 1]!;
    ok(
      res.penaltiesHome === lastA.scoreHomeAfter && res.penaltiesAway === lastA.scoreAwayAfter,
      'penaltı skoru dökümle uyumlu',
    );
    ok(
      A.state?.shootout === null || A.state?.shootout === undefined,
      'seri bitince room:state.shootout temizlendi',
    );
    await A.waitFor((p) => p.state?.phase === 'finished', 'oyun bitti', 30_000);
    ok(A.state?.tournament?.championId === res.winnerId, 'şampiyon = seri kazananı');
    A.s.disconnect();
  }

  /* ---------------------- OYUN 2: 2 insan ---------------------- */
  console.log('\n[OYUN 2] 2 takım · 2 insan · eş zamanlı seçim + kopma/yeniden bağlanma');
  {
    const A = await Player.connect('A');
    const B = await Player.connect('B');
    const { roomState: r0, you: youA } = await A.create('Arda', { ...FAST, tournamentSize: 2 });
    A.youId = youA.id;
    const { you: youB } = await B.join(r0.code, 'Berk');
    B.youId = youB.id;
    A.ready();
    B.ready();
    await A.waitFor(
      (p) => !!p.state?.participants.find((x) => x.id === youB.id)?.isReady,
      'B hazır',
    );
    await A.start();
    const live = await toLiveMatch(A, [A, B]);
    ok(live.result.pendingShootout === true, 'insan–insan maç seriye gitti');

    let idx = -1;
    let droppedOnce = false;
    let bothTiming = false;
    for (;;) {
      const st = await A.nextPrompt(idx, 40_000);
      idx = st.kickIndex;
      const shooter = st.shooterTeamId === A.youId ? A : B;
      const keeper = shooter === A ? B : A;
      if (!droppedOnce && idx === 1) {
        // B kopar: vuruş süre sonunda bot kararıyla çözülmeli.
        droppedOnce = true;
        const tDrop = Date.now();
        B.s.disconnect();
        await A.waitFor(
          (p) => p.state?.participants.find((x) => x.id === B.youId)?.connected === false,
          'B kopuk görünüyor',
          5000,
        );
        const aDir: PenaltyDirection = 'left';
        await (shooter === A
          ? A.choose(live.matchId, idx, aDir)
          : A.choose(live.matchId, idx, aDir));
        const kick = await A.kickFor(idx, 20_000);
        const elapsed = Date.now() - tDrop;
        ok(elapsed >= 4000, `kopuk taraf için süre sonunda çözüldü (${elapsed} ms)`);
        const aSide = shooter === A ? kick.attempt.shotDirection : kick.attempt.keeperDirection;
        ok(aSide === aDir, 'bağlı tarafın seçimi korundu');
        // B geri döner: room:state.shootout + matchLive tekrar gelmeli.
        const before = B.lives.length;
        const enter = await B.reconnect(r0.roomId);
        ok(enter.roomState.phase === 'simulation', 'B yeniden bağlandı');
        await B.waitFor((p) => p.lives.length > before, 'B matchLive tekrar aldı', 5000);
        const relive = B.lives[B.lives.length - 1]!;
        ok(
          relive.matchId === live.matchId && (relive.elapsedMs ?? 0) > 15_000,
          `yeniden gönderilen matchLive aynı maç + geçen süre (${relive.elapsedMs} ms)`,
        );
        ok(
          typeof B.state?.shootout?.remainingMs === 'number',
          'room:state.shootout remainingMs taşıyor',
        );
        await B.waitFor(
          (p) => !!p.state?.shootout && p.state.shootout.matchId === live.matchId,
          'B room:state.shootout aldı',
          5000,
        );
        if (kick.state.winnerId) break;
        continue;
      }
      const dS = DIRS[(idx + 1) % 3]!;
      const dK = DIRS[(idx + 2) % 3]!;
      const tChoose = Date.now();
      const [rs, rk] = await Promise.all([
        shooter.choose(live.matchId, idx, dS),
        keeper.choose(live.matchId, idx, dK),
      ]);
      ok(rs.role === 'shooter' && rk.role === 'keeper', `vuruş ${idx}: roller doğru`);
      const kick = await A.kickFor(idx, 20_000);
      const dt = Date.now() - tChoose;
      if (dt < 1500) bothTiming = true;
      ok(
        kick.attempt.shotDirection === dS && kick.attempt.keeperDirection === dK,
        `vuruş ${idx}: açıklanan köşeler = seçimler (${dS}/${dK}, ${dt} ms)`,
      );
      await B.kickFor(idx, 5000);
      if (kick.state.winnerId) break;
      if (idx > 40) {
        ok(false, 'seri bitmedi');
        break;
      }
    }
    ok(bothTiming, 'iki taraf da seçince vuruş süre dolmadan çözüldü');
    await Promise.all(
      [A, B].map((p) => p.waitFor((x) => x.state?.phase === 'finished', 'oyun bitti', 30_000)),
    );
    ok(A.results[0]?.winnerId === B.results[0]?.winnerId, 'iki istemci aynı sonucu aldı');
    A.s.disconnect();
    B.s.disconnect();
  }

  /* ---------------------- OYUN 3: 4 takım, izleyici ---------------------- */
  console.log('\n[OYUN 3] 4 takım · 2 insan + 2 bot · izleyici reddi');
  {
    const A = await Player.connect('A');
    const B = await Player.connect('B');
    const { roomState: r0, you: youA } = await A.create('Arda', { ...FAST, tournamentSize: 4 });
    A.youId = youA.id;
    const { you: youB } = await B.join(r0.code, 'Berk');
    B.youId = youB.id;
    A.ready();
    B.ready();
    await A.waitFor(
      (p) => !!p.state?.participants.find((x) => x.id === youB.id)?.isReady,
      'B hazır',
    );
    await A.start();
    await toLiveMatch(A, [A, B]);

    let spectatorChecked = false;
    let humanMatches = 0;
    const seen = new Set<string>();
    for (;;) {
      // Sıradaki seçim evresini bekle (herhangi bir maç).
      const key = (s: ShootoutState) => `${s.matchId}#${s.kickIndex}`;
      await A.waitFor(
        (p) => p.prompts.some((s) => s.phase === 'choosing' && !seen.has(key(s))) || !!p.finished,
        'prompt ya da bitiş',
        120_000,
      );
      if (A.finished) break;
      const st = A.prompts.find((s) => s.phase === 'choosing' && !seen.has(key(s)))!;
      seen.add(key(st));
      if (st.kickIndex === 0) humanMatches++;
      for (const p of [A, B]) {
        const role = p.roleIn(st);
        if (role === 'spectator') {
          if (!spectatorChecked) {
            spectatorChecked = true;
            await mustFail(
              p.choose(st.matchId, st.kickIndex, 'left'),
              'izleyicinin seçimi reddedilir',
              /rolün yok/,
            );
          }
        } else {
          await p.choose(st.matchId, st.kickIndex, DIRS[st.kickIndex % 3]!).catch(() => undefined);
        }
      }
      await A.waitFor(
        (p) => p.kicks.some((k) => key(k.state) === key(st)) || !!p.finished,
        'kick',
        20_000,
      );
    }
    await Promise.all(
      [A, B].map((p) => p.waitFor((x) => x.state?.phase === 'finished', 'oyun bitti', 60_000)),
    );
    ok(spectatorChecked, 'izleyici senaryosu koşuldu');
    ok(humanMatches >= 2, `insanlı ${humanMatches} maç seriyle oynandı`);
    ok(!!A.finished?.championId, 'şampiyon belli');
    A.s.disconnect();
    B.s.disconnect();
  }
} catch (err) {
  console.error('\n✗ HATA:', err);
  failures++;
}

stopServer();
console.log(failures === 0 ? '\n✓ TÜM SENARYOLAR GEÇTİ' : `\n✗ ${failures} başarısız`);
process.exit(failures === 0 ? 0 : 1);
