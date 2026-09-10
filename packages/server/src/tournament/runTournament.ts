import type { TournamentState } from '@fal/shared';
import { roomStore } from '../rooms/roomStore.js';
import { emitRoomState } from '../rooms/broadcast.js';
import type { TypedServer } from '../socketTypes.js';
import {
  advanceTournament,
  createTournament,
  simulateFullTournament,
  type ParticipantTeamInfo,
} from './tournamentEngine.js';

/** Bot–bot maçları arası bekleme — bracket'te tur tur ilerlesin. */
const BOT_MATCH_MS = 900;
/**
 * İnsan içeren maçın CANLI oynanma süresi. İstemcideki LiveMatchTicker 90
 * dakikayı `speedMs` ile oynatır; bu değer o animasyon + kısa maç sonu
 * gösterimi için yeterli olmalı (istemci speedMs ≈ 140 → ~12.6 sn animasyon).
 */
const LIVE_MATCH_MS = 14000;
/** Canlı maç bittikten sonra sonraki maça geçmeden önceki kısa nefes. */
const POST_LIVE_GAP_MS = 1200;
/** Açık artırma sonrası kadroların incelenmesi için başlangıç bekleme süresi. */
const SQUAD_REVIEW_DELAY_MS = 15000;

interface ActiveTournament {
  startTimer: NodeJS.Timeout | null;
  matchTimer: NodeJS.Timeout | null;
  startNow: () => void;
}

const activeTournaments = new Map<string, ActiveTournament>();

/** Oda kapanınca / yarıda kalınca turnuva akış timer'ını temizle. */
export function cancelTournament(roomId: string): void {
  const active = activeTournaments.get(roomId);
  if (active) {
    if (active.startTimer) clearTimeout(active.startTimer);
    if (active.matchTimer) clearTimeout(active.matchTimer);
    activeTournaments.delete(roomId);
  }
}

/** Host "Simülasyonu Başlat" butonuna basarsa beklemeden hemen başlatır. */
export function startTournamentImmediately(roomId: string): void {
  const active = activeTournaments.get(roomId);
  if (active?.startTimer) {
    clearTimeout(active.startTimer);
    active.startTimer = null;
    active.startNow();
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
    emitRoomState(io, room);
    io.to(roomId).emit('tournament:finished', { tournament: room.tournament });
    return;
  }

  const randomSeed = Math.floor(Math.random() * 1000000000);
  const { results } = simulateFullTournament(teams, size, randomSeed);

  // Ağacı hemen (sonuçsuz) yayınla — oyuncular eşleşmeleri ve kadroları görsün.
  let live: TournamentState = createTournament(teams, size);
  room.tournament = live;
  emitRoomState(io, room);
  io.to(roomId).emit('tournament:bracket', live);

  cancelTournament(roomId);

  /** Maçın iki tarafından biri bile insan mı? (bot–bot ise canlı oynatma yok) */
  const involvesHuman = (result: (typeof results)[number]): boolean => {
    const current = roomStore.getRoom(roomId);
    if (!current) return false;
    for (const id of [result.homeId, result.awayId]) {
      const p = current.participants.find((x) => x.id === id);
      if (p && !p.isBot) return true;
    }
    return false;
  };

  /** Sonraki timer'ı ActiveTournament'a kaydederek kur (iptal edilebilsin). */
  const schedule = (fn: () => void, ms: number): void => {
    const active = activeTournaments.get(roomId);
    const timer = setTimeout(fn, ms);
    if (active) active.matchTimer = timer;
  };

  const playNext = (i: number): void => {
    const active = activeTournaments.get(roomId);
    if (active) active.matchTimer = null;

    const current = roomStore.getRoom(roomId);
    if (!current) {
      cancelTournament(roomId);
      return;
    }

    const result = results[i];
    if (!result) {
      cancelTournament(roomId);
      current.tournament = live;
      current.phase = 'finished';
      emitRoomState(io, current);
      io.to(roomId).emit('tournament:finished', { tournament: live });
      return;
    }

    const human = involvesHuman(result);

    // Sonucu ağaca işle + yayınla, sonra sıradaki maça geç.
    const finalize = (): void => {
      const room2 = roomStore.getRoom(roomId);
      if (!room2) {
        cancelTournament(roomId);
        return;
      }
      live = advanceTournament(live, result);
      room2.tournament = live;
      io.to(roomId).emit('tournament:matchResult', { result, tournament: live });
      emitRoomState(io, room2);
      schedule(() => playNext(i + 1), human ? POST_LIVE_GAP_MS : BOT_MATCH_MS);
    };

    if (human) {
      // `live.currentMatchId` bu maçı gösteriyor; istemci LiveMatchTicker açar.
      io.to(roomId).emit('tournament:matchLive', { matchId: result.matchId, result });
      const penaltyCount = result.penaltyShootout?.length ?? 0;
      const penaltyDelay = penaltyCount > 0 ? penaltyCount * 3000 + 3500 : 0;
      schedule(finalize, LIVE_MATCH_MS + penaltyDelay);
    } else {
      finalize();
    }
  };

  const startMatches = (): void => {
    const active = activeTournaments.get(roomId);
    if (active) active.startTimer = null;
    playNext(0);
  };

  const startTimer = setTimeout(startMatches, SQUAD_REVIEW_DELAY_MS);
  activeTournaments.set(roomId, {
    startTimer,
    matchTimer: null,
    startNow: startMatches,
  });
}
