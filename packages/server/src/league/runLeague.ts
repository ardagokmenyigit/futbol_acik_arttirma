import type { LeagueState, MatchResult } from '@fal/shared';
import { roomStore } from '../rooms/roomStore.js';
import type { TypedServer } from '../socketTypes.js';
import {
  createInitialStandings,
  simulateFullLeague,
  updateStandings,
  type ParticipantTeamInfo,
} from './leagueEngine.js';

/** Maçlar arası "canlı" akış aralığı. */
const MATCH_INTERVAL_MS = 900;
/** Açık artırma sonrası kadroların incelenmesi için başlangıç bekleme süresi. */
const SQUAD_REVIEW_DELAY_MS = 15000;

interface ActiveLeague {
  startTimer: NodeJS.Timeout | null;
  matchTimer: NodeJS.Timeout | null;
  startNow: () => void;
}

const activeLeagues = new Map<string, ActiveLeague>();

/** Oda kapanınca / yarıda kalınca lig akış timer'ını temizle. */
export function cancelLeague(roomId: string): void {
  const active = activeLeagues.get(roomId);
  if (active) {
    if (active.startTimer) clearTimeout(active.startTimer);
    if (active.matchTimer) clearInterval(active.matchTimer);
    activeLeagues.delete(roomId);
  }
}

/** Host "Simülasyonu Başlat" butonuna basarsa beklemeden hemen başlatır. */
export function startLeagueImmediately(roomId: string): void {
  const active = activeLeagues.get(roomId);
  if (active?.startTimer) {
    clearTimeout(active.startTimer);
    active.startTimer = null;
    active.startNow();
  }
}

/**
 * Draft bitince (phase === 'simulation') çağrılır: fikstürü üretir, tüm ligi
 * simüle eder ve sonuçları maç maç yayınlar. Bitince phase 'finished' olur.
 */
export function runLeague(io: TypedServer, roomId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room || room.phase !== 'simulation' || room.league) return;

  const participants: ParticipantTeamInfo[] = room.participants.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    squad: p.squad,
  }));

  // 2'den az takım kaldıysa lig oynanmaz — tek kalan şampiyon sayılır.
  if (participants.length < 2) {
    const league: LeagueState = {
      fixtures: [],
      results: [],
      standings: createInitialStandings(participants),
      championId: participants[0]?.id ?? null,
    };
    room.league = league;
    room.phase = 'finished';
    io.to(roomId).emit('room:state', room);
    io.to(roomId).emit('league:finished', { league });
    return;
  }

  const full = simulateFullLeague(participants);

  // Fikstürü hemen, sonuçları boş halde yayınla.
  let standings = createInitialStandings(participants);
  const revealed: MatchResult[] = [];
  io.to(roomId).emit('league:fixtures', {
    fixtures: full.fixtures,
    results: [],
    standings,
    championId: null,
  });

  cancelLeague(roomId);
  let i = 0;

  const startMatches = () => {
    const active = activeLeagues.get(roomId);
    if (active) active.startTimer = null;

    const timer = setInterval(() => {
      const result = full.results[i];
      if (!result) {
        cancelLeague(roomId);
        const current = roomStore.getRoom(roomId);
        if (!current) return;
        current.league = full;
        current.phase = 'finished';
        io.to(roomId).emit('room:state', current);
        io.to(roomId).emit('league:finished', { league: full });
        return;
      }
      revealed.push(result);
      standings = updateStandings(standings, result);
      io.to(roomId).emit('league:matchResult', {
        result,
        league: {
          fixtures: full.fixtures,
          results: [...revealed],
          standings,
          championId: null,
        },
      });
      i += 1;
    }, MATCH_INTERVAL_MS);

    const curr = activeLeagues.get(roomId);
    if (curr) curr.matchTimer = timer;
  };

  const startTimer = setTimeout(startMatches, SQUAD_REVIEW_DELAY_MS);
  activeLeagues.set(roomId, {
    startTimer,
    matchTimer: null,
    startNow: startMatches,
  });
}
