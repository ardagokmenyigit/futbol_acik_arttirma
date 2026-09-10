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
  /** Genel değer — kart üzerinde gösterilir. */
  overall: number;
  /**
   * @deprecated TABAN FİYAT KALDIRILDI. Açık artırma artık 0'dan başlar ve
   * ilk teklif `config.minBidIncrement` kadardır; hiçbir fiyat, teklif tabanı,
   * bot rezervi ya da zorunlu atama bu alanı KULLANMAZ.
   *
   * Alan yalnızca `players.json` ayrıştırması bozulmasın diye duruyor.
   * Veri seti bu alandan tamamen arındırıldığında silinecek.
   */
  basePrice?: number;
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
  /** Açılıştan sonraki SERBEST TEKLİF evresinin süresi (saniye). */
  bidDurationSec: number;
  /**
   * Sırası gelen katılımcının AÇILIŞ TEKLİFİNİ verme süresi (saniye).
   * Süre dolarsa sunucu onun adına asgari açılışı yapar (pas hakkı yoktur).
   */
  turnDurationSec: number;
  /**
   * Minimum artış miktarı ("M"). Taban fiyat kaldırıldığı için ilk teklif de
   * bu değerdir — yani hiçbir futbolcu bundan ucuza gitmez.
   */
  minBidIncrement: number;
  /**
   * Odaya girebilecek en fazla insan oyuncu. Fiili kapasite `tournamentSize`
   * ile sınırlıdır (2, 4 ya da 8); tek kişi bile oyunu başlatabilir, eksik
   * takımlar botlarla tamamlanır.
   */
  maxPlayers: number;
  /**
   * Oyun formatı: eleme usulü turnuva ağacı. 2, 4 ya da 8 takım. Odadaki insan
   * sayısı kadarı gerçek, kalanı bot (`isBot: true`) olur. Lig formatı
   * kaldırıldı — bu alan artık 2, 4 ya da 8'dir.
   */
  tournamentSize: TournamentSize;
}

/** Bir katılımcı (oda üyesi). İnsan ya da bot olabilir. */
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
  /**
   * Yapay zekâ takımı mı? Turnuva formatında eksik oyuncu sayısı
   * botlarla tamamlanır; botlar açık artırmaya da katılır.
   */
  isBot?: boolean;
}

/** Açık artırmada verilen tek bir teklif. */
export interface Bid {
  playerId: string;
  amount: number;
  /** Sunucu zaman damgası (ms). */
  at: number;
}

/** Açık artırmanın evresi. */
export type AuctionPhase = 'opening' | 'bidding';

/**
 * Aktif açık artırmanın durumu.
 *
 * YAPI: Draft `squadSize × katılımcı` TUR sürer (4 oyuncu × 7 kadro = 28).
 * Draft havuzu önceden seçilir ve pozisyon başına TAM OLARAK ihtiyaç kadar
 * futbolcu içerir (4 kaleci, 8 defans, 8 orta saha, 8 forvet). Arz talebe
 * denk olduğu için her tur satılır ve herkes tam kadroyla biter.
 *
 * AKIŞ:
 *  1. `opening` — o turun sırasındaki ilk uygun katılımcı AÇILIŞ TEKLİFİNİ
 *     vermek ZORUNDADIR (en az `minBidIncrement`). Süresi dolarsa sunucu
 *     onun adına asgari açılışı yapar. Böylece her turda mutlaka gerçek bir
 *     teklif olur — "kimse teklif vermedi, bedavaya gitti" durumu yoktur.
 *  2. `bidding` — teklif serbesttir; pozisyona girebilen herkes teklif
 *     verebilir. PAS HAKKI YOKTUR: istemeyen teklif vermez, fikri değişirse
 *     geri girebilir. Süre bitiminde en yüksek teklif kazanır.
 *
 * Sıra yalnızca açılışı belirler; sıra numaralarının toplamı tüm katılımcılar
 * için eşittir (bkz. server/auction/turnOrder.ts).
 */
