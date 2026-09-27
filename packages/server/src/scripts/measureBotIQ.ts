/**
 * BOT ZEKÂSI ÖLÇÜMÜ — insan stratejileri botlara karşı ne kadar avantaj sağlıyor?
 *
 * `measureBalance.ts` ile aynı çevrimdışı draft döngüsü (engine.ts tur mantığı,
 * zamanlayıcısız), ama katılımcılar takılabilir "ajan"lardır: 1 insan
 * stratejisi + (n−1) gerçek bot. Her draft 4 bracket dizilişiyle turnuvaya
 * sokulur; insanın şampiyonluk oranı adil paya (1/n) karşı raporlanır.
 *
 * İnsan stratejileri (botların sömürülebildiği bilinen yollar):
 *  - `sabirli`   : yıldız (90+) dışına en fazla birkaç M verir, parayı
 *                  yıldızlara saklar, dipteki oyuncuya pas der. Kullanıcının
 *                  tarif ettiği "81'lik için 150'den maks 10" oyuncusu.
 *  - `sabirli+1` : aynısı, ama her artırmayı +1 ile yapar — botun tur başına
 *                  teklif tavanını (MAX_BIDS_PER_BOT_PER_ROUND) tüketip onu
 *                  susturmaya çalışır.
 *  - `yildiz`    : yalnız yıldızlara teklif verir (bütçenin %55'i);
 *                  `yildiz-hepsi` aynısı %85 ile.
 *  - `saldirgan` : ilk turlardan itibaren iyi olan her şeye adil payın
 *                  üstünde teklif verir (ters yön: temkinli botu sömürmek).
 *  - `bot×k`     : botun formülünü birebir bilen insan, tavanı k ile çarpar
 *                  (k < 1 cimri, k > 1 cömert) — dengenin en sert sınavı.
 *  - `bot-passız`, `pas-*`: bot teklifi + farklı pas kuralı (hiç, yalnız en
 *                  dip, alt üçte bir, alt yarı, medyandan 3/5 GEN kötü).
 *  - `bot`       : kontrol — insan yerine de bot; adil pay beklenir.
 *
 * Ayrıca: ilk tur bot tavanı GEN bandına göre, bot–bot sağlığı (yıldız /
 * sıradan ortalama fiyatı, asgariye giden tur oranı, harcanmayan bütçe,
 * eksik kadro, pas kullanımı).
 *
 * Kullanım:
 *   caffeinate -i npx tsx packages/server/src/scripts/measureBotIQ.ts [draft] [boyutlar] [stratejiler]
 *   örn. ... 1000 2,4,8 bot,sabirli,yildiz     (HIDDEN=1 → gizli bütçe modu)
 */
import {
  DEFAULT_ROOM_CONFIG,
  passesForSize,
  simulateMatch,
  type Footballer,
  type MatchResult,
  type Participant,
  type RoomConfig,
  type TournamentSize,
} from '@fal/shared';
import {
  botMaxBid,
  botOpeningBid,
  botShouldPass,
  decideBotBid,
  marketOf,
  type BotView,
} from '../auction/bot.js';
import { buildDraftPool } from '../auction/pool.js';
import { buildTurnOrders } from '../auction/turnOrder.js';
import { positionCount } from '../auction/validateBid.js';
import { buildTeam } from '../simulation/teamStats.js';
import { advanceTournament, createTournament } from '../tournament/tournamentEngine.js';

const DRAFTS = Number(process.argv[2] ?? 1000);
const SIZES = (process.argv[3] ?? '2,4,8').split(',').map(Number) as TournamentSize[];
const ONLY = process.argv[4]?.split(',');
/** `HIDDEN=1` → gizli bütçe modu (botlar rakip bütçesini görmez). */
const HIDDEN = process.env.HIDDEN === '1';

