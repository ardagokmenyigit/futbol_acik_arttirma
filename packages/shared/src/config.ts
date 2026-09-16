import type { RoomConfig, TournamentSize } from './types.js';

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
 * BÜTÇE 150M: Taban fiyat kalktığı için kadronun zorunlu (asgari) maliyeti
 * yalnızca 7 × `minBidIncrement` = 7M. Kalan ~143M tamamen açık artırmaya
 * gider (oyuncu başına ~20M pay) — eski 220M'de taban fiyatlar ~96M'yi
 * kilitlediği için serbest pay zaten ~124M'ydi; 150M o dönemin serbest
 * payından daha cömert, açık artırma sönmez. Bot mantığı bütçeyle orantılı
 * (bkz. auction/bot.ts: fairShare, reserve, maxSingleShare hepsi budget'a
 * bağlı) — bu yüzden bütçe değişince bot davranışı kendiliğinden ölçeklenir,
 * sabit ayar gerekmez (ölçümle doğrulandı).
 *
 * SÜRELER: `turnDurationSec` açılış teklifi penceresi, `bidDurationSec`
 * sonrasındaki serbest teklif evresi. Serbest evrede son saniye teklifi
 * mümkün olduğu için anti-snipe geri geldi.
 */
export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  squad: { GK: 1, DEF: 2, MID: 2, FWD: 2 },
  squadSize: 7,
  startingBudget: 150,
  bidDurationSec: 15,
  turnDurationSec: 10,
  minBidIncrement: 1,
  maxPlayers: 8,
  tournamentSize: 4,
  hiddenBudgets: false,
};

/**
 * AÇILIŞ PAS HAKKI — turnuva boyutuna göre oyuncu başına toplam hak.
 * 2 takımda rakip tek kişi olduğu için 1; 4 ve 8 takımda 2. Tur başına
 * sınır yoktur: bir oyuncu iki hakkını da aynı turda kullanabilir (pas →
 * açılış başkasına geçer → herkes pas derse sıra ona geri gelebilir).
 */
export const PASSES_BY_SIZE: Record<TournamentSize, number> = { 2: 1, 4: 2, 8: 2 };

export function passesForSize(size: TournamentSize): number {
  return PASSES_BY_SIZE[size] ?? 0;
}

/**
 * Gizli bütçe modunda sunucu, başka katılımcıların `budget` alanını bu değerle
 * gönderir. `isBudgetHidden()` ile kontrol edin — istemci "🔒 gizli" gösterir.
 */
export const HIDDEN_BUDGET = -1;

/** Bu bütçe değeri sunucu tarafından gizlendi mi? */
export function isBudgetHidden(budget: number): boolean {
  return budget < 0;
}

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
