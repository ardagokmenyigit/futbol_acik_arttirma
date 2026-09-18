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
 * Çıktı: konsola tek satır (Render'da log panelinde görünür) + JSONL dosyası
 * (`MATCH_LOG_FILE`, varsayılan `packages/server/data/match-log.jsonl`;
 * git'e girmez). Oyunculara hiçbir şey gönderilmez.
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
    mkdirSync(dirname(FILE), { recursive: true });
    appendFileSync(FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('[maç] log yazılamadı:', err);
  }
}
