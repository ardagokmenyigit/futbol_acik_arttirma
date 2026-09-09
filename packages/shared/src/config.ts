import type { RoomConfig } from './types.js';

/**
 * FAZ 0 TASLAĞI — varsayılan oda ayarları.
 * Değerler dengeleme sırasında değişebilir (CLAUDE.md §3.2).
 */
/**
 * Kadro 7 oyuncu (1-2-2-2). Havuzdaki taban fiyatlar 12-25M.
 *
 * BÜTÇE NEDEN 220M:
 * Kadronun zorunlu (en ucuz) maliyeti ~96M. Açık artırmanın canlı geçmesi
 * için bunun ÜSTÜNDE ciddi bir pay gerekir — teklif savaşı ancak o payla
 * yapılır. 140M denendiğinde artırma payı yalnız 44M kalıyordu (oyuncu
 * başına ~6M) ve bütün botlar aynı düşük tavana sıkışıp sönük teklif
 * veriyordu. 220M ile pay ~124M (oyuncu başına ~18M): yıldızlar için
 * gerçek rekabet oluşuyor.
 *
 * DİKKAT: startingBudget, kadronun en ucuz dolumundan (~96M) küçük olursa
 * kadrolar asla dolmaz ve draft havuz bitene kadar sürer.
 */
export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  squad: { GK: 1, DEF: 2, MID: 2, FWD: 2 },
  squadSize: 7,
  startingBudget: 220,
  bidDurationSec: 20,
  minBidIncrement: 1,
  minPlayers: 2,
  maxPlayers: 8,
  tournamentSize: null,
};

/** Bot takımlara verilen isimler (turnuva formatında eksik kadro doldurma). */
export const BOT_NICKNAMES = [
  'Kartal FK',
  'Boğaziçi United',
  'Anadolu SK',
  'Ege Fırtınası',
  'Toros Athletic',
  'Marmara City',
  'Kapadokya FC',
  'Karadeniz Real',
];

/** Oda kodu karakter kümesi (karışması kolay 0/O/1/I çıkarıldı). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