export interface AuctionState {
  /** Kaçıncı tur (1'den başlar). */
  round: number;
  /** Toplam tur sayısı (`squadSize × katılımcı`). */
  totalRounds: number;
  /** Şu an artırmada olan futbolcu. */
  footballer: Footballer;
  /** Bu turun sırası — `turnOrder[0]` normalde açılışı yapar. */
  turnOrder: string[];
  /** Açılış teklifini verecek / vermiş katılımcı. */
  openerId: string;
  phase: AuctionPhase;
  /** Bu futbolcuya teklif verebilecek katılımcılar (pozisyonu uygun olanlar). */
  eligibleIds: string[];
  /** En yüksek geçerli teklif. `opening` evresinde null. */
  highestBid: Bid | null;
  /** Mevcut evrenin biteceği sunucu zamanı (ms epoch). */
  endsAt: number;
  /** Bu turdaki tüm geçerli teklifler (eskiden yeniye). */
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

export interface CalculatedStats {
  attack: number;
  defense: number;
}

export const ATTACK_WEIGHT: Record<Position, number> = {
  FWD: 1.0,
  MID: 0.6,
  DEF: 0.2,
  GK: 0.1,
};

export const DEFENSE_WEIGHT: Record<Position, number> = {
  FWD: 0.2,
  MID: 0.6,
  DEF: 1.0,
  GK: 1.1,
};

/**
 * Kadronun mevkisel ağırlıklı hücum ve savunma gücünü hesaplar.
 */
export function calculateTeamStats(players: Footballer[]): CalculatedStats {
  if (!players || players.length === 0) {
    return { attack: 50, defense: 50 };
  }

  let attackSum = 0;
  let attackWeight = 0;
  let defenseSum = 0;
  let defenseWeight = 0;

  for (const p of players) {
    const aw = ATTACK_WEIGHT[p.position];
    const dw = DEFENSE_WEIGHT[p.position];
    attackSum += p.attack * aw;
    attackWeight += aw;
    defenseSum += p.defense * dw;
    defenseWeight += dw;
  }

  const attack = attackWeight > 0 ? attackSum / attackWeight : 50;
  const defense = defenseWeight > 0 ? defenseSum / defenseWeight : 50;

  return {
    attack: Math.max(20, Math.min(99, Math.round(attack))),
    defense: Math.max(20, Math.min(99, Math.round(defense))),
  };
}

/** Maç içindeki bir olay (gol). */
export interface MatchEvent {
  minute: number;
  /** Golü atan takımın participantId'si. */
  teamId: string;
  type: 'goal';
  /** Golü atan futbolcunun id'si. */
  playerId?: string;
  /** Golü atan futbolcunun adı. */
  playerName?: string;
}

/** Turnuva veya lig sonunda gol krallığı bilgisi. */
export interface TopScorer {
  playerId: string;
  playerName: string;
  teamId: string;
  teamNickname: string;
  goals: number;
  position?: Position;
  overall?: number;
}

/**
 * Oynanmış maç sonuçlarından turnuvanın/ligin gol kralını hesaplar.
 */
export function getTopScorer(
  results: MatchResult[],
  participants: Participant[],
): TopScorer | null {
  const goalMap = new Map<
    string,
    { playerId: string; playerName: string; teamId: string; goals: number }
  >();

  for (const match of results) {
    if (!match?.events) continue;
    for (const evt of match.events) {
      if (evt.type === 'goal' && evt.playerName) {
        const key = evt.playerId || evt.playerName;
        const current = goalMap.get(key);
        if (current) {
          current.goals += 1;
        } else {
          goalMap.set(key, {
            playerId: evt.playerId ?? key,
            playerName: evt.playerName,
            teamId: evt.teamId,
            goals: 1,
          });
        }
      }
    }
  }

  let top: { playerId: string; playerName: string; teamId: string; goals: number } | null = null;
  for (const scorer of goalMap.values()) {
    if (!top || scorer.goals > top.goals) {
      top = scorer;
    }
  }

  if (!top) return null;

  const team = participants.find((p) => p.id === top.teamId);
  const player = team?.squad.find((pl) => pl.id === top.playerId || pl.name === top.playerName);

  return {
    playerId: top.playerId,
    playerName: top.playerName,
    teamId: top.teamId,
    teamNickname: team?.nickname ?? 'Bilinmeyen Takım',
    goals: top.goals,
    position: player?.position,
    overall: player?.overall,
  };
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

export type TournamentSize = 2 | 4 | 8;
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