/** engine.ts ile aynı tavanlar — insanlara uygulanmaz (motor da uygulamıyor). */
const MAX_BIDS_PER_BOT_PER_ROUND = 10;
const MAX_BOT_BIDS_PER_ROUND = 60;
const STAR = 90;

interface Ctx {
  config: RoomConfig;
  /** Masadaki hariç, havuzda kalanlar. */
  pool: Footballer[];
  parts: Participant[];
  passed: Set<string>;
  /** Bu turda bu katılımcının kalan bot teklif hakkı (insan için Infinity). */
  bidsLeft: number;
}

interface Agent {
  name: string;
  isBot: boolean;
  /** 'pass' ya da açılış tutarı. */
  open(me: Participant, f: Footballer, ctx: Ctx): number | 'pass';
  /** Serbest evre: tutar ya da null (vermez). */
  bid(
    me: Participant,
    f: Footballer,
    ctx: Ctx,
    highest: { playerId: string; amount: number },
    floor: number,
  ): number | null;
}

function canTake(config: RoomConfig, p: Participant, f: Footballer): boolean {
  return (
    p.squad.length < config.squadSize && positionCount(p, f.position) < config.squad[f.position]
  );
}

/** engine.ts `botViewFor` ile aynı. */
function viewOf(ctx: Ctx, meId: string): BotView {
  return {
    pool: ctx.pool,
    rivals: ctx.config.hiddenBudgets
      ? null
      : ctx.parts
          .filter((p) => p.id !== meId && !ctx.passed.has(p.id))
          .map((p) => ({ budget: p.budget, squad: p.squad })),
    market: marketOf(
      ctx.parts,
      ctx.config,
      ctx.config.hiddenBudgets ? ctx.parts.find((p) => p.id === meId) : undefined,
    ),
  };
}

/* --------------------------------- ajanlar --------------------------------- */

const botAgent: Agent = {
  name: 'bot',
  isBot: true,
  open(me, f, ctx) {
    const view = viewOf(ctx, me.id);
    if (botShouldPass(me, f, ctx.config, view)) return 'pass';
    return botOpeningBid(me, f, ctx.config, view);
  },
  bid(me, f, ctx, highest, floor) {
    return decideBotBid(me, f, ctx.config, viewOf(ctx, me.id), highest, floor, ctx.bidsLeft);
  },
};

/**
 * İnsan tavanı: yıldıza (kalan zorunlu slotlar için asgari kenarda tutarak)
 * bütçenin `starShare`'ini, sıradana en fazla `cheapCap` verir; son iki slotta
 * elde kalanı harcar.
 */
function humanCap(
  me: Participant,
  f: Footballer,
  config: RoomConfig,
  opts: { starOnly: boolean; cheapCap: number; starShare: number },
): number {
  if (!canTake(config, me, f)) return 0;
  const slotsLeft = config.squadSize - me.squad.length;
  const affordable = me.budget - (slotsLeft - 1) * config.minBidIncrement;
  if (slotsLeft <= 2) return affordable;
  if (f.overall >= STAR) return Math.min(affordable, Math.floor(me.budget * opts.starShare));
  if (opts.starOnly) return 0;
  return Math.min(affordable, opts.cheapCap);
}

function humanShouldPass(me: Participant, f: Footballer, ctx: Ctx): boolean {
  if (me.passesLeft <= 0 || f.overall >= STAR) return false;
  const need = ctx.config.squad[f.position] - positionCount(me, f.position);
  const same = ctx.pool.filter((x) => x.position === f.position);
  if (same.length < need + 2) return false;
  // Pozisyonda kalanların en kötü üçte birindeyse: "bunu bana yıkma".
  const worse = same.filter((x) => x.overall < f.overall).length;
  return worse / same.length < 0.34;
}

