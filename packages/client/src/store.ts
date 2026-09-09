import { create } from 'zustand';
import type { Participant, RoomState } from '@fal/shared';

interface RoomStoreState {
  connected: boolean;
  roomState: RoomState | null;
  /** Bu istemcinin katılımcı kimliği. */
  youId: string | null;
  error: string | null;

  setConnected: (connected: boolean) => void;
  enterRoom: (roomState: RoomState, youId: string) => void;
  updateRoom: (roomState: RoomState) => void;
  exitRoom: () => void;
  setError: (error: string | null) => void;
}

export const useRoomStore = create<RoomStoreState>((set) => ({
  connected: false,
  roomState: null,
  youId: null,
  error: null,

  setConnected: (connected) => set({ connected }),
  enterRoom: (roomState, youId) => set({ roomState, youId, error: null }),
  updateRoom: (roomState) => set({ roomState }),
  exitRoom: () => set({ roomState: null, youId: null }),
  setError: (error) => set({ error }),
}));

/** Store'dan türetilen "sen" katılımcısı. */
export function selectYou(state: RoomStoreState): Participant | null {
  if (!state.roomState || !state.youId) return null;
  return state.roomState.participants.find((p) => p.id === state.youId) ?? null;
}
