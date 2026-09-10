/**
 * FAZ 0 TASLAĞI — Socket event sözleşmesi.
 * İsimlendirme: `namespace:action` (CLAUDE.md §5).
 * Yeni event eklemeden önce bu dosyayı güncelleyin.
 */
import type {
  AuctionState,
  Bid,
  LeagueState,
  MatchResult,
  Participant,
  RoomConfig,
  RoomState,
  TournamentSize,
  TournamentState,
} from './types.js';

/* ---------- İstemci -> Sunucu ---------- */
export interface ClientToServerEvents {
  /** Faz 0 sağlık kontrolü — bağlantı doğrulandıktan sonra kaldırılabilir. */
  hello: (msg: string, ack: (reply: string) => void) => void;

  'room:create': (
    payload: { nickname: string; config?: Partial<RoomConfig> },
    ack: (res: AckResult<{ roomState: RoomState; you: Participant }>) => void,
  ) => void;
  'room:join': (
    payload: { code: string; nickname: string },
    ack: (res: AckResult<{ roomState: RoomState; you: Participant }>) => void,
  ) => void;
  'room:rejoin': (
    payload: { roomId: string; playerId: string },
    ack: (res: AckResult<{ roomState: RoomState; you: Participant }>) => void,
  ) => void;
  'room:leave': () => void;
  'room:setReady': (payload: { ready: boolean }) => void;
  /** Sadece host: turnuva boyutunu seç (4 ya da 8 takım). */
  'room:setFormat': (
    payload: { tournamentSize: TournamentSize },
    ack: (res: AckResult<{ roomState: RoomState }>) => void,
  ) => void;
  'room:start': (ack: (res: AckResult<{ roomState: RoomState }>) => void) => void;
  'room:startSimulation': () => void;

  'auction:bid': (
    payload: { amount: number },
    ack: (res: AckResult<{ highestBid: Bid }>) => void,
  ) => void;
}

/* ---------- Sunucu -> İstemci ---------- */
export interface ServerToClientEvents {
  'room:state': (roomState: RoomState) => void;
  'room:playerJoined': (participant: Participant) => void;
  'room:playerLeft': (payload: { playerId: string }) => void;
  'room:error': (payload: { message: string }) => void;

  'auction:started': (auction: AuctionState) => void;
  /**
   * Açılış teklifi verildi — artırma serbest teklif evresine geçti.
   * İstemci geri sayımı buradaki `endsAt`'e göre yeniler.
   */
  'auction:opened': (payload: {
    openerId: string;
    amount: number;
    endsAt: number;
    /** Sunucu, süresi dolduğu için açılışı onun adına mı yaptı? */
    auto: boolean;
  }) => void;
  'auction:tick': (payload: { round: number; remainingMs: number }) => void;
  'auction:bid': (payload: { highestBid: Bid | null; history: Bid[] }) => void;
  'auction:won': (payload: {
    round: number;
    footballerId: string;
    footballerName: string;
    /** Kimse teklif vermediyse null (futbolcu satılmadı). */
    winnerId: string | null;
    winnerNickname: string | null;
    amount: number;
  }) => void;
  'auction:finished': (roomState: RoomState) => void;

  'league:fixtures': (league: LeagueState) => void;
  'league:matchResult': (payload: { result: MatchResult; league: LeagueState }) => void;
  'league:finished': (payload: { league: LeagueState }) => void;

  /** Turnuva ağacı kurulduğunda (eşleşmeler belli, henüz maç oynanmadı). */
  'tournament:bracket': (tournament: TournamentState) => void;
  /** Bir turnuva maçı oynandığında — kazanan bir üst tura işlenmiş hâliyle. */
  'tournament:matchResult': (payload: { result: MatchResult; tournament: TournamentState }) => void;
  /** Final oynandı, şampiyon belli. */
  'tournament:finished': (payload: { tournament: TournamentState }) => void;
}

/** Ack (callback) dönüş tipi — her istekte başarı/hata net olsun. */
export type AckResult<T> = { ok: true; data: T } | { ok: false; error: string };
