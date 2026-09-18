/**
 * DENGE ÖLÇÜMÜ — gerçek bot draft'ı + turnuva (CLAUDE.md §3.2 tabloları).
 *
 * Açık artırma motorunu (`engine.ts`) zamanlayıcısız, çevrimdışı birebir
 * izler: tam denk havuz (`buildDraftPool`), sıra planı (`buildTurnOrders`),
 * açıcının ihtiyacına göre futbolcu, tek uygun alıcıya otomatik atama, bot
 * açılış pası (`botShouldPass` + `pickNextOpener` kuralı), `botOpeningBid`,
 * serbest evrede botlar kimse artırmayana kadar sırayla `decideBotBid`
 * (tur başına bot başı 10 / toplam 60 teklif tavanı). Sonra her draft için
 * 4 farklı bracket dizilişiyle turnuva (`simulateMatch`, `isTournament`).
 *
 * Ölçülen: en güçlü / en zayıf takımın şampiyonluğu, gol/maç (90 dk),
 * uzatma ve penaltı payı, draft'taki güç farkı dağılımı, güç farkına göre
 * güçlünün tur geçme oranı.
 *
 * Kullanım:
 *   npx tsx packages/server/src/scripts/measureBalance.ts [draft sayısı] [sens] [baseConv]
 *   örn. ... 3000 3.3 0.106   (varsayılanlar motorun güncel sabitleri)
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
import { botOpeningBid, botShouldPass, decideBotBid, type RivalView } from '../auction/bot.js';
import { buildDraftPool } from '../auction/pool.js';
import { buildTurnOrders } from '../auction/turnOrder.js';
import { positionCount } from '../auction/validateBid.js';
import { buildTeam } from '../simulation/teamStats.js';
import { advanceTournament, createTournament } from '../tournament/tournamentEngine.js';

const DRAFTS = Number(process.argv[2] ?? 3000);
const SENS = process.argv[3] !== undefined ? Number(process.argv[3]) : undefined;
const BASE_CONV = process.argv[4] !== undefined ? Number(process.argv[4]) : undefined;

const MAX_BIDS_PER_BOT_PER_ROUND = 10;
const MAX_BOT_BIDS_PER_ROUND = 60;

function canTake(config: RoomConfig, p: Participant, f: Footballer): boolean {
  return (
    p.squad.length < config.squadSize && positionCount(p, f.position) < config.squad[f.position]
  );
}

/** Gerçek bot draft'ı — engine.ts tur mantığı, zamanlayıcısız. */
function runBotDraft(size: TournamentSize): Participant[] {
  const config: RoomConfig = { ...DEFAULT_ROOM_CONFIG, tournamentSize: size };
  const bots: Participant[] = Array.from({ length: size }, (_, i) => ({
    id: `bot-${i + 1}-${Math.random().toString(36).slice(2, 10)}`,
    nickname: `Bot ${i + 1}`,
    isHost: i === 0,
    isReady: true,
    connected: true,
    budget: config.startingBudget,
    squad: [],
    passesLeft: passesForSize(size),
    isBot: true,
  }));
  const pool = buildDraftPool(config, size);
  const remaining = [...pool];
  const plan = buildTurnOrders(
    bots.map((b) => b.id),
    config.squadSize * size,
  );
  const rivalsFor = (botId: string, passed: Set<string>): RivalView[] | null =>
    config.hiddenBudgets
      ? null
      : bots
          .filter((p) => p.id !== botId && !passed.has(p.id))
          .map((p) => ({ budget: p.budget, squad: p.squad }));

  for (let tur = 0; tur < plan.orders.length; tur++) {
    if (bots.every((p) => p.squad.length >= config.squadSize)) break;
    const order = plan.orders[tur]!;
    let opener = order
      .map((id) => bots.find((p) => p.id === id)!)
      .find((p) => p.squad.length < config.squadSize);
    if (!opener) break;
    const idx = remaining.findIndex((f) => canTake(config, opener!, f));
    if (idx < 0) break;
    const footballer = remaining.splice(idx, 1)[0]!;
    let eligible = bots.filter((p) => canTake(config, p, footballer));
    const min = config.minBidIncrement;

    // Tek uygun alıcı → otomatik asgari atama.
    if (eligible.length === 1) {
      const w = eligible[0]!;
      w.budget -= Math.min(min, Math.max(0, w.budget));
      w.squad.push(footballer);
      continue;
    }

    // Açılış (pas zinciri dahil).
    const passed = new Set<string>();
    const passedIds: string[] = [];
    let highest: { playerId: string; amount: number } | null = null;
    for (;;) {
      if (botShouldPass(opener, footballer, config, remaining)) {
        opener.passesLeft = Math.max(0, opener.passesLeft - 1);
        passed.add(opener.id);
        passedIds.push(opener.id);
        eligible = eligible.filter((p) => p.id !== opener!.id);
        const able = bots.filter((p) => canTake(config, p, footballer));
        let cands = able.filter((p) => !passed.has(p.id));
        if (cands.length === 0)
          cands = able.filter((p) => p.id !== passedIds[passedIds.length - 1]);
        if (cands.length === 0) cands = able;
        opener = cands[Math.floor(Math.random() * cands.length)]!;
        continue;
      }
      const amount = botOpeningBid(
        opener,
        footballer,
        config,
        remaining,
        rivalsFor(opener.id, passed),
      );
      const capped = Math.max(min, Math.min(Math.floor(amount), Math.max(min, opener.budget)));
      highest = { playerId: opener.id, amount: Math.min(capped, Math.max(min, opener.budget)) };
      break;
    }

    // Serbest teklif: kimse artırmayana kadar.
    let total = 0;
    const perBot = new Map<string, number>();
    for (;;) {
      let raised = false;
      const order2 = [...eligible].sort(() => Math.random() - 0.5);
      for (const bot of order2) {
        if (total >= MAX_BOT_BIDS_PER_ROUND) break;
        if (highest && highest.playerId === bot.id) continue;
        const own = perBot.get(bot.id) ?? 0;
        if (own >= MAX_BIDS_PER_BOT_PER_ROUND) continue;
        const floor = highest ? highest.amount + min : min;
        const amount = decideBotBid(
          bot,
          footballer,
          config,
          remaining,
          highest,
          floor,
          rivalsFor(bot.id, passed),
        );
        if (amount === null || amount < floor || amount > bot.budget) continue;
        highest = { playerId: bot.id, amount: Math.floor(amount) };
        perBot.set(bot.id, own + 1);
        total++;
        raised = true;
      }
      if (!raised) break;
    }
    if (highest) {
      const w = bots.find((p) => p.id === highest!.playerId)!;
      const paid = Math.min(w.budget, highest.amount);
      w.budget -= paid;
      w.squad.push(footballer);
    }
  }
  return bots;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

interface Stats {
  tournaments: number;
  strongestChamp: number;
  weakestChamp: number;
  matches: number;
  goals90: number;
  extraTime: number;
  penalties: number;
  gapWins: Map<number, { n: number; w: number }>;
  gaps: number[];
  spend: number;
  teams: number;
  incomplete: number;
}

function measure(size: TournamentSize, drafts: number): Stats {
  const st: Stats = {
    tournaments: 0,
    strongestChamp: 0,
    weakestChamp: 0,
    matches: 0,
    goals90: 0,
    extraTime: 0,
    penalties: 0,
    gapWins: new Map(),
    gaps: [],
    spend: 0,
    teams: 0,
    incomplete: 0,
  };
  let seed = 1;
  for (let d = 0; d < drafts; d++) {
    const bots = runBotDraft(size);
    for (const b of bots) {
      st.spend += DEFAULT_ROOM_CONFIG.startingBudget - b.budget;
      st.teams++;
      if (b.squad.length < DEFAULT_ROOM_CONFIG.squadSize) st.incomplete++;
    }
    const teams = bots.map((b) => ({
      id: b.id,
      nickname: b.nickname,
      squad: b.squad,
      team: buildTeam({ id: b.id, nickname: b.nickname, squad: b.squad }),
    }));
    const power = new Map(teams.map((t) => [t.id, (t.team.attack + t.team.defense) / 2]));
    const sorted = [...teams].sort((a, b) => power.get(b.id)! - power.get(a.id)!);
    st.gaps.push(power.get(sorted[0]!.id)! - power.get(sorted[sorted.length - 1]!.id)!);
    const strongestId = sorted[0]!.id;
    const weakestId = sorted[sorted.length - 1]!.id;
    for (let arr = 0; arr < 4; arr++) {
      const lineup = shuffle(teams);
      let state = createTournament(
        lineup.map((t) => ({ id: t.id, nickname: t.nickname, squad: t.squad })),
        size,
      );
      const byId = new Map(lineup.map((t) => [t.id, t.team]));
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
          ...(SENS !== undefined ? { strengthSensitivity: SENS } : {}),
          ...(BASE_CONV !== undefined ? { baseConversion: BASE_CONV } : {}),
        });
        st.matches++;
        st.goals90 += r.events.filter((e) => e.type === 'goal' && e.minute <= 90).length;
        if (r.extraTime) st.extraTime++;
        if (r.penaltiesHome != null) st.penalties++;
        const ph = power.get(m.homeId)!,
          pa = power.get(m.awayId)!;
        const gap = Math.round(Math.abs(ph - pa));
        const strongWon = r.winnerId === (ph >= pa ? m.homeId : m.awayId);
        const g = st.gapWins.get(gap) ?? { n: 0, w: 0 };
        g.n++;
        if (strongWon) g.w++;
        st.gapWins.set(gap, g);
        state = advanceTournament(state, r);
      }
      st.tournaments++;
      if (state.championId === strongestId) st.strongestChamp++;
      if (state.championId === weakestId) st.weakestChamp++;
    }
  }
  return st;
}

