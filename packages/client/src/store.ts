import { create } from 'zustand';
import type { LeagueState, Participant, RoomState, TournamentState } from '@fal/shared';

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

  /** auction:tick'ten gelen, sunucu-otoriteli kalan süre. */
  remainingMs: number;
  lastWon: WonInfo | null;

  /** Lig durumu — league:* eventleriyle akışta güncellenir. */
  league: LeagueState | null;
  /** Turnuva ağacı — tournament:* eventleriyle akışta güncellenir. */
  tournament: TournamentState | null;

  setConnected: (connected: boolean) => void;
  enterRoom: (roomState: RoomState, youId: string) => void;
  updateRoom: (roomState: RoomState) => void;
  exitRoom: () => void;
  setError: (error: string | null) => void;

  setRemainingMs: (ms: number) => void;
  roundStarted: (remainingMs: number) => void;
  setLastWon: (won: WonInfo) => void;
  setLeague: (league: LeagueState) => void;
  setTournament: (tournament: TournamentState) => void;
}

export const useRoomStore = create<RoomStoreState>((set) => ({
  connected: false,
  roomState: null,
  youId: null,
  error: null,
  remainingMs: 0,
  lastWon: null,
  league: null,
  tournament: null,

  setConnected: (connected) => set({ connected }),
  enterRoom: (roomState, youId) => set({ roomState, youId, error: null }),
  updateRoom: (roomState) => set({ roomState }),
  exitRoom: () =>
    set({
      roomState: null,
      youId: null,
      remainingMs: 0,
      lastWon: null,
      league: null,
      tournament: null,
    }),
  setError: (error) => set({ error }),

  setRemainingMs: (remainingMs) => set({ remainingMs }),
  roundStarted: (remainingMs) => set({ remainingMs, lastWon: null }),
  setLastWon: (lastWon) => set({ lastWon }),
  setLeague: (league) => set({ league }),
  setTournament: (tournament) => set({ tournament }),
}));

/** Store'dan türetilen "sen" katılımcısı. */
export function selectYou(state: RoomStoreState): Participant | null {
  if (!state.roomState || !state.youId) return null;
  return state.roomState.participants.find((p) => p.id === state.youId) ?? null;
}
