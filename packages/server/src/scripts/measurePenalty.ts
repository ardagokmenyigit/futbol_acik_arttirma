/**
 * SERİ PENALTI — KÖŞE OYUNU ÖLÇÜMÜ (CLAUDE.md §3.2 için).
 *
 *  [1] Analitik tablo + Monte Carlo: tipik atıcılar × kaleci GEN 82 / 90 —
 *      p_kaçırma, doğru köşede p_kurtarma, farklı/aynı köşede ve rastgele
 *      seçimde gol oranı.
 *  [2] Gerçek kadrolar (players.json'dan rastgele 1-2-2-2 dizilişler), rastgele
 *      köşelerle tam seri: mevkiye göre gol oranı — eski tek zarlı modelin
 *      ölçümüyle (FWD %73.7 · MID %73.0 · DEF %64.5 · GK %61.1) karşılaştırılır.
 *      Ev sahibi kazanma payı (~%50 olmalı) ve seri uzunluğu dağılımı.
 *  [3] Bot penaltı zekâsı (penaltyBot.ts): kişilikli bot × rastgele, bot × bot,
 *      bot × ezberci insan (hep aynı köşe), bot × sıralı insan (L-R-L-R).
 *      Beklenti: rastgeleye karşı gol oranı değişmez (simetri), ezberciye karşı
 *      bot kaleci daha çok kurtarır / bot atıcı daha çok atar.
 *
 * Çalıştır: npx tsx packages/server/src/scripts/measurePenalty.ts
 */
import { readFileSync } from 'node:fs';
import {
  createPRNG,
  missProbability,
  penaltySkill,
  randomDirection,
  resolveKick,
  saveProbability,
  simulateShootout,
  type Footballer,
  type PenaltyDirection,
  type Position,
  type ShootoutProgress,
} from '@fal/shared';
import { botKeeperDirection, botShotDirection } from '../tournament/penaltyBot.js';

const DATA_URL = new URL('../../data/players.json', import.meta.url);
const players = (JSON.parse(readFileSync(DATA_URL, 'utf8')) as { players: Footballer[] }).players;
const byPos: Record<Position, Footballer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
for (const p of players) byPos[p.position].push(p);

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const mk = (position: Position, overall: number): Footballer => ({
  id: `${position}-${overall}`,
  name: `${position} ${overall}`,
  position,
  overall,
});

/* ------------------------------ [1] analitik ------------------------------ */
console.log('=== [1] TEK VURUŞ — analitik (Monte Carlo 200k ile doğrulama) ===');
const shooters = [mk('FWD', 90), mk('FWD', 84), mk('MID', 85), mk('DEF', 83), mk('GK', 82)];
for (const gkOverall of [82, 90]) {
  const keeper = mk('GK', gkOverall);
  console.log(`\nkaleci GEN ${gkOverall}`);
  console.log(
    'atıcı     | p_kaçırma | p_kurtarma (doğru köşe) | gol farklı | gol aynı | gol rastgele | MC rastgele',
  );
  for (const s of shooters) {
    const m = missProbability(s);
    const sv = saveProbability(keeper, s);
    const goalDiff = 1 - m;
    const goalSame = (1 - m) * (1 - sv);
    const goalRandom = (1 - m) * (1 - sv / 3);
    const prng = createPRNG(4242 + s.overall + gkOverall);
    let goals = 0;
    const N = 200_000;
    for (let i = 0; i < N; i++) {
      const a = randomDirection(prng);
      const b = randomDirection(prng);
      if (resolveKick(s, keeper, a, b, prng) === 'goal') goals++;
    }
    console.log(
      `${s.name.padEnd(9)} | ${pct(m).padStart(9)} | ${pct(sv).padStart(23)} | ${pct(goalDiff).padStart(10)} | ${pct(goalSame).padStart(8)} | ${pct(goalRandom).padStart(12)} | ${pct(goals / N)}`,
    );
  }
}

/* ------------------------------ [2] gerçek kadrolar ------------------------------ */
console.log('\n=== [2] GERÇEK KADROLAR — rastgele köşelerle tam seri ===');
const prng2 = createPRNG(20260917);
const pick = <T>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    const j = Math.floor(prng2() * copy.length);
    out.push(copy.splice(j, 1)[0]!);
  }
  return out;
};
const randomSquad = (): Footballer[] => [
  ...pick(byPos.GK, 1),
  ...pick(byPos.DEF, 2),
  ...pick(byPos.MID, 2),
  ...pick(byPos.FWD, 2),
];

