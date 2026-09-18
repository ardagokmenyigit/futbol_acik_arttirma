import { create } from 'zustand';
import type {
  LeagueState,
  MatchResult,
  Participant,
  RoomState,
  ShootoutState,
  TournamentState,
} from '@fal/shared';

/** Canlı oynatılan turnuva maçı (sunucu `tournament:matchLive` ile bildirir). */
export interface LiveMatch {
  matchId: string;
  result: MatchResult;
  /** Sunucuda geçen süre (ms) — yeniden bağlanınca dakika buradan türer. */
  elapsedMs?: number;
  /** Payload'ın istemciye ulaştığı an (yerel saat) — geçen süre buna eklenir. */
  receivedAt?: number;
}

/** Bu turdaki son açılış pası (Draft ekranındaki duyuru için). */
export interface PassInfo {
  passerNickname: string;
  nextOpenerNickname: string;
}

/** Son biten round'un özeti (Draft ekranındaki kısa bildirim için). */
export interface WonInfo {
  round: number;
  footballerName: string;
  winnerNickname: string | null;
  amount: number;
}

interface RoomStoreState {
  connected: boolean;
  roomState: RoomState | null;
  /** Bu istemcinin katılımcı kimliği. */
  youId: string | null;
  error: string | null;
  /** Oda dışında gösterilecek bilgi (örn. "rövanş sensiz başladı"). */
  notice: string | null;

  /** auction:tick'ten gelen, sunucu-otoriteli kalan süre. */
  remainingMs: number;
  lastWon: WonInfo | null;
  /** Tur içinde açılış pas geçildiyse dolu; yeni turda temizlenir. */
  lastPass: PassInfo | null;

  /** Lig durumu — league:* eventleriyle akışta güncellenir. */
  league: LeagueState | null;
  /** Turnuva ağacı — tournament:* eventleriyle akışta güncellenir. */
  tournament: TournamentState | null;
  /** Şu an canlı oynatılan maç (yoksa null). */
  liveMatch: LiveMatch | null;
  /**
   * Canlı seri penaltı durumu (sunucu `tournament:shootoutPrompt/Kick` ve
   * `room:state.shootout` ile günceller; seri bitip sonuç işlenince null).
   */
  shootout: ShootoutState | null;

  setConnected: (connected: boolean) => void;
  enterRoom: (roomState: RoomState, youId: string) => void;
  updateRoom: (roomState: RoomState) => void;
  /** Odadan çık; `notice` verilirse ana ekranda gösterilir. */
  exitRoom: (notice?: string) => void;
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;

  setRemainingMs: (ms: number) => void;
  roundStarted: (remainingMs: number) => void;
  setLastWon: (won: WonInfo) => void;
  setLastPass: (pass: PassInfo | null) => void;
  setLeague: (league: LeagueState) => void;
  setTournament: (tournament: TournamentState) => void;
  setLiveMatch: (liveMatch: LiveMatch | null) => void;
  setShootout: (shootout: ShootoutState | null) => void;
}

export const useRoomStore = create<RoomStoreState>((set) => ({
  connected: false,
  roomState: null,
  youId: null,
  error: null,
  notice: null,
  remainingMs: 0,
  lastWon: null,
  lastPass: null,
  league: null,
  tournament: null,
  liveMatch: null,
  shootout: null,

  setConnected: (connected) => set({ connected }),
  // Yeniden bağlanmada turnuva ve sürüyorsa seri penaltı durumu da odayla gelir.
  enterRoom: (roomState, youId) =>
    set({
      roomState,
      youId,
      error: null,
      notice: null,
      tournament: roomState.tournament ?? null,
      shootout: roomState.shootout ?? null,
    }),
  updateRoom: (roomState) =>
    set((s) => {
      // Oda lobiye döndüyse (rövanş) önceki oyunun turnuva/draft izleri silinsin;
      // yoksa yeni oyunun 'simulation' fazında bir an eski bracket görünür.
      if (roomState.phase === 'lobby' && s.roomState?.phase !== 'lobby') {
        return {
          roomState,
          tournament: null,
          liveMatch: null,
          shootout: null,
          lastWon: null,
          lastPass: null,
          league: null,
          remainingMs: 0,
          error: null,
        };
      }
      // Seri penaltı durumu oda durumuyla gelir (yeniden bağlanma dahil).
      return { roomState, shootout: roomState.shootout ?? null };
    }),
  exitRoom: (notice) =>
    set({
      roomState: null,
      youId: null,
      error: null,
      notice: notice ?? null,
      remainingMs: 0,
      lastWon: null,
      lastPass: null,
      league: null,
      tournament: null,
      liveMatch: null,
      shootout: null,
    }),
  setError: (error) => set({ error }),
  setNotice: (notice) => set({ notice }),

  setRemainingMs: (remainingMs) => set({ remainingMs }),
  roundStarted: (remainingMs) => set({ remainingMs, lastWon: null, lastPass: null }),
  setLastWon: (lastWon) => set({ lastWon }),
  setLastPass: (lastPass) => set({ lastPass }),
  setLeague: (league) => set({ league }),
  setTournament: (tournament) => set({ tournament }),
  setLiveMatch: (liveMatch) =>
    set({ liveMatch: liveMatch ? { ...liveMatch, receivedAt: Date.now() } : null }),
  setShootout: (shootout) => set({ shootout }),
}));

/** Store'dan türetilen "sen" katılımcısı. */
export function selectYou(state: RoomStoreState): Participant | null {
  if (!state.roomState || !state.youId) return null;
  return state.roomState.participants.find((p) => p.id === state.youId) ?? null;
}