const pct = (x: number, n: number) => `%${((100 * x) / n).toFixed(1)}`;
const q = (arr: number[], p: number) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
};

console.log(
  `ayar: sens ${SENS ?? 'varsayılan'} · baseConv ${BASE_CONV ?? 'varsayılan'} · ${DRAFTS} draft × 4 bracket`,
);
for (const size of [4, 8] as TournamentSize[]) {
  const t0 = Date.now();
  const st = measure(size, size === 8 ? Math.max(200, Math.floor(DRAFTS / 3)) : DRAFTS);
  const avgGap = st.gaps.reduce((a, b) => a + b, 0) / st.gaps.length;
  console.log(
    `\n== ${size} takım (${st.tournaments} turnuva, ${st.matches} maç, ${Math.round((Date.now() - t0) / 1000)} sn)`,
  );
  console.log(
    `en güçlü şampiyon ${pct(st.strongestChamp, st.tournaments)} · en zayıf ${pct(st.weakestChamp, st.tournaments)} · oran ${(st.strongestChamp / Math.max(1, st.weakestChamp)).toFixed(1)}x (rastgele olsa %${(100 / size).toFixed(1)})`,
  );
  console.log(
    `gol/maç (90 dk) ${(st.goals90 / st.matches).toFixed(2)} · uzatmaya giden ${pct(st.extraTime, st.matches)} · penaltıya giden ${pct(st.penalties, st.matches)}`,
  );
  console.log(
    `draft güç farkı (en iyi−en kötü): ort ${avgGap.toFixed(2)} · medyan ${q(st.gaps, 0.5).toFixed(1)} · p90 ${q(st.gaps, 0.9).toFixed(1)} · harcama ort ${(st.spend / st.teams).toFixed(1)}M · eksik kadro ${st.incomplete}`,
  );
  const rows = [...st.gapWins.entries()]
    .filter(([g]) => g >= 1 && g <= 9)
    .sort((a, b) => a[0] - b[0]);
  console.log(
    'güçlü tur geçer: ' + rows.map(([g, v]) => `${g}p ${pct(v.w, v.n)} (n=${v.n})`).join(' · '),
  );
}