type Tally = { goals: number; kicks: number; saved: number; missed: number };
const tally = (): Tally => ({ goals: 0, kicks: 0, saved: 0, missed: 0 });
const runSeries = (
  n: number,
  chooser?: Parameters<typeof simulateShootout>[3],
): {
  byPosition: Record<Position, Tally>;
  homeWins: number;
  lengths: Map<number, number>;
  total: Tally;
} => {
  const byPosition: Record<Position, Tally> = {
    GK: tally(),
    DEF: tally(),
    MID: tally(),
    FWD: tally(),
  };
  const total = tally();
  const lengths = new Map<number, number>();
  let homeWins = 0;
  for (let i = 0; i < n; i++) {
    const home = { id: 'H', nickname: 'Ev', players: randomSquad() };
    const away = { id: 'A', nickname: 'Dep', players: randomSquad() };
    const all = new Map<string, Footballer>();
    for (const p of [...home.players, ...away.players]) all.set(p.id, p);
    const res = simulateShootout(home, away, prng2, chooser);
    if (res.winnerId === 'H') homeWins++;
    lengths.set(res.attempts.length, (lengths.get(res.attempts.length) ?? 0) + 1);
    for (const a of res.attempts) {
      const pos = all.get(a.playerId ?? '')?.position ?? 'FWD';
      const t = byPosition[pos];
      t.kicks++;
      total.kicks++;
      if (a.outcome === 'goal') {
        t.goals++;
        total.goals++;
      } else if (a.outcome === 'saved') {
        t.saved++;
        total.saved++;
      } else {
        t.missed++;
        total.missed++;
      }
    }
  }
  return { byPosition, homeWins, lengths, total };
};

const N2 = 60_000;
const r2 = runSeries(N2);
// Eski tek zarlı model aynı kadrolarda ne verirdi? (0.715 + (beceri−74)·0.0035 − (GK−82)·0.006)
const oldModel: Record<Position, { sum: number; n: number }> = {
  GK: { sum: 0, n: 0 },
  DEF: { sum: 0, n: 0 },
  MID: { sum: 0, n: 0 },
  FWD: { sum: 0, n: 0 },
};
{
  const prngOld = createPRNG(20260917);
  const pickOld = <T>(arr: T[], n: number): T[] => {
    const copy = [...arr];
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(copy.splice(Math.floor(prngOld() * copy.length), 1)[0]!);
    return out;
  };
  for (let i = 0; i < 20_000; i++) {
    const squad = [
      ...pickOld(byPos.GK, 1),
      ...pickOld(byPos.DEF, 2),
      ...pickOld(byPos.MID, 2),
      ...pickOld(byPos.FWD, 2),
    ];
    const opp = [
      ...pickOld(byPos.GK, 1),
      ...pickOld(byPos.DEF, 2),
      ...pickOld(byPos.MID, 2),
      ...pickOld(byPos.FWD, 2),
    ];
    const gk = opp[0]!.overall;
    for (const p of squad) {
      const skill = penaltySkill(p);
      const rate = Math.min(
        0.93,
        Math.max(0.45, 0.715 + (skill - 74) * 0.0035 - (gk - 82) * 0.006),
      );
      oldModel[p.position].sum += rate;
      oldModel[p.position].n++;
    }
  }
}
console.log(`seri: ${N2} · ev sahibi kazandı ${pct(r2.homeWins / N2)}`);
console.log('mevki | vuruş | gol | kurtarış | dışarı | eski model (aynı kadro dağılımı)');
for (const pos of ['FWD', 'MID', 'DEF', 'GK'] as Position[]) {
  const t = r2.byPosition[pos];
  const o = oldModel[pos];
  console.log(
    `${pos.padEnd(5)} | ${String(t.kicks).padStart(6)} | ${pct(t.goals / t.kicks)} | ${pct(t.saved / t.kicks).padStart(8)} | ${pct(t.missed / t.kicks).padStart(6)} | ${pct(o.sum / o.n)}`,
  );
}
console.log(
  `toplam gol ${pct(r2.total.goals / r2.total.kicks)} · kurtarış ${pct(r2.total.saved / r2.total.kicks)} · dışarı ${pct(r2.total.missed / r2.total.kicks)}`,
);
const lens = [...r2.lengths.entries()].sort((a, b) => a[0] - b[0]);
const avgLen = lens.reduce((s, [l, c]) => s + l * c, 0) / N2;
const sudden = lens.filter(([l]) => l > 10).reduce((s, [, c]) => s + c, 0);
console.log(
  `seri uzunluğu ort. ${avgLen.toFixed(2)} vuruş · ani ölüme giden ${pct(sudden / N2)} · en uzun ${lens[lens.length - 1]![0]}`,
);

