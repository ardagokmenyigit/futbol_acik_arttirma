/**
 * MAÇ LOGU İNCELEME — `server/tournament/matchLog.ts` kayıtlarını (JSONL)
 * okur; motorun BEKLENTİSİ ile GERÇEK sonuçları karşılaştırır.
 *
 *  - Maç listesi (yeniden eskiye): güç/hücum/savunma, beklenen gol, skor.
 *  - Güç farkı bandına göre: maç sayısı, güçlünün beklenen ve gerçek tur geçme
 *    oranı, beklenen ve gerçek gol (güçlü / zayıf), zayıfın 2+ gol attığı maç.
 *    Az örnekte gerçek oran beklentiden çok sapabilir; her bant için "bu
 *    kadar sapma tesadüfen olur mu" ölçüsü de basılır (iki taraflı binom
 *    p-değeri, normal yaklaşımı).
 *  - İnsan katılımcı başına: maç, ort. güç/hücum/savunma, G-B-M, beklenen
 *    vs gerçek galibiyet, atılan/yenilen gol.
 *
 * Kullanım:
 *   npx tsx packages/server/src/scripts/analyzeMatchLog.ts --remote   ← CANLI sunucu
 *       (özel depo ardagokmenyigit/futbol-match-log, `gh` CLI ile okunur;
 *        MATCH_LOG_GITHUB_REPO ile başka depo)
 *   npx tsx packages/server/src/scripts/analyzeMatchLog.ts [dosya]    ← yerel JSONL
 *       (varsayılan packages/server/data/match-log.jsonl)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { MatchLogEntry } from '../tournament/matchLog.js';

const REMOTE = process.argv.includes('--remote');
const REPO = process.env.MATCH_LOG_GITHUB_REPO ?? 'ardagokmenyigit/futbol-match-log';
const PREFIX = process.env.MATCH_LOG_GITHUB_PREFIX ?? 'match-log';
const FILE =
  process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) ??
  fileURLToPath(new URL('../../data/match-log.jsonl', import.meta.url));

function readRemote(): string {
  const list = JSON.parse(
    execFileSync('gh', ['api', `repos/${REPO}/contents`], { encoding: 'utf8' }),
  ) as { name: string }[];
  const files = list
    .map((f) => f.name)
    .filter((n) => n.startsWith(`${PREFIX}-`) && n.endsWith('.jsonl'))
    .sort();
  return files
    .map((n) =>
      execFileSync(
        'gh',
        ['api', '-H', 'Accept: application/vnd.github.raw', `repos/${REPO}/contents/${n}`],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      ),
    )
    .join('\n');
}

let raw: string;
if (REMOTE) {
  raw = readRemote();
} else {
  if (!existsSync(FILE)) {
    console.log(`Log yok: ${FILE} — önce birkaç turnuva oynanmalı.`);
    process.exit(0);
  }
  raw = readFileSync(FILE, 'utf8');
}
const entries: MatchLogEntry[] = raw
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as MatchLogEntry);
const SOURCE = REMOTE ? `${REPO} (canlı)` : FILE;

const pct = (x: number) => `%${Math.round(x * 100)}`;
const f1 = (x: number) => x.toFixed(1);

/** İki taraflı binom p-değeri (normal yaklaşımı) — küçük n'de kaba. */
function binomP(k: number, n: number, p: number): number {
  if (n === 0) return 1;
  const mean = n * p;
  const sd = Math.sqrt(n * p * (1 - p));
  if (sd === 0) return k === mean ? 1 : 0;
  const z = Math.abs(k - mean) / sd;
  const erf = (x: number) => {
    const t = 1 / (1 + 0.3275911 * x);
    const y =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
        t *
        Math.exp(-x * x);
    return y;
  };
  return Math.max(0, Math.min(1, 1 - erf(z / Math.SQRT2)));
}

console.log(`${entries.length} maç — ${SOURCE}\n`);
console.log('=== MAÇLAR (yeniden eskiye)');
for (const e of [...entries].reverse().slice(0, 40)) {
  const tag = (t: MatchLogEntry['home']) =>
    `${t.nickname}${t.isBot ? '(bot)' : ''} ${t.power} (H${t.attack}/S${t.defense})`;
  const how = e.penalties
    ? `pen ${e.penalties.home}-${e.penalties.away}`
    : e.extraTime
      ? 'u.s.'
      : "90'";
  const win = e.winnerId === e.home.id ? e.home.nickname : e.away.nickname;
  console.log(
    `${e.at.slice(5, 16).replace('T', ' ')} ${e.roomCode} ${e.matchId.padEnd(7)} ${tag(e.home)} vs ${tag(e.away)} · beklenen ${f1(e.expected.homeGoals)}–${f1(e.expected.awayGoals)} (ev %${Math.round(e.expected.homeAdvances * 100)}) · skor ${e.scoreHome}-${e.scoreAway} ${how} · ${win}`,
  );
}

