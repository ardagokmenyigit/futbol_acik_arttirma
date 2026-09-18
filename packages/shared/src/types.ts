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
 * GEN aralığı 1-100 (veri setinde 78-96); dosya elle bakımlıdır, bkz. data/README.md.
 */
export interface Footballer {
  id: string;
  name: string;
  position: Position;
  /**
   * Genel değer (GEN) — kartta gösterilen ve TAKIM GÜCÜNE GİREN TEK sayı.
   * Mevki, GEN'in hücuma mı savunmaya mı aktığını belirler
   * (`POSITION_POWER_WEIGHT`). Oyuncu başına ayrı HÜC/SAV alanı yoktur:
   * eski elle kalibre edilen alanlar her veri güncellemesinde GEN–güç
   * sırasını bozuyordu.
   */
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
  /**
   * GİZLİ BÜTÇE MODU. `false` (varsayılan): rakipler birbirlerinin kalan
   * bütçesini görür ve botlar bu bilgiyi kullanarak fazla ödemez / güçlü
   * rakip aynı mevkiye oynuyorsa erken bağlanır. `true`: sunucu draft
   * sırasında her istemciye YALNIZ kendi bütçesini gönderir (diğerleri
   * `HIDDEN_BUDGET`), botlar da rakip bütçelerini görmez. Oda kurulurken
   * seçilir, sonra değişmez.
   */
  hiddenBudgets: boolean;
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
  /**
   * Kalan bütçe ("M"). Gizli bütçe modunda (`RoomConfig.hiddenBudgets`)
   * sunucu, draft sırasında BAŞKA katılımcıların bu alanını `HIDDEN_BUDGET`
   * (-1) olarak gönderir; `isBudgetHidden()` ile kontrol edin.
   */
  budget: number;
  /** Kazanılan futbolcular. */
  squad: Footballer[];
  /**
   * Kalan AÇILIŞ PAS HAKKI. Açılış sırası gelen katılımcı istemediği
   * futbolcu için pas diyebilir; futbolcu masada kalır, açılış görevi pas
   * demeyen uygun katılımcılardan rastgele birine geçer. Oyun başında
   * `passesForSize(tournamentSize)` ile verilir (2 takım → 1, 4/8 → 2),
   * tur sınırı yoktur — hepsi tek turda da harcanabilir.
   */
  passesLeft: number;
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
 *     İSTİSNA — AÇILIŞ PASI: açılışı yapacak kişinin `passesLeft` hakkı
 *     varsa pas diyebilir (`auction:pass`); futbolcu masada kalır, açılış
 *     pas demeyen uygun katılımcılardan rastgele birine geçer, pas diyen o
 *     turda teklif veremez. Herkes pas derse dışlama sıfırlanır: son pas
 *     diyen hariç uygun herkesten rastgele biri seçilir (hakkı yoksa açmak
 *     zorunda kalır).
 *  2. `bidding` — teklif serbesttir; pozisyona girebilen herkes teklif
 *     verebilir. Serbest evrede pas yoktur: istemeyen teklif vermez, fikri
 *     değişirse geri girebilir. Süre bitiminde en yüksek teklif kazanır.
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
  /**
   * Bu futbolcuya teklif verebilecek katılımcılar (pozisyonu uygun olanlar).
   * Bu turda pas diyenler listeden ÇIKAR — pas, o futbolcudan tamamen
   * vazgeçmektir; yoksa "açılışı başkasına yıkıp sonra ucuza kap" bedava olurdu.
   */
  eligibleIds: string[];
  /**
   * Bu turda açılışı pas geçenler (sırayla). Açılış görevi rastgele
   * seçilirken dışlanırlar; uygun kimse kalmazsa dışlama sıfırlanır ve son
   * pas diyen hariç uygun herkesten yeniden seçim yapılır.
   */
  passedIds: string[];
  /** En yüksek geçerli teklif. `opening` evresinde null. */
  highestBid: Bid | null;
  /** Mevcut evrenin biteceği sunucu zamanı (ms epoch). */
  endsAt: number;
  /** Bu turdaki tüm geçerli teklifler (eskiden yeniye). */
  history: Bid[];
}

