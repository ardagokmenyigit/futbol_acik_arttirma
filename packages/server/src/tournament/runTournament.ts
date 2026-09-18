import type { MatchResult, TournamentMatch, TournamentState } from '@fal/shared';
import { roomStore } from '../rooms/roomStore.js';
import { emitRoomState } from '../rooms/broadcast.js';
import { createPRNG } from '../simulation/random.js';
import { simulateMatch } from '../simulation/simulator.js';
import { buildTeam } from '../simulation/teamStats.js';
import type { TypedServer, TypedSocket } from '../socketTypes.js';
import { cancelShootout, startInteractiveShootout } from './shootout.js';
import {
  advanceTournament,
  createTournament,
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
/** Uzatmaya giden maçta 30 dakikanın (91–120) canlı oynanma payı (30 × 140 ms + pay). */
const EXTRA_TIME_LIVE_MS = 4600;
/** Canlı maç bittikten sonra sonraki maça geçmeden önceki kısa nefes. */
const POST_LIVE_GAP_MS = 1200;
/** Seri penaltı bitince (son vuruş açıklandıktan sonra) kazanan banner'ının kalma payı. */
const POST_SHOOTOUT_GAP_MS = 3000;
/** Açık artırma sonrası kadroların incelenmesi için başlangıç bekleme süresi. */
const SQUAD_REVIEW_DELAY_MS = 15000;
/**
 * YALNIZ TEST: `FAL_FORCE_SHOOTOUT=1` ile insanlı her maç için uzatma sonu
 * beraberlik veren bir tohum aranır (motor değişmez, sadece tohum kayar).
 * Canlı seriyi uçtan uca koşan `scripts/e2eShootout.ts` kullanır.
 */
const FORCE_SHOOTOUT = process.env.FAL_FORCE_SHOOTOUT === '1';

interface ActiveTournament {
  startTimer: NodeJS.Timeout | null;
  matchTimer: NodeJS.Timeout | null;
  startNow: () => void;
  /** Şu an canlı oynatılan insanlı maç — yeniden bağlanana tekrar gönderilir. */
  liveMatch: { matchId: string; result: MatchResult; startedAt: number } | null;
}

const activeTournaments = new Map<string, ActiveTournament>();

/** Oda kapanınca / yarıda kalınca turnuva akış timer'ını temizle. */
export function cancelTournament(roomId: string): void {
  cancelShootout(roomId);
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
 * Yeniden bağlanan oyuncuya, sürüyorsa canlı maçı tekrar gönder. Seri
 * penaltı oynanıyorsa `room.shootout` zaten `room:state` ile gelir; istemci
 * ticker'ı doğrudan seriden başlatır.
 */
export function resendLiveMatch(socket: TypedSocket, roomId: string): void {
  const active = activeTournaments.get(roomId);
  if (active?.liveMatch) socket.emit('tournament:matchLive', active.liveMatch);
}

/**
 * Fisher-Yates — tohumla belirlenir, böylece kura tekrar üretilebilir kalır.
 * Dizi kopyalanır; `room.participants` sırası bozulmaz (açık artırma sıra
 * düzeni ve yeniden bağlanma ona bağlı).
 */
function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const prng = createPRNG(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function findMatch(state: TournamentState, matchId: string): TournamentMatch | null {
  for (const round of state.rounds) {
    const m = round.matches.find((x) => x.matchId === matchId);
    if (m) return m;
  }
  return null;
}

/**
 * Draft bitince (phase === 'simulation') çağrılır. Kurayı çeker, ağacı kurar
 * ve maçları SIRAYLA simüle edip yayınlar. Bitince phase 'finished' olur.
 *
 * MAÇLAR TEMBEL SİMÜLE EDİLİR (eskiden hepsi baştan hesaplanıyordu): insanlı
 * bir maç uzatma sonunda berabere kalırsa seri penaltı canlı oynanır
 * (`shootout.ts`) ve sonraki eşleşme ancak o bitince belli olur. Tohumlar
 * `simulateFullTournament` ile aynı şemadadır (`drawSeed + n·777`); botların
 * kendi aralarındaki maçlar ve normal süre tamamen deterministiktir, yalnız
 * canlı seride insan seçimleri sonucu etkiler.
 */
export function runTournament(io: TypedServer, roomId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room || room.phase !== 'simulation' || room.tournament) return;

  const size = room.config.tournamentSize;
  if (!size) return;

  const roster: ParticipantTeamInfo[] = room.participants.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    squad: p.squad,
    isBot: p.isBot ?? false,
  }));

  /**
   * BRACKET KURASI. `createTournament` eşleşmeleri dizi sırasına göre kurar
   * (yarı final 1 = teams[0] vs teams[1]). Katılımcı sırası da odaya giriş
   * sırası olduğu için, karıştırılmazsa AYNI GRUP HER TURNUVADA AYNI RAKİPLE
   * eşleşir — aynı iki kişi hep finalde karşılaşır, kimse diğer rakipleri
   * hiç görmez. (Oyuncu bildirdi, ölçümle doğrulandı.)
   *
   * Kura her turnuvada yeniden çekilir ve maç tohumlarıyla AYNI `drawSeed`'ten
   * türetilir; yani turnuvanın tamamı tek bir tohumdan tekrar üretilebilir
   * (CLAUDE.md §3.2).
   */
  const drawSeed = Math.floor(Math.random() * 1000000000);
  const teams = shuffleWithSeed(roster, drawSeed);
  const teamMap = new Map<string, ParticipantTeamInfo>();
  teams.forEach((t) => teamMap.set(t.id, t));

  // Botlarla zaten `size` takıma tamamlanmış olmalı; yine de güvene al.
  if (teams.length < 2) {
    const empty = createTournament(teams, size);
    room.tournament = { ...empty, championId: teams[0]?.id ?? null, currentMatchId: null };
    room.phase = 'finished';
    emitRoomState(io, room);
    io.to(roomId).emit('tournament:finished', { tournament: room.tournament });
    return;
  }

  // Ağacı hemen (sonuçsuz) yayınla — oyuncular eşleşmeleri ve kadroları görsün.
  let live: TournamentState = createTournament(teams, size);
  room.tournament = live;
  emitRoomState(io, room);
  io.to(roomId).emit('tournament:bracket', live);

  cancelTournament(roomId);

  /** Maçın iki tarafından biri bile insan mı? (bot–bot ise canlı oynatma yok) */
  const involvesHuman = (homeId: string, awayId: string): boolean => {
    const current = roomStore.getRoom(roomId);
    if (!current) return false;
    for (const id of [homeId, awayId]) {
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

  const setLive = (value: ActiveTournament['liveMatch']): void => {
    const active = activeTournaments.get(roomId);
    if (active) active.liveMatch = value;
  };

  const teamFor = (id: string, fallbackName: string) => {
    const raw = teamMap.get(id);
    return raw
      ? buildTeam(raw)
      : { participantId: id, nickname: fallbackName, players: [], attack: 78, defense: 78 };
  };

  let seedCount = 1;

  const playNext = (): void => {
    const active = activeTournaments.get(roomId);
    if (active) active.matchTimer = null;

    const current = roomStore.getRoom(roomId);
    if (!current) {
      cancelTournament(roomId);
      return;
    }

    const matchId = live.currentMatchId;
    const match = matchId ? findMatch(live, matchId) : null;
    if (!match || !match.homeId || !match.awayId) {
      // Oynanacak maç kalmadı — turnuva bitti.
      cancelTournament(roomId);
      current.tournament = live;
      current.phase = 'finished';
      emitRoomState(io, current);
      io.to(roomId).emit('tournament:finished', { tournament: live });
      return;
    }

    const homeId = match.homeId;
    const awayId = match.awayId;
    const human = involvesHuman(homeId, awayId);
    const seed = drawSeed + seedCount * 777;
    seedCount++;

    const homeTeam = teamFor(homeId, 'Takım 1');
    const awayTeam = teamFor(awayId, 'Takım 2');
    const simulate = (s: number): MatchResult =>
      simulateMatch({
        matchId: match.matchId,
        homeTeam,
        awayTeam,
        seed: s,
        isTournament: true,
        interactiveShootout: human,
      });
    let result = simulate(seed);
    if (FORCE_SHOOTOUT && human) {
      for (let i = 1; i <= 400 && !result.pendingShootout; i++) result = simulate(seed + i);
    }

    // Sonucu ağaca işle + yayınla, sonra sıradaki maça geç.
    const finalize = (finalResult: MatchResult, gapMs: number): void => {
      const room2 = roomStore.getRoom(roomId);
      if (!room2) {
        cancelTournament(roomId);
        return;
      }
      setLive(null);
      live = advanceTournament(live, finalResult);
      room2.tournament = live;
      io.to(roomId).emit('tournament:matchResult', { result: finalResult, tournament: live });
      emitRoomState(io, room2);
      schedule(playNext, gapMs);
    };

    if (!human) {
      finalize(result, BOT_MATCH_MS);
      return;
    }

    // `live.currentMatchId` bu maçı gösteriyor; istemci LiveMatchTicker açar.
    const livePayload = { matchId: result.matchId, result, startedAt: Date.now() };
    setLive(livePayload);
    io.to(roomId).emit('tournament:matchLive', livePayload);
    const extraTimeDelay = result.extraTime ? EXTRA_TIME_LIVE_MS : 0;

    if (!result.pendingShootout) {
      schedule(() => finalize(result, POST_LIVE_GAP_MS), LIVE_MATCH_MS + extraTimeDelay);
      return;
    }

    // Uzatma da berabere: istemci 120. dakikaya gelince canlı seri başlar.
    schedule(() => {
      const room3 = roomStore.getRoom(roomId);
      if (!room3) {
        cancelTournament(roomId);
        return;
      }
      startInteractiveShootout(io, roomId, {
        matchId: result.matchId,
        home: { id: homeId, nickname: homeTeam.nickname, players: homeTeam.players },
        away: { id: awayId, nickname: awayTeam.nickname, players: awayTeam.players },
        seed: seed + 13,
        onDone: (progress) => {
          const { pendingShootout: _pending, ...base } = result;
          void _pending;
          const finalResult: MatchResult = {
            ...base,
            penaltiesHome: progress.penaltiesHome,
            penaltiesAway: progress.penaltiesAway,
            penaltyShootout: progress.attempts,
            winnerId: progress.winnerId ?? awayId,
          };
          // Kazanan banner'ı bir süre kalsın, sonra ağaca işle.
          schedule(() => finalize(finalResult, POST_LIVE_GAP_MS), POST_SHOOTOUT_GAP_MS);
        },
      });
    }, LIVE_MATCH_MS + extraTimeDelay);
  };

  const startMatches = (): void => {
    const active = activeTournaments.get(roomId);
    if (active) active.startTimer = null;
    playNext();
  };

  const startTimer = setTimeout(startMatches, SQUAD_REVIEW_DELAY_MS);
  activeTournaments.set(roomId, {
    startTimer,
    matchTimer: null,
    startNow: startMatches,
    liveMatch: null,
  });
}