function patient(name: string, step: 'min' | 'smart', starOnly = false, starShare = 0.55): Agent {
  const opts = { starOnly, cheapCap: starOnly ? 0 : 4, starShare };
  return {
    name,
    isBot: false,
    open(me, f, ctx) {
      if (humanShouldPass(me, f, ctx)) return 'pass';
      return ctx.config.minBidIncrement;
    },
    bid(me, f, ctx, highest, floor) {
      if (highest.playerId === me.id) return null;
      const cap = humanCap(me, f, ctx.config, opts);
      if (floor > cap) return null;
      if (step === 'min') return floor;
      // "Akıllı" insan: kalan payın küçük bir kısmıyla sıçrar.
      return Math.min(cap, floor + Math.floor((cap - floor) * 0.15));
    },
  };
}

const aggressive: Agent = {
  name: 'saldirgan',
  isBot: false,
  open(_me, _f, ctx) {
    return ctx.config.minBidIncrement;
  },
  bid(me, f, ctx, highest, floor) {
    if (highest.playerId === me.id || !canTake(ctx.config, me, f)) return null;
    const slotsLeft = ctx.config.squadSize - me.squad.length;
    const affordable = me.budget - (slotsLeft - 1) * ctx.config.minBidIncrement;
    const fair = me.budget / slotsLeft;
    const cap = Math.min(
      affordable,
      Math.floor(fair * (f.overall >= STAR ? 2.2 : f.overall >= 85 ? 1.2 : 0.5)),
    );
    return floor <= cap ? floor : null;
  },
};

/**
 * "Botun kafasıyla ama k kat cömert" insan: botun tavanını k ile çarpar.
 * k > 1 kazanıyorsa botlar parayı az harcıyor demektir (masada para kalıyor).
 */
function scaledBot(k: number): Agent {
  return {
    name: `bot×${k}`,
    isBot: false,
    open(me, f, ctx) {
      const view = viewOf(ctx, me.id);
      if (botShouldPass(me, f, ctx.config, view)) return 'pass';
      return ctx.config.minBidIncrement;
    },
    bid(me, f, ctx, highest, floor) {
      if (highest.playerId === me.id || !canTake(ctx.config, me, f)) return null;
      const slotsLeft = ctx.config.squadSize - me.squad.length;
      const affordable = me.budget - (slotsLeft - 1) * ctx.config.minBidIncrement;
      const max = Math.min(
        affordable,
        Math.floor(botMaxBid(me, f, ctx.config, viewOf(ctx, me.id)) * k),
      );
      return floor <= max ? floor : null;
    },
  };
}

/** Kontrol: bot, ama pas hakkını hiç kullanmaz — pas zekâsının getirisi. */
const botNoPass: Agent = {
  ...botAgent,
  name: 'bot-passız',
  isBot: false,
  open(me, f, ctx) {
    return botOpeningBid(me, f, ctx.config, viewOf(ctx, me.id));
  },
};

/** Bot teklifi + farklı bir pas kuralı: botun pas zamanlaması en iyisi mi? */
function botWithPass(
  name: string,
  rule: (rank: number, gap: number, me: Participant) => boolean,
): Agent {
  return {
    ...botAgent,
    name,
    isBot: false,
    open(me, f, ctx) {
      const need = ctx.config.squad[f.position] - positionCount(me, f.position);
      const same = ctx.pool.filter((x) => x.position === f.position);
      if (me.passesLeft > 0 && need > 0 && same.length >= need + 1) {
        const rank = same.filter((x) => x.overall < f.overall).length / same.length;
        const sorted = same.map((x) => x.overall).sort((a, b) => a - b);
        const gap = sorted[Math.floor(sorted.length / 2)]! - f.overall;
        if (rule(rank, gap, me)) return 'pass';
      }
      return botOpeningBid(me, f, ctx.config, viewOf(ctx, me.id));
    },
  };
}

