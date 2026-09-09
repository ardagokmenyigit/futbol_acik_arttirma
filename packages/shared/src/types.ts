/**
 * ============================================================================
 *  FAZ 0 TASLAĞI — ORTAK TİPLER
 * ----------------------------------------------------------------------------
 *  Bu dosya Kişi 1 ve Kişi 2'nin ortak sözleşmesidir. Burada bir alanı
 *  değiştirmeden / silmeden önce diğer kişiye haber verin (CLAUDE.md §4).
 *  Yeni özelliğe başlamadan önce ilgili tipi buraya ekleyin, sonra
 *  sunucu/istemci kodunu yazın (CLAUDE.md §5).
 * ============================================================================
 */

/** Futbolcu pozisyonu. */
export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

/** Oda / oyunun içinde bulunduğu faz. */
export type RoomPhase = 'lobby' | 'draft' | 'simulation' | 'finished';

/**
 * Havuzdaki bir futbolcu. Statik veri (`packages/server/data/players.json`).
 * Stat aralıkları için Kişi 2'nin üretim scriptine bakın (öneri: 1-100).
 */
export interface Footballer {
  id: string;
  name: string;
  position: Position;
  /** Hücum katkısı. */
  attack: number;
  /** Defans katkısı. */
  defense: number;
  pace: number;
  stamina: number;
  /** Genel değer — kart üzerinde gösterilir. */
  overall: number;
  /** Açık artırma başlangıç fiyatı ("M" cinsinden). */
  basePrice: number;
}

/**
 * Kadro kuralları + oyun ayarları. Host oda kurarken varsayılanları
 * (`DEFAULT_ROOM_CONFIG`) değiştirebilir.
 */
export interface RoomConfig {
  /** Pozisyon başına zorunlu oyuncu sayısı. */
  squad: Record<Position, number>;
  /** Kadrodaki toplam oyuncu (squad değerlerinin toplamı). */
  squadSize: number;
  /** Her oyuncunun başlangıç bütçesi ("M"). */
  startingBudget: number;
  /** Bir açık artırma round'unun süresi (saniye). */
  bidDurationSec: number;
  /** Minimum artış miktarı ("M"). */
  minBidIncrement: number;
  /** Odaya girebilecek min/max oyuncu. */
  minPlayers: number;
  maxPlayers: number;
}

/** Bir insan katılımcı (oda üyesi). */
export interface Participant {
  /** Kalıcı oyuncu kimliği (reconnect için socket.id'den bağımsız). */
  id: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
  /** Şu an bağlı mı? Bağlantı kopunca draft durmaz (CLAUDE.md §4.5). */
  connected: boolean;
  /** Kalan bütçe ("M"). */
  budget: number;
  /** Kazanılan futbolcular. */
  squad: Footballer[];
}

/** Açık artırmada verilen tek bir teklif. */
export interface Bid {
  playerId: string;
  amount: number;
  /** Sunucu zaman damgası (ms). */
  at: number;
}

/** Aktif açık artırma round'unun durumu. */
export interface AuctionState {
  /** Kaçıncı round (1'den başlar). */
  round: number;
  /** Şu an artırmada olan futbolcu. */
  footballer: Footballer;
  /** En yüksek geçerli teklif. Henüz teklif yoksa null. */
  highestBid: Bid | null;
  /** Round'un biteceği sunucu zamanı (ms epoch). */
  endsAt: number;
  /** Bu round'daki tüm geçerli teklifler (eskiden yeniye). */
  history: Bid[];
}

/** Sunucudaki tek doğruluk kaynağı — bir odanın tam durumu. */
export interface RoomState {
  /** Dahili benzersiz oda kimliği. */
  roomId: string;
  /** Paylaşılabilir kısa oda kodu (örn. "ABC123"). */
  code: string;
  phase: RoomPhase;
  hostId: string;
  config: RoomConfig;
  participants: Participant[];
  /** phase === 'draft' iken dolu. */
  auction: AuctionState | null;
  /** Draft'ta henüz artırmaya çıkmamış futbolcu id'leri. */
  remainingPoolIds: string[];
  /** phase 'simulation' | 'finished' iken dolu (Kişi 2). */
  league: LeagueState | null;
  /** Turnuva ağacı sistemi (Kişi 2). */
  tournament?: TournamentState | null;
}

/* ==========================================================================
 *  LİG / SİMÜLASYON (Kişi 2 — burada şekli birlikte netleştirelim)
 * ======================================================================== */

/** Simülasyona giren, statları toplanmış takım. */
export interface Team {
  participantId: string;
  nickname: string;
  players: Footballer[];
  /** Kadro statlarından türetilen toplam/ortalama hücum gücü. */
  attack: number;
  defense: number;
}

/** Maç içindeki bir olay (şimdilik sadece gol). */
export interface MatchEvent {
  minute: number;
  /** Golü atan takımın participantId'si. */
  teamId: string;
  type: 'goal';
}

export interface Fixture {
  matchId: string;
  homeId: string;
  awayId: string;
}

export interface MatchResult {
  matchId: string;
  homeId: string;
  awayId: string;
  scoreHome: number;
  scoreAway: number;
  events: MatchEvent[];
  /** Turnuva maçında beraberlik durumunda penaltı skoru. */
  penaltiesHome?: number;
  penaltiesAway?: number;
  /** Maçı kazanan ve bir üst tura yükselen takımın participantId'si. */
  winnerId?: string;
}

export interface StandingRow {
  participantId: string;
  nickname: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface LeagueState {
  fixtures: Fixture[];
  results: MatchResult[];
  standings: StandingRow[];
  /** Tüm maçlar oynandıysa şampiyonun participantId'si. */
  championId: string | null;
}

/* ==========================================================================
 *  TURNUVA AĞACI SİSTEMİ (Kişi 2)
 * ======================================================================== */

export type TournamentSize = 4 | 8;
export type TournamentRoundName = 'quarter' | 'semi' | 'final';

export interface TournamentMatch {
  matchId: string;
  round: TournamentRoundName;
  roundIndex: number;
  homeId: string | null;
  awayId: string | null;
  homePlaceholder?: string;
  awayPlaceholder?: string;
  result?: MatchResult;
}

export interface TournamentRound {
  name: TournamentRoundName;
  title: string;
  matches: TournamentMatch[];
}

export interface TournamentState {
  size: TournamentSize;
  rounds: TournamentRound[];
  currentMatchId: string | null;
  championId: string | null;
}

