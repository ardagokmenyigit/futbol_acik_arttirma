import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateTeamStats,
  expectMatch,
  type MatchResult,
  type RoomState,
  type Team,
} from '@fal/shared';

/**
 * MAÇ LOGU — yalnız geliştiriciye görünür denge denetimi (18 Eylül 2026).
 *
 * Oyuncu "3–4 puan güçlüyken çok yeniliyorum, motordan şüpheliyim" dedi.
 * Tartışmak yerine gerçek maçlar kaydedilir: iki takımın güç / hücum /
 * savunması, motorun BEKLENTİSİ (300 tohumla beklenen gol ve kazanma
 * olasılığı) ve gerçek sonuç. Belli bir kullanımdan sonra
 * `scripts/analyzeMatchLog.ts` beklenen ile gerçeği bant bant karşılaştırır.
 *
 * Çıktı: konsola tek satır (Render'da log panelinde görünür) + yerel JSONL
 * (`MATCH_LOG_FILE`, varsayılan `packages/server/data/match-log.jsonl`; git'e
 * girmez) + **GitHub deposu** (`MATCH_LOG_GITHUB_TOKEN` verilmişse): Render
 * ücretsiz planda dosya sistemi her uykuda sıfırlanır, oyun da canlıda
 * oynanır — kalıcı ve yalnız bize görünür yer, özel depo
 * `ardagokmenyigit/futbol-match-log` (ücretsiz). Aylık dosya
 * (`match-log-2026-09.jsonl`, Contents API'nin 1 MB sınırının altında kalır),
 * yazmalar sıralı kuyrukta, çakışmada (409/422) yeniden okuyup dener; hata
 * oyunu asla etkilemez. Okuma: `scripts/analyzeMatchLog.ts --remote`.
 * Oyunculara hiçbir şey gönderilmez.
 */
export interface MatchLogEntry {
  at: string;
  roomCode: string;
  gameNumber: number;
  matchId: string;
  tournamentSize: number;
  home: TeamSnapshot;
  away: TeamSnapshot;
  expected: {
    homeGoals: number;
    awayGoals: number;
    homeWin: number;
    draw: number;
    awayWin: number;
    homeAdvances: number;
  };
  scoreHome: number;
  scoreAway: number;
  /** 90 dakika golleri (uzatma hariç). */
  score90Home: number;
  score90Away: number;
  extraTime: boolean;
  penalties: { home: number; away: number } | null;
  winnerId: string | null;
}
interface TeamSnapshot {
  id: string;
  nickname: string;
  isBot: boolean;
  power: number;
  attack: number;
  defense: number;
}

const DEFAULT_FILE = fileURLToPath(new URL('../../data/match-log.jsonl', import.meta.url));
const FILE = process.env.MATCH_LOG_FILE ?? DEFAULT_FILE;

/* ------------------------- GitHub deposuna yazma ------------------------- */

const GH_TOKEN = process.env.MATCH_LOG_GITHUB_TOKEN;
const GH_REPO = process.env.MATCH_LOG_GITHUB_REPO ?? 'ardagokmenyigit/futbol-match-log';
const GH_PREFIX = process.env.MATCH_LOG_GITHUB_PREFIX ?? 'match-log';
const GH_API = 'https://api.github.com';

const pending: string[] = [];
let chain: Promise<void> = Promise.resolve();

function monthlyPath(): string {
  return `${GH_PREFIX}-${new Date().toISOString().slice(0, 7)}.jsonl`;
}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${GH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'fal-server-match-log',
      ...(init.headers ?? {}),
    },
  });
}

/** Dosyanın mevcut içeriği + sha (yoksa boş). 1 MB üstünde Contents içerik vermez → blob. */
async function readRemote(path: string): Promise<{ sha: string | null; text: string }> {
  const res = await gh(`/repos/${GH_REPO}/contents/${path}`);
  if (res.status === 404) return { sha: null, text: '' };
  if (!res.ok) throw new Error(`GitHub GET ${res.status}`);
  const body = (await res.json()) as { sha: string; content?: string; encoding?: string };
  if (body.content && body.encoding === 'base64') {
    return { sha: body.sha, text: Buffer.from(body.content, 'base64').toString('utf8') };
  }
  const blob = await gh(`/repos/${GH_REPO}/git/blobs/${body.sha}`);
  if (!blob.ok) throw new Error(`GitHub blob ${blob.status}`);
  const b = (await blob.json()) as { content: string };
  return { sha: body.sha, text: Buffer.from(b.content, 'base64').toString('utf8') };
}