/**
 * RÖVANŞ TEKLİFİ — yalnız `phase === 'finished'` iken dolu.
 *
 * Herhangi bir insan katılımcı teklif edebilir (host olmak şart değil).
 * Odadaki TÜM insanlar (`!isBot`) kabul edince sunucu odayı aynı kod ve aynı
 * katılımcılarla lobiye sıfırlar (`gameNumber` artar). Teklif eden,
 * yanıt vermeyenleri beklemeden "kabul edenlerle başla" diyebilir; o zaman
 * kabul etmeyenler odadan çıkarılır (`room:kicked`). Kabul eden geri
 * çekilebilir, teklif eden iptal edebilir, çıkan (`room:leave`) ana ekrana
 * döner. Teklif eden çıkarsa teklif kabul etmiş birine devrolur; kimse
 * yoksa iptal olur.
 */
export interface RematchState {
  proposerId: string;
  /** Kabul edenler — teklif eden baştan dahildir. */
  acceptedIds: string[];
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
  /** Bu odada kaçıncı oyun (1'den başlar; her rövanşta artar). */
  gameNumber: number;
  /** Aktif rövanş teklifi — yalnız `finished` fazında. */
  rematch: RematchState | null;
  /** phase === 'draft' iken dolu. */
  auction: AuctionState | null;
  /** Draft'ta henüz artırmaya çıkmamış futbolcu id'leri. */
  remainingPoolIds: string[];
  /** phase 'simulation' | 'finished' iken dolu (Kişi 2). */
  league: LeagueState | null;
  /** Turnuva ağacı sistemi (Kişi 2). */
  tournament?: TournamentState | null;
  /** Canlı seri penaltı — yalnız insanlı bir maçın serisi oynanırken dolu. */
  shootout?: ShootoutState | null;
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

/**
 * MEVKİ → (hücum, savunma) AĞIRLIĞI. Takım gücünün tek girdisi GEN'dir
 * (`overall`); mevki yalnız GEN'in hangi eksene aktığını belirler:
 *
 *   GK, DEF → 2.0 savunma            MID → 1.5 hücum + 0.5 savunma
 *   FWD     → 2.0 hücum
 *
 * Her oyuncu toplam 2.0 ağırlık taşır. Varsayılan dizilişte (1-2-2-2) iki
 * eksenin paydası da 7'dir (savunma 2+4+1, hücum 4+3); dolayısıyla HER
 * MEVKİDE 1 GEN PUANI TAKIM GÜCÜNE TAM 1/7 KATAR — mevkiler arası adalet
 * formülden gelir, veri setine bağlı değildir. Orta sahanın 0.5/1.5 bölünmesi
 * bu eşitliğin tek çözümüdür: 1.0/1.0 paydaları 8/6 yapar ve forvetin GEN'i
 * stoperinkinden %33 değerli olur.
 *
 * Eski model oyuncu başına elle kalibre edilmiş HÜC/SAV alanlarına dayanıyor
 * ve her veri güncellemesinde "94'lük oyuncu 88'likten az güç veriyor" sınıfı
 * ihlaller üretiyordu (16 Eylül 2026 güncellemesinde 321 ihlal). GEN tek
 * kaynak olunca mevki içinde GEN sırası = güç sırası yapısal olarak sağlanır.
 */
export const POSITION_POWER_WEIGHT: Record<Position, { attack: number; defense: number }> = {
  GK: { attack: 0, defense: 2 },
  DEF: { attack: 0, defense: 2 },
  MID: { attack: 1.5, defense: 0.5 },
  FWD: { attack: 2, defense: 0 },
};

/**
 * Oyuncunun GEN'inin hücum / savunma eksenlerine dağılımı — kart gösterimi
 * için (`GEN · ağırlık / 2`). FWD 94 → HÜC 94 / SAV 0; MID 94 → HÜC 71 / SAV 24;
 * GK 90 → SAV 90. Takım gücü hesabında KULLANILMAZ; oyuncuya "reytingin
 * nereye akıyor" sorusunun görsel cevabıdır.
 */
export function powerSplit(p: Footballer): { attack: number; defense: number } {
  const w = POSITION_POWER_WEIGHT[p.position];
  return {
    attack: Math.round((p.overall * w.attack) / 2),
    defense: Math.round((p.overall * w.defense) / 2),
  };
}

/** Oyuncunun güce etki ettiği eksen(ler)in kısa etiketi: "HÜC", "SAV", "HÜC+SAV". */
export function powerRoleLabel(position: Position): string {
  const w = POSITION_POWER_WEIGHT[position];
  if (w.attack > 0 && w.defense > 0) return 'HÜC+SAV';
  return w.attack > 0 ? 'HÜC' : 'SAV';
}

/**
 * Kadronun hücum ve savunma gücü: GEN'lerin mevki ağırlıklı ortalaması.
 * Sonuç doğal olarak GEN aralığında (0–100) kalır; ayrıca kalibrasyon
 * gerekmez. Payda gerçek kadrodan toplanır — host kadro dizilişini
 * değiştirse de formül geçerli kalır. Bir eksene hiç oyuncu düşmemişse
 * (ör. yalnız kaleci + defans alınmış eksik kadro) o eksen 50 sayılır.
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
    const w = POSITION_POWER_WEIGHT[p.position];
    attackSum += p.overall * w.attack;
    attackWeight += w.attack;
    defenseSum += p.overall * w.defense;
    defenseWeight += w.defense;
  }

  const attack = attackWeight > 0 ? attackSum / attackWeight : 50;
  const defense = defenseWeight > 0 ? defenseSum / defenseWeight : 50;

  return {
    attack: Math.max(20, Math.min(99, Math.round(attack))),
    defense: Math.max(20, Math.min(99, Math.round(defense))),
  };
}

/**
 * Takımın TEK SAYILIK gücü — maç sonucunu belirleyen değer budur.
 *
 * Kadronun düz GEN ortalaması DEĞİLDİR: 88'lik bir kaleciyle 88'lik bir
 * forveti ortalamak "bu kadro pahalı" der, "bu takım gol atar/yemez" demez.
 * Simülatör hücum ve savunmayı ayrı kullanır (`hücumum / rakibin savunması`);
 * güç, ikisinin ortalamasıdır ve tam kadroda her oyuncunun katkısı
 * kadrodan bağımsız `2·GEN / 14 = GEN / 7`'dir.
 *
 * Ölçüm (eski model, 2670 gerçek draft): GEN'e göre en iyi takım ile bu
 * değere göre en iyi takım %21.4 oranında farklı çıkıyordu. Yeni modelde de
 * mevki dağılımı farklı iki kadro aynı GEN ortalamasında farklı güç alır;
 * arayüzde öne çıkan sayı bu olmalı.
 */
export function calculateTeamPower(players: Footballer[]): number {
  const { attack, defense } = calculateTeamStats(players);
  return Math.round((attack + defense) / 2);
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

/** Penaltıda atıcının vurduğu / kalecinin uzandığı köşe. */
export type PenaltyDirection = 'left' | 'center' | 'right';
export const PENALTY_DIRECTIONS: readonly PenaltyDirection[] = ['left', 'center', 'right'];

/** Bir penaltı vuruşunun sonucu: gol, kaleci kurtardı, dışarı/direk. */
export type PenaltyOutcome = 'goal' | 'saved' | 'missed';

/**
 * Seri penaltı atışlarındaki tek bir penaltı denemesi.
 *
 * KÖŞE OYUNU (bkz. shared/simulation/penalty.ts): atıcı ve kaleci eş zamanlı
 * bir köşe seçer. Farklı köşe → kaleci yanlış tarafta, yalnız isabet zarı
 * (gol / dışarı). Aynı köşe → önce isabet, sonra kaleci GEN'ine bağlı
 * kurtarma zarı (gol / kurtarış / dışarı). İnsan içeren maçlarda seçimler
 * canlı yapılır (`ShootoutState`), bot–bot maçlarda botlar seçer.
 */
export interface PenaltyShootoutAttempt {
  /** Kaçıncı penaltı turu (1, 2, 3...) */
  round: number;
  /** Atışı kullanan takımın ID'si. */
  teamId: string;
  /** Atışı kullanan futbolcunun ID'si. */
  playerId?: string;
  /** Atışı kullanan futbolcunun adı. */
  playerName: string;
  /** Kurtarmaya çalışan kalecinin ID'si / adı. */
  keeperId?: string;
  keeperName?: string;
  /** Gol oldu mu? (`outcome === 'goal'`) */
  scored: boolean;
  /** Vuruşun köşesi ve kalecinin uzandığı köşe. */
  shotDirection: PenaltyDirection;
  keeperDirection: PenaltyDirection;
  outcome: PenaltyOutcome;
  /** Bu atıştan sonraki ev sahibi penaltı skoru. */
  scoreHomeAfter: number;
  /** Bu atıştan sonraki deplasman penaltı skoru. */
  scoreAwayAfter: number;
}

/**
 * CANLI SERİ PENALTI — `RoomState.shootout`, yalnız insan içeren bir maçın
 * serisi oynanırken dolu. Sunucu her vuruşta yeni durum yayınlar
 * (`tournament:shootoutPrompt`), seçimler `tournament:penaltyChoose` ile
 * gelir, süre dolunca ya da iki taraf da seçince vuruş çözülür
 * (`tournament:shootoutKick`). Seçilen köşeler açıklanana kadar durumda YER
 * ALMAZ — yalnız "seçti / seçmedi" bayrakları vardır.
 */
export interface ShootoutState {
  matchId: string;
  homeId: string;
  awayId: string;
  /** Şu ana kadarki penaltı skoru. */
  penaltiesHome: number;
  penaltiesAway: number;
  /** Açıklanmış vuruşlar (sırayla). */
  attempts: PenaltyShootoutAttempt[];
  /** Sıradaki vuruş: 0 tabanlı sıra numarası ve tur. */
  kickIndex: number;
  round: number;
  shooterTeamId: string;
  keeperTeamId: string;
  shooter: Footballer;
  keeper: Footballer;
  /** `choosing`: köşeler seçiliyor; `revealed`: vuruş açıklandı, kısa bekleme. */
  phase: 'choosing' | 'revealed';
  /** Seçim süresinin biteceği sunucu zamanı (ms epoch). */
  endsAt: number;
  /** Taraflar seçimini yaptı mı (yön gizli). */
  shooterChosen: boolean;
  keeperChosen: boolean;
  /** Son açıklanan vuruş (phase === 'revealed' iken). */
  lastAttempt: PenaltyShootoutAttempt | null;
  /** Seri bitti mi? Son vuruş açıklandığında kazanan takım; sürerken null. */
  winnerId: string | null;
}

export interface MatchResult {
  matchId: string;
  homeId: string;
  awayId: string;
  /**
   * Nihai skor. Uzatmaya gidildiyse (`extraTime`) uzatma golleri DAHİLDİR
   * (gerçek futboldaki "u.s." skoru); normal süre skoru `events`ten
   * `minute <= 90` ile türetilir.
   */
  scoreHome: number;
  scoreAway: number;
  /** Goller; uzatma golleri 91–120. dakikadadır. */
  events: MatchEvent[];
  /**
   * Turnuva maçında 90 dakika berabere bitti ve 30 dakika UZATMA oynandı.
   * Uzatma da eşit biterse ayrıca `penaltiesHome/Away` dolar.
   */
  extraTime?: boolean;
  /** Turnuva maçında uzatma sonrası beraberlik durumunda penaltı skoru. */
  penaltiesHome?: number;
  penaltiesAway?: number;
  /**
   * Uzatma da berabere bitti ve seri penaltı HENÜZ OYNANMADI — insan içeren
   * maçlarda seri canlı oynanır (`ShootoutState`); bu bayrak varken
   * `winnerId` yoktur. Seri bitince sunucu tamamlanmış sonucu yayınlar.
   */
  pendingShootout?: boolean;
  /** Maçı kazanan ve bir üst tura yükselen takımın participantId'si. */
  winnerId?: string;
  /** Sıralı seri penaltı atışlarının detaylı dökümü. */
  penaltyShootout?: PenaltyShootoutAttempt[];
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
