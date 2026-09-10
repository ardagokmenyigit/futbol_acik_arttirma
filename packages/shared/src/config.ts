import type { RoomConfig } from './types.js';

/**
 * FAZ 0 TASLAĞI — varsayılan oda ayarları.
 * Değerler dengeleme sırasında değişebilir (CLAUDE.md §3.2).
 */
/**
 * Kadro 7 oyuncu (1-2-2-2). Draft `squadSize × katılımcı` TUR sürer
 * (4 oyuncu → 28 tur), her tur bir futbolcunun açık artırmasıdır.
 *
 * DRAFT HAVUZU TAM DENK: pozisyon başına tam olarak ihtiyaç kadar futbolcu
 * seçilir (4 oyuncu → 4 kaleci, 8 defans, 8 orta saha, 8 forvet). Arz talebe
 * denk olduğu için herkes tam kadroyla biter ve "beklersem ucuza kaparım"
 * bedava olmaktan çıkar — beklerken iyiler tükenir.
 *
 * TABAN FİYAT YOK. Açık artırma `minBidIncrement` ile açılır; fiyatı tamamen
 * rekabet belirler. Açılış teklifi ZORUNLUDUR, pas hakkı yoktur.
 *
 * SÜRELER: `turnDurationSec` açılış teklifi penceresi, `bidDurationSec`
 * sonrasındaki serbest teklif evresi. Serbest evrede son saniye teklifi
 * mümkün olduğu için anti-snipe geri geldi.
 */
export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  squad: { GK: 1, DEF: 2, MID: 2, FWD: 2 },
  squadSize: 7,
  startingBudget: 220,
  bidDurationSec: 15,
  turnDurationSec: 10,
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