/* ------------------------------ [3] bot zekâsı ------------------------------ */
console.log('\n=== [3] BOT PENALTI ZEKÂSI (penaltyBot.ts) ===');
type Chooser = NonNullable<Parameters<typeof simulateShootout>[3]>;
const botCtx = (
  ctx: { shooter: Footballer; keeper: Footballer; progress: ShootoutProgress; isHome: boolean },
  teamId: string,
  matchId: string,
) => ({
  // Kişilik bot id'sinden türer: her seride farklı kişilik olsun (üretimde id = UUID).
  botId: `${teamId}-${matchId}`,
  matchId,
  kickIndex: ctx.progress.attempts.length,
  shooter: ctx.shooter,
  keeper: ctx.keeper,
  attempts: ctx.progress.attempts,
  botTeamId: teamId,
});
let matchNo = 0;
/** Ev sahibi tarafın stratejisi × deplasman tarafın stratejisi. */
type Strategy = 'random' | 'bot' | 'stubborn' | 'alternate';
const shotOf = (
  strat: Strategy,
  ctx: Parameters<Chooser>[0],
  teamId: string,
  r: () => number,
): PenaltyDirection => {
  const myShots = ctx.progress.attempts.filter((a) => a.teamId === teamId).length;
  switch (strat) {
    case 'random':
      return randomDirection(r);
    case 'bot':
      return botShotDirection(botCtx(ctx, teamId, `m${matchNo}`));
    case 'stubborn':
      return 'right';
    case 'alternate':
      return myShots % 2 === 0 ? 'left' : 'right';
  }
};
const diveOf = (
  strat: Strategy,
  ctx: Parameters<Chooser>[0],
  teamId: string,
  r: () => number,
): PenaltyDirection => {
  const myDives = ctx.progress.attempts.filter((a) => a.teamId !== teamId).length;
  switch (strat) {
    case 'random':
      return randomDirection(r);
    case 'bot':
      return botKeeperDirection(botCtx(ctx, teamId, `m${matchNo}`));
    case 'stubborn':
      return 'left';
    case 'alternate':
      return myDives % 2 === 0 ? 'left' : 'right';
  }
};
const pair = (homeStrat: Strategy, awayStrat: Strategy): Chooser => {
  return (ctx, r) => {
    const shooterTeam = ctx.isHome ? 'H' : 'A';
    const keeperTeam = ctx.isHome ? 'A' : 'H';
    const shooterStrat = ctx.isHome ? homeStrat : awayStrat;
    const keeperStrat = ctx.isHome ? awayStrat : homeStrat;
    return {
      shot: shotOf(shooterStrat, ctx, shooterTeam, r),
      keeper: diveOf(keeperStrat, ctx, keeperTeam, r),
    };
  };
};
const N3 = 30_000;
console.log(`seri başına ${N3} · sütunlar: ev sahibi kazanma · ev golü · dep golü`);
for (const [h, a] of [
  ['random', 'random'],
  ['bot', 'random'],
  ['bot', 'bot'],
  ['bot', 'stubborn'],
  ['bot', 'alternate'],
  ['random', 'stubborn'],
] as [Strategy, Strategy][]) {
  matchNo = 0;
  const chooser: Chooser = (ctx, r) => {
    if (ctx.progress.attempts.length === 0 && ctx.isHome) matchNo++;
    return pair(h, a)(ctx, r);
  };
  const res = runSeries(N3, chooser);
  // Ev/dep gol oranı: attempts içinden takım bazında.
  console.log(
    `${h.padEnd(9)} vs ${a.padEnd(9)} | ev kazandı ${pct(res.homeWins / N3).padStart(6)} | gol ${pct(res.total.goals / res.total.kicks)} · kurtarış ${pct(res.total.saved / res.total.kicks)}`,
  );
}
console.log(
  '\nNot: "stubborn" hep aynı köşe (atıcı sağ / kaleci sol), "alternate" L-R-L-R. Bot rastgeleye karşı ~%50 kalmalı, ezberciye karşı belirgin üstün olmalı.',
);