const HUMANS: Agent[] = [
  botAgent,
  botNoPass,
  botWithPass('pas-dip', (rank) => rank === 0),
  botWithPass('pas-alt3', (rank) => rank < 0.34),
  botWithPass('pas-yari', (rank) => rank < 0.5),
  botWithPass('pas-fark3', (_r, gap) => gap >= 3),
  botWithPass('pas-fark5', (_r, gap) => gap >= 5),
  patient('sabirli', 'smart'),
  patient('sabirli+1', 'min'),
  patient('yildiz', 'smart', true),
  patient('yildiz-hepsi', 'smart', true, 0.85),
  aggressive,
  scaledBot(0.8),
  scaledBot(1.15),
  scaledBot(1.3),
  scaledBot(1.7),
];

/* ------------------------------ draft döngüsü ------------------------------ */

interface DraftStats {
  starPrice: number[];
  normalPrice: number[];
  minRounds: number;
  rounds: number;
  leftover: number[];
  incomplete: number;
  /** Bot pasları: futbolcunun mevkide kalanlar içindeki yüzdelik dilimi. */
  passRanks: number[];
  unusedPasses: number;
}

function runDraft(size: TournamentSize, human: Agent, st: DraftStats): Participant[] {
  const config: RoomConfig = {
    ...DEFAULT_ROOM_CONFIG,
    tournamentSize: size,
    hiddenBudgets: HIDDEN,
  };
  const parts: Participant[] = Array.from({ length: size }, (_, i) => ({
    id: `${i === 0 ? 'h' : 'bot'}-${i}-${Math.random().toString(36).slice(2, 10)}`,
    nickname: i === 0 ? 'insan' : `Bot ${i}`,
    isHost: i === 0,
    isReady: true,
    connected: true,
    budget: config.startingBudget,
    squad: [],
    passesLeft: passesForSize(size),
    isBot: i !== 0,
  }));
  const agentOf = (p: Participant): Agent => (p === parts[0] ? human : botAgent);
  const pool = buildDraftPool(config, size);
  const remaining = [...pool];
  const plan = buildTurnOrders(
    parts.map((b) => b.id),
    config.squadSize * size,
  );
  const min = config.minBidIncrement;

  for (let tur = 0; tur < plan.orders.length; tur++) {
    if (parts.every((p) => p.squad.length >= config.squadSize)) break;
    const order = plan.orders[tur]!;
    let opener = order
      .map((id) => parts.find((p) => p.id === id)!)
      .find((p) => p.squad.length < config.squadSize);
    if (!opener) break;
    const idx = remaining.findIndex((f) => canTake(config, opener!, f));
    if (idx < 0) break;
    const footballer = remaining.splice(idx, 1)[0]!;
    let eligible = parts.filter((p) => canTake(config, p, footballer));

    const award = (w: Participant, amount: number) => {
      const paid = Math.min(w.budget, amount);
      w.budget -= paid;
      w.squad.push(footballer);
      st.rounds++;
      if (paid <= min) st.minRounds++;
      (footballer.overall >= STAR ? st.starPrice : st.normalPrice).push(paid);
    };

    if (eligible.length === 1) {
      award(eligible[0]!, min);
      continue;
    }

    const passed = new Set<string>();
    const passedIds: string[] = [];
    const ctx: Ctx = { config, pool: remaining, parts, passed, bidsLeft: Infinity };
    let highest: { playerId: string; amount: number };
    for (;;) {
      const a = agentOf(opener);
      const r = a.open(opener, footballer, {
        ...ctx,
        bidsLeft: a.isBot ? MAX_BIDS_PER_BOT_PER_ROUND : Infinity,
      });
      if (r === 'pass' && opener.passesLeft > 0) {
        if (opener.isBot) {
          const same = remaining.filter((x) => x.position === footballer.position);
          st.passRanks.push(
            same.filter((x) => x.overall < footballer.overall).length / Math.max(1, same.length),
          );
        }
        opener.passesLeft -= 1;
        passed.add(opener.id);
        passedIds.push(opener.id);
        eligible = eligible.filter((p) => p.id !== opener!.id);
        const able = parts.filter((p) => canTake(config, p, footballer));
        let cands = able.filter((p) => !passed.has(p.id));
        if (cands.length === 0)
          cands = able.filter((p) => p.id !== passedIds[passedIds.length - 1]);
        if (cands.length === 0) cands = able;
        opener = cands[Math.floor(Math.random() * cands.length)]!;
        continue;
      }
      const amount = r === 'pass' ? min : r;
      highest = {
        playerId: opener.id,
        amount: Math.max(min, Math.min(Math.floor(amount), opener.budget)),
      };
      break;
    }

    // Serbest teklif: kimse artırmayana kadar. Bot tavanları motorla aynı.
    let botTotal = 0;
    const perBot = new Map<string, number>();
    for (let guard = 0; guard < 2000; guard++) {
      let raised = false;
      const order2 = [...eligible].sort(() => Math.random() - 0.5);
      for (const p of order2) {
        const a = agentOf(p);
        if (highest.playerId === p.id) continue;
        const own = perBot.get(p.id) ?? 0;
        if (a.isBot && (botTotal >= MAX_BOT_BIDS_PER_ROUND || own >= MAX_BIDS_PER_BOT_PER_ROUND))
          continue;
        const floor = highest.amount + min;
        const bidsLeft = a.isBot
          ? Math.min(MAX_BIDS_PER_BOT_PER_ROUND - own, MAX_BOT_BIDS_PER_ROUND - botTotal)
          : Infinity;
        const amount = a.bid(p, footballer, { ...ctx, bidsLeft }, highest, floor);
        if (amount === null || amount < floor || amount > p.budget) continue;
        highest = { playerId: p.id, amount: Math.floor(amount) };
        if (a.isBot) {
          perBot.set(p.id, own + 1);
          botTotal++;
        }
        raised = true;
        break; // her tekliften sonra herkes yeniden bakar (gerçek zamanlıya yakın)
      }
      if (!raised) break;
    }
    award(
      parts.find((p) => p.id === highest.playerId)!,
      highest.amount,
    );
  }
  for (const p of parts) {
    if (p.squad.length < config.squadSize) st.incomplete++;
    st.leftover.push(p.budget);
    if (p.isBot) st.unusedPasses += p.passesLeft;
  }
  return parts;
}

