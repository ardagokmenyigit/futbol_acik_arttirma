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
  PenaltyDirection,
  PenaltyShootoutAttempt,
  RoomConfig,
  RoomState,
  ShootoutState,
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

  /** Oyun bitince (`finished`) rövanş teklif et — herhangi bir insan katılımcı. */
  'room:rematchPropose': (ack: (res: AckResult<{ roomState: RoomState }>) => void) => void;
  /** Teklife yanıt: `accept: true` kabul, `false` kabulü geri çek. */
  'room:rematchRespond': (
    payload: { accept: boolean },
    ack: (res: AckResult<{ roomState: RoomState }>) => void,
  ) => void;
  /** Sadece teklif eden: yanıt vermeyenleri beklemeden kabul edenlerle başla. */
  'room:rematchStart': (ack: (res: AckResult<{ roomState: RoomState }>) => void) => void;
  /** Sadece teklif eden: teklifi geri çek (kimse çıkarılmaz). */
  'room:rematchCancel': (ack: (res: AckResult<{ roomState: RoomState }>) => void) => void;

  'auction:bid': (
    payload: { amount: number },
    ack: (res: AckResult<{ highestBid: Bid }>) => void,
  ) => void;
  /**
   * Açılış sırası bendeyken pas geç (`passesLeft` > 0 şart). Futbolcu masada
   * kalır, açılış görevi rastgele başka birine geçer; ben bu turda teklif
   * veremem. Ack'te kalan hakkım döner.
   */
  'auction:pass': (ack: (res: AckResult<{ passesLeft: number }>) => void) => void;

  /**
   * CANLI SERİ PENALTI — köşe seçimi. Yalnız sıradaki vuruşun atıcı takımı
   * (vuruş köşesi) ya da kaleci takımı (uzanış köşesi) olan İNSAN katılımcı
   * gönderebilir; süre dolana kadar değiştirilebilir, iki taraf da seçince
   * vuruş hemen çözülür. Ack'te üstlenilen rol döner.
   */
  'tournament:penaltyChoose': (
    payload: { matchId: string; kickIndex: number; direction: PenaltyDirection },
    ack: (res: AckResult<{ role: 'shooter' | 'keeper' }>) => void,
  ) => void;
}

/* ---------- Sunucu -> İstemci ---------- */
export interface ServerToClientEvents {
  'room:state': (roomState: RoomState) => void;
  'room:playerJoined': (participant: Participant) => void;
  'room:playerLeft': (payload: { playerId: string }) => void;
  'room:error': (payload: { message: string }) => void;
  /**
   * Sunucu bu soketi odadan çıkardı (örn. rövanş sensiz başladı). İstemci
   * oturumu silip ana ekrana döner ve `reason`ı gösterir; oda lobideyse
   * kodla yeniden katılabilir.
   */
  'room:kicked': (payload: { reason: string }) => void;

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
  /**
   * Açılış pas geçildi — futbolcu aynı, açılış görevi `nextOpenerId`'ye geçti.
   * İstemci geri sayımı `endsAt`'e göre yeniler ve pası duyurur.
   */
  'auction:passed': (payload: {
    passerId: string;
    passerNickname: string;
    /** Pas diyenin kalan hakkı. */
    passesLeft: number;
    nextOpenerId: string;
    nextOpenerNickname: string;
    endsAt: number;
    /** Pas sonrası tek uygun alıcı kaldığı için otomatik atama yapıldı mı? */
    autoAssigned: boolean;
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
  /**
   * İnsan oyuncu içeren bir maç CANLI oynanmak üzere. İstemci maçı dakika
   * dakika oynatır (LiveMatchTicker); sonuç zaten hazırdır ama ağaca
   * `tournament:matchResult` gelene kadar işlenmez. Bot–bot maçlarında bu
   * event GÖNDERİLMEZ, doğrudan `tournament:matchResult` gelir.
   */
  'tournament:matchLive': (payload: {
    matchId: string;
    result: MatchResult;
    /**
     * Canlı oynatmanın başlamasından bu yana geçen süre (ms) — ilk yayında 0,
     * yeniden bağlanana tekrar gönderilirken gerçek değer. Süre olarak
     * gönderilir (mutlak zaman değil) ki istemcinin saat kayması dakikayı
     * bozmasın; istemci maçı baştan değil kaldığı dakikadan oynatır.
     */
    elapsedMs?: number;
  }) => void;
  /**
   * CANLI SERİ PENALTI — yeni vuruş: taraflar köşe seçiyor (`state.phase ===
   * 'choosing'`, süre `state.endsAt`). `tournament:matchLive` ile gelen sonuç
   * `pendingShootout` ise uzatma bitiminde bu event beklenir. Aynı durum
   * `RoomState.shootout` içinde de yayınlanır (yeniden bağlanma).
   */
  'tournament:shootoutPrompt': (state: ShootoutState) => void;
  /** Vuruş çözüldü: köşeler ve sonuç açıklandı (`state.phase === 'revealed'`). */
  'tournament:shootoutKick': (payload: {
    state: ShootoutState;
    attempt: PenaltyShootoutAttempt;
  }) => void;
  /** Bir turnuva maçı oynandığında — kazanan bir üst tura işlenmiş hâliyle. */
  'tournament:matchResult': (payload: { result: MatchResult; tournament: TournamentState }) => void;
  /** Final oynandı, şampiyon belli. */
  'tournament:finished': (payload: { tournament: TournamentState }) => void;
}

/** Ack (callback) dönüş tipi — her istekte başarı/hata net olsun. */
export type AckResult<T> = { ok: true; data: T } | { ok: false; error: string };
