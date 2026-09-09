import type { RoomConfig } from './types.js';

/**
 * FAZ 0 TASLAĞI — varsayılan oda ayarları.
 * Değerler dengeleme sırasında değişebilir (CLAUDE.md §3.2).
 */
export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  squad: { GK: 2, DEF: 5, MID: 5, FWD: 3 },
  squadSize: 15,
  startingBudget: 100,
  bidDurationSec: 20,
  minBidIncrement: 1,
  minPlayers: 2,
  maxPlayers: 6,
};

/** Oda kodu karakter kümesi (karışması kolay 0/O/1/I çıkarıldı). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