/* ------------------------------ turnuva ------------------------------ */

let seed = 1;
function champion(parts: Participant[], size: TournamentSize): string | null {
  const lineup = [...parts].sort(() => Math.random() - 0.5);
  const byId = new Map(lineup.map((p) => [p.id, buildTeam(p)]));
  let state = createTournament(
    lineup.map((t) => ({ id: t.id, nickname: t.nickname, squad: t.squad })),
    size,
  );
  while (state.currentMatchId) {
    const m = state.rounds
      .flatMap((r) => r.matches)
      .find((x) => x.matchId === state.currentMatchId)!;
    if (!m.homeId || !m.awayId) break;
    const r: MatchResult = simulateMatch({
      matchId: m.matchId,
      homeTeam: byId.get(m.homeId)!,
      awayTeam: byId.get(m.awayId)!,
      seed: seed++,
      isTournament: true,
    });
    state = advanceTournament(state, r);
  }
  return state.championId ?? null;
}

const power = (p: Participant) => {
  const t = buildTeam(p);
  return (t.attack + t.defense) / 2;
};
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/**
 * Draft başı tavanı: taze bir bot, ilk turda masaya gelen futbolcuya GEN
 * bandına göre en fazla kaç M verir? ("81'liğe 150'den maks 10" sezgisi.)
 */