console.log('\n=== GÜÇ FARKI BANDINA GÖRE (beklenen → gerçek)');
type B = {
  n: number;
  expWin: number;
  actWin: number;
  expSG: number;
  actSG: number;
  expWG: number;
  actWG: number;
  weak2: number;
};
const bands = new Map<string, B>();
const bandOf = (d: number) =>
  d <= 0.5 ? '0' : d <= 2.5 ? '1–2' : d <= 4.5 ? '3–4' : d <= 6.5 ? '5–6' : '7+';
for (const e of entries) {
  const homeStrong = e.home.power >= e.away.power;
  const d = Math.abs(e.home.power - e.away.power);
  const key = bandOf(d);
  const b = bands.get(key) ?? {
    n: 0,
    expWin: 0,
    actWin: 0,
    expSG: 0,
    actSG: 0,
    expWG: 0,
    actWG: 0,
    weak2: 0,
  };
  b.n++;
  b.expWin += homeStrong ? e.expected.homeAdvances : 1 - e.expected.homeAdvances;
  b.actWin += e.winnerId === (homeStrong ? e.home.id : e.away.id) ? 1 : 0;
  b.expSG += homeStrong ? e.expected.homeGoals : e.expected.awayGoals;
  b.expWG += homeStrong ? e.expected.awayGoals : e.expected.homeGoals;
  const sg = homeStrong ? e.score90Home : e.score90Away;
  const wg = homeStrong ? e.score90Away : e.score90Home;
  b.actSG += sg;
  b.actWG += wg;
  if (wg >= 2) b.weak2++;
  bands.set(key, b);
}
console.log(
  'bant  | maç | güçlü tur geçer: beklenen → gerçek | güçlü gol: bekl → gerçek | zayıf gol: bekl → gerçek | zayıf 2+ gol | sapma tesadüf p',
);
for (const key of ['0', '1–2', '3–4', '5–6', '7+']) {
  const b = bands.get(key);
  if (!b) continue;
  const p = binomP(b.actWin, b.n, b.expWin / b.n);
  console.log(
    `${key.padEnd(5)} | ${String(b.n).padStart(3)} | ${pct(b.expWin / b.n).padStart(4)} → ${pct(b.actWin / b.n).padStart(4)} (${b.actWin}/${b.n})`.padEnd(
      48,
    ) +
      ` | ${f1(b.expSG / b.n)} → ${f1(b.actSG / b.n)}`.padEnd(26) +
      ` | ${f1(b.expWG / b.n)} → ${f1(b.actWG / b.n)}`.padEnd(26) +
      ` | ${pct(b.weak2 / b.n).padStart(4)}` +
      ` | ${p.toFixed(2)}${b.n < 10 ? ' (az örnek)' : ''}`,
  );
}

console.log('\n=== İNSAN KATILIMCILAR');
type P = {
  n: number;
  power: number;
  att: number;
  def: number;
  w: number;
  d: number;
  l: number;
  expWin: number;
  gf: number;
  ga: number;
  expGf: number;
  expGa: number;
};
const people = new Map<string, P>();
for (const e of entries) {
  for (const side of ['home', 'away'] as const) {
    const t = e[side];
    if (t.isBot) continue;
    const p = people.get(t.nickname) ?? {
      n: 0,
      power: 0,
      att: 0,
      def: 0,
      w: 0,
      d: 0,
      l: 0,
      expWin: 0,
      gf: 0,
      ga: 0,
      expGf: 0,
      expGa: 0,
    };
    p.n++;
    p.power += t.power;
    p.att += t.attack;
    p.def += t.defense;
    const g90f = side === 'home' ? e.score90Home : e.score90Away;
    const g90a = side === 'home' ? e.score90Away : e.score90Home;
    if (g90f > g90a) p.w++;
    else if (g90f === g90a) p.d++;
    else p.l++;
    p.expWin += side === 'home' ? e.expected.homeAdvances : 1 - e.expected.homeAdvances;
    p.gf += side === 'home' ? e.scoreHome : e.scoreAway;
    p.ga += side === 'home' ? e.scoreAway : e.scoreHome;
    p.expGf += side === 'home' ? e.expected.homeGoals : e.expected.awayGoals;
    p.expGa += side === 'home' ? e.expected.awayGoals : e.expected.homeGoals;
    people.set(t.nickname, p);
  }
}
for (const [name, p] of people) {
  const adv = entries.filter(
    (e) =>
      (e.home.nickname === name && !e.home.isBot && e.winnerId === e.home.id) ||
      (e.away.nickname === name && !e.away.isBot && e.winnerId === e.away.id),
  ).length;
  console.log(
    `${name.padEnd(16)} ${p.n} maç · güç ${f1(p.power / p.n)} (H${f1(p.att / p.n)}/S${f1(p.def / p.n)}) · 90'da G-B-M ${p.w}-${p.d}-${p.l} · tur geçti ${adv}/${p.n} (beklenen ${f1(p.expWin)}) · gol ${p.gf}-${p.ga} (beklenen ${f1(p.expGf)}-${f1(p.expGa)})`,
  );
}
