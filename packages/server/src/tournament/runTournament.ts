import type { TournamentState } from '@fal/shared';
import { roomStore } from '../rooms/roomStore.js';
import type { TypedServer } from '../socketTypes.js';
import {
  advanceTournament,
  createTournament,
  simulateFullTournament,
  type ParticipantTeamInfo,
} from './tournamentEngine.js';

/** Maçlar arası "canlı" akış aralığı — bracket'te tur tur ilerlesin. */
const MATCH_INTERVAL_MS = 1400;

const tournamentTimers = new Map<string, NodeJS.Timeout>();

/** Oda kapanınca / yarıda kalınca turnuva akış timer'ını temizle. */
export function cancelTournament(roomId: string): void {
  const t = tournamentTimers.get(roomId);
  if (t) {
    clearInterval(t);
    tournamentTimers.delete(roomId);
  }
}

/**
 * Draft bitince (phase === 'simulation') turnuva formatı seçiliyse çağrılır.
 * Ağacı kurar, tüm maçları simüle eder ve sonuçları tur tur yayınlar.
 * Bitince phase 'finished' olur.
 */
export function runTournament(io: TypedServer, roomId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room || room.phase !== 'simulation' || room.tournament) return;

  const size = room.config.tournamentSize;
  if (!size) return;

  const teams: ParticipantTeamInfo[] = room.participants.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    squad: p.squad,
    isBot: p.isBot ?? false,
  }));

  // Botlarla zaten `size` takıma tamamlanmış olmalı; yine de güvene al.
  if (teams.length < 2) {
    const empty = createTournament(teams, size);
    room.tournament = { ...empty, championId: teams[0]?.id ?? null, currentMatchId: null };
    room.phase = 'finished';
    io.to(roomId).emit('room:state', room);
    io.to(roomId).emit('tournament:finished', { tournament: room.tournament });
    return;
  }

  const { results } = simulateFullTournament(teams, size);

  // Ağacı hemen (sonuçsuz) yayınla — oyuncular eşleşmeleri görsün.
  let live: TournamentState = createTournament(teams, size);
  room.tournament = live;
  io.to(roomId).emit('room:state', room);
  io.to(roomId).emit('tournament:bracket', live);

  cancelTournament(roomId);
  let i = 0;
  const timer = setInterval(() => {
    const result = results[i];
    const current = roomStore.getRoom(roomId);
    if (!current) {
      cancelTournament(roomId);
      return;
    }

    if (!result) {
      cancelTournament(roomId);
      current.tournament = live;
      current.phase = 'finished';
      io.to(roomId).emit('room:state', current);
      io.to(roomId).emit('tournament:finished', { tournament: live });
      return;
    }

    live = advanceTournament(live, result);
    current.tournament = live;
    io.to(roomId).emit('tournament:matchResult', { result, tournament: live });
    io.to(roomId).emit('room:state', current);
    i += 1;
  }, MATCH_INTERVAL_MS);
  tournamentTimers.set(roomId, timer);
}