async function flushRemote(): Promise<void> {
  if (pending.length === 0) return;
  const lines = pending.splice(0);
  const path = monthlyPath();
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { sha, text } = await readRemote(path);
      const next =
        (text.endsWith('\n') || text === '' ? text : text + '\n') + lines.join('\n') + '\n';
      const res = await gh(`/repos/${GH_REPO}/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: `maç logu: +${lines.length} (${new Date().toISOString()})`,
          content: Buffer.from(next, 'utf8').toString('base64'),
          ...(sha ? { sha } : {}),
        }),
      });
      if (res.ok) return;
      if (res.status === 409 || res.status === 422) continue; // eşzamanlı yazma — yeniden oku
      throw new Error(`GitHub PUT ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } catch (err) {
      if (attempt === 3) {
        console.error('[maç] GitHub logu yazılamadı (satırlar düştü):', err);
        return;
      }
    }
  }
}

function enqueueRemote(line: string): void {
  if (!GH_TOKEN) return;
  pending.push(line);
  chain = chain.then(flushRemote).catch(() => undefined);
}

function snapshot(room: RoomState, team: Team): TeamSnapshot {
  const p = room.participants.find((x) => x.id === team.participantId);
  const { attack, defense } = calculateTeamStats(team.players);
  return {
    id: team.participantId,
    nickname: p?.nickname ?? team.nickname,
    isBot: p?.isBot ?? false,
    power: Math.round((attack + defense) / 2),
    attack: Math.round(attack * 10) / 10,
    defense: Math.round(defense * 10) / 10,
  };
}

export function logMatch(
  room: RoomState,
  result: MatchResult,
  homeTeam: Team,
  awayTeam: Team,
): void {
  try {
    const exp = expectMatch(homeTeam, awayTeam);
    const g90 = (id: string) =>
      result.events.filter((e) => e.type === 'goal' && e.minute <= 90 && e.teamId === id).length;
    const entry: MatchLogEntry = {
      at: new Date().toISOString(),
      roomCode: room.code,
      gameNumber: room.gameNumber,
      matchId: result.matchId,
      tournamentSize: room.config.tournamentSize,
      home: snapshot(room, homeTeam),
      away: snapshot(room, awayTeam),
      expected: {
        homeGoals: +exp.homeGoals.toFixed(2),
        awayGoals: +exp.awayGoals.toFixed(2),
        homeWin: +exp.homeWin.toFixed(3),
        draw: +exp.draw.toFixed(3),
        awayWin: +exp.awayWin.toFixed(3),
        homeAdvances: +exp.homeAdvances.toFixed(3),
      },
      scoreHome: result.scoreHome,
      scoreAway: result.scoreAway,
      score90Home: g90(homeTeam.participantId),
      score90Away: g90(awayTeam.participantId),
      extraTime: result.extraTime ?? false,
      penalties:
        result.penaltiesHome != null && result.penaltiesAway != null
          ? { home: result.penaltiesHome, away: result.penaltiesAway }
          : null,
      winnerId: result.winnerId ?? null,
    };
    const h = entry.home;
    const a = entry.away;
    const tag = (t: TeamSnapshot) =>
      `${t.nickname}${t.isBot ? '(bot)' : ''} güç ${t.power} (H${t.attack}/S${t.defense})`;
    const how = entry.penalties
      ? ` · pen ${entry.penalties.home}-${entry.penalties.away}`
      : entry.extraTime
        ? ' · u.s.'
        : " · 90'";
    console.log(
      `[maç] ${room.code} ${result.matchId}: ${tag(h)} vs ${tag(a)} · beklenen ${exp.homeGoals.toFixed(1)}–${exp.awayGoals.toFixed(1)} ` +
        `(ev tur geçer %${Math.round(exp.homeAdvances * 100)}) · skor ${result.scoreHome}-${result.scoreAway}${how} · kazanan ${
          result.winnerId === h.id ? h.nickname : a.nickname
        }`,
    );
    const line = JSON.stringify(entry);
    mkdirSync(dirname(FILE), { recursive: true });
    appendFileSync(FILE, line + '\n');
    enqueueRemote(line);
  } catch (err) {
    console.error('[maç] log yazılamadı:', err);
  }
}