function probeOpeningCaps(size: TournamentSize): void {
  const config: RoomConfig = {
    ...DEFAULT_ROOM_CONFIG,
    tournamentSize: size,
    hiddenBudgets: HIDDEN,
  };
  const bands = new Map<string, number[]>();
  const band = (o: number) =>
    o >= 93
      ? '93+'
      : o >= 90
        ? '90-92'
        : o >= 87
          ? '87-89'
          : o >= 84
            ? '84-86'
            : o >= 81
              ? '81-83'
              : '78-80';
  for (let d = 0; d < 300; d++) {
    const parts: Participant[] = Array.from({ length: size }, (_, i) => ({
      id: `probe-${d}-${i}`,
      nickname: `Bot ${i}`,
      isHost: i === 0,
      isReady: true,
      connected: true,
      budget: config.startingBudget,
      squad: [],
      passesLeft: passesForSize(size),
      isBot: true,
    }));
    const pool = buildDraftPool(config, size);
    for (let k = 0; k < pool.length; k++) {
      const f = pool[k]!;
      const rest = pool.filter((_, j) => j !== k);
      const ctx: Ctx = { config, pool: rest, parts, passed: new Set(), bidsLeft: Infinity };
      const cap = botMaxBid(parts[0]!, f, config, viewOf(ctx, parts[0]!.id));
      const key = band(f.overall);
      bands.set(key, [...(bands.get(key) ?? []), cap]);
    }
  }
  const order = ['78-80', '81-83', '84-86', '87-89', '90-92', '93+'];
  console.log(
    `ilk tur bot tavanı (${config.startingBudget}M bütçe): ` +
      order
        .filter((k) => bands.has(k))
        .map((k) => `${k}: ${mean(bands.get(k)!).toFixed(1)}M`)
        .join(' · '),
  );
}

for (const size of SIZES) {
  const drafts = size === 8 ? Math.max(200, Math.floor(DRAFTS / 2)) : DRAFTS;
  console.log(
    `\n== ${size} takım${HIDDEN ? ' (gizli bütçe)' : ''} · ${drafts} draft × 4 bracket · adil pay %${(100 / size).toFixed(1)}`,
  );
  probeOpeningCaps(size);
  for (const human of HUMANS) {
    if (ONLY && !ONLY.includes(human.name)) continue;
    const st: DraftStats = {
      starPrice: [],
      normalPrice: [],
      minRounds: 0,
      rounds: 0,
      leftover: [],
      incomplete: 0,
      passRanks: [],
      unusedPasses: 0,
    };
    let wins = 0;
    let tours = 0;
    const edge: number[] = [];
    const stars: number[] = [];
    for (let d = 0; d < drafts; d++) {
      const parts = runDraft(size, human, st);
      const h = parts[0]!;
      edge.push(power(h) - mean(parts.slice(1).map(power)));
      stars.push(h.squad.filter((f) => f.overall >= STAR).length);
      for (let b = 0; b < 4; b++) {
        tours++;
        if (champion(parts, size) === h.id) wins++;
      }
    }
    const share = wins / tours;
    console.log(
      `${human.name.padEnd(10)} şampiyon %${(100 * share).toFixed(1)} (adil payın ${(share * size).toFixed(2)}x)` +
        ` · güç farkı ${mean(edge) >= 0 ? '+' : ''}${mean(edge).toFixed(2)} · yıldız ${mean(stars).toFixed(2)}` +
        (human.isBot
          ? ` | yıldız ort ${mean(st.starPrice).toFixed(1)}M · sıradan ort ${mean(st.normalPrice).toFixed(1)}M` +
            ` · asgariye giden %${((100 * st.minRounds) / st.rounds).toFixed(1)}` +
            ` · kalan bütçe ort ${mean(st.leftover).toFixed(1)}M · eksik kadro ${st.incomplete}` +
            ` · bot pası/draft ${(st.passRanks.length / drafts).toFixed(2)} (dilim ort %${(100 * mean(st.passRanks)).toFixed(0)})` +
            ` · yanan pas/draft ${(st.unusedPasses / drafts).toFixed(2)}`
          : ''),
    );
  }
}
