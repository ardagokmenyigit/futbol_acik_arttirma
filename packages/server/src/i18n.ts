import { DEFAULT_LANG, LANGS, type Lang } from '@fal/shared';
import type { TypedSocket } from './socketTypes.js';

/**
 * ============================================================================
 *  SUNUCU MESAJLARININ DİLİ
 * ----------------------------------------------------------------------------
 *  Sunucu kodu hata / uyarı mesajlarını TÜRKÇE üretir (tek kaynak, mevcut
 *  kodun tamamı). İstemci arayüz dilini bildirir (`auth.lang` bağlantıda,
 *  `client:setLang` değişince); bu modül soketin çıkış kapısında — ack
 *  cevaplarının `error` alanı, `room:error.message`, `room:kicked.reason` —
 *  mesajı o dile çevirir. Böylece web ve Flutter istemcisi aynı çeviriyi
 *  kullanır, çeviri tablosu tek yerde durur.
 *
 *  Yeni bir kullanıcı mesajı eklerken buraya İngilizcesini de ekle; eksikse
 *  mesaj Türkçe gider (çökme yok) ve `scripts/checkServerI18n.ts` yakalar.
 * ============================================================================
 */

/** Sabit mesajlar: Türkçe → İngilizce. */
const EXACT: Record<string, string> = {
  'Aktif bir rövanş teklifi yok': 'There is no active rematch offer',
  'Açılış evresi bitti': 'The opening phase is over',
  'Açılış sırası sende değil': "It's not your turn to open",
  'Açılış teklifi bekleniyor': 'Waiting for the opening bid',
  'Açılış teklifi sırası sende değil': "It's not your turn to make the opening bid",
  'Açılışı yapacak katılımcı bulunamadı': 'No participant found to make the opening bid',
  'Beklenmeyen bir hata oluştu': 'An unexpected error occurred',
  'Bir odada değilsin': "You're not in a room",
  'Bu futbolcuya teklif veremezsin': "You can't bid on this player",
  'Bu odada kayıtlı değilsin': "You're not registered in this room",
  'Bu odada oyuncu değilsin': "You're not a player in this room",
  'Bu takma ad odada kullanılıyor': 'This nickname is already taken in the room',
  'Bu tur bitti': 'This round is over',
  'Bu turda pas geçtin, teklif veremezsin': "You passed this round, so you can't bid",
  'Bu turda zaten pas geçtin': 'You already passed this round',
  'Bu vuruş için süre doldu.': 'Time is up for this kick.',
  'Bu vuruşta rolün yok — izleyicisin.': "You have no role in this kick — you're watching.",
  'Böyle bir oda bulunamadı': 'No such room found',
  'Daveti sadece teklif eden iptal edebilir': 'Only the player who proposed can cancel the invite',
  'Diğer oyuncuların hepsi hazır değil': 'Not all other players are ready',
  'En az 1 bağlı oyuncu gerekli': 'At least 1 connected player is required',
  'En yüksek teklif zaten sende': 'You already have the highest bid',
  'Formatı sadece host seçebilir': 'Only the host can choose the format',
  'Geçersiz istek.': 'Invalid request.',
  'Geçersiz köşe.': 'Invalid corner.',
  'Kadron dolu': 'Your squad is full',
  'Katılımcı bulunamadı': 'Participant not found',
  'Oda artık mevcut değil': 'The room no longer exists',
  'Oda bulunamadı': 'Room not found',
  'Odada değilsin.': "You're not in the room.",
  'Oyun başladıktan sonra format değişmez': "The format can't change once the game has started",
  'Oyun başlamış, odaya katılınamaz': "The game has started, you can't join the room",
  'Oyun zaten başlamış': 'The game has already started',
  'Pas hakkın kalmadı': 'You have no passes left',
  'Pas yalnızca açılış evresinde geçilir': 'You can only pass during the opening phase',
  'Rövanş ancak oyun bitince teklif edilir': 'A rematch can only be proposed after the game ends',
  'Rövanş için kabul eden kimse yok': 'Nobody has accepted the rematch',
  'Rövanşı sadece teklif eden başlatabilir': 'Only the player who proposed can start the rematch',
  'Sadece host başlatabilir': 'Only the host can start',
  'Sunucu hatası, tekrar dene.': 'Server error, please try again.',
  'Takma ad boş olamaz': "Nickname can't be empty",
  'Takımın bot kontrolünde.': 'Your team is controlled by a bot.',
  'Teklif eden kabulünü geri çekemez — daveti iptal et':
    "The proposer can't withdraw their acceptance — cancel the invite instead",
  'Teklif pozitif bir tam sayı olmalı': 'The bid must be a positive whole number',
  'Turnuva formatı 2, 4 ya da 8 takım olabilir': 'The tournament format can be 2, 4 or 8 teams',
  'Yerine bot geçti, bu oyuna geri dönemezsin':
    "A bot has taken your place, you can't return to this game",
  'Çok hızlı istek, biraz bekle.': 'Too many requests, please wait a moment.',
  'Şu an aktif bir açık artırma yok': 'There is no active auction right now',
  'Şu an oynanan bir seri penaltı yok.': 'There is no penalty shootout in progress.',
};

/** Değişken parçalı mesajlar (sunucu kodundaki şablonların birebir kalıbı). */
const PATTERNS: ReadonlyArray<[RegExp, (...m: string[]) => string]> = [
  [/^(GK|DEF|MID|FWD) kadron dolu$/, (pos) => `Your ${pos} slots are full`],
  [/^Açılış en az (\d+)M olmalı$/, (n) => `The opening bid must be at least ${n}M`],
  [/^Bütçen yetmiyor \(kalan (-?\d+)M\)$/, (n) => `Not enough budget (${n}M left)`],
  [/^En az (\d+)M teklif vermelisin$/, (n) => `You must bid at least ${n}M`],
  [/^En fazla (\d+) oyuncu$/, (n) => `At most ${n} players`],
  [/^Oda dolu \(en fazla (\d+) kişi\)$/, (n) => `The room is full (max ${n} players)`],
  [
    /^Odada (\d+) oyuncu var, (\d+) takımlık turnuvaya sığmaz$/,
    (h, s) => `There are ${h} players in the room, too many for a ${s}-team tournament`,
  ],
  [
    /^Rövanş sensiz başladı\. İstersen (\S+) koduyla lobiye yeniden katılabilirsin\.$/,
    (code) => `The rematch started without you. You can rejoin the lobby with code ${code}.`,
  ],
  [/^Takma ad en fazla (\d+) karakter$/, (n) => `Nickname can be at most ${n} characters`],
];

export function parseLang(raw: unknown): Lang {
  return LANGS.includes(raw as Lang) ? (raw as Lang) : DEFAULT_LANG;
}

/** Türkçe sunucu mesajını istenen dile çevirir; bilinmiyorsa aynen döner. */
export function localize(message: string, lang: Lang | undefined): string {
  if (lang !== 'en') return message;
  const exact = EXACT[message];
  if (exact) return exact;
  for (const [re, fn] of PATTERNS) {
    const m = re.exec(message);
    if (m) return fn(...m.slice(1));
  }
  return message;
}

/** Çeviri tablosu tam mı? (`scripts/checkServerI18n.ts` kullanır.) */
export function hasTranslation(message: string): boolean {
  return message in EXACT || PATTERNS.some(([re]) => re.test(message));
}

type AnyListener = (...args: unknown[]) => unknown;

/**
 * Soketin dilini izle ve çıkan kullanıcı mesajlarını çevir. `hardenSocket`
 * SONRASI çağrılmalı (onun zırhlı `on`'unu sarar).
 */
export function localizeSocket(socket: TypedSocket): void {
  const auth = socket.handshake.auth as { lang?: unknown } | undefined;
  socket.data.lang = parseLang(auth?.lang);

  const lang = () => socket.data.lang;

  // 1) Ack cevapları: `{ ok: false, error }`.
  const baseOn = socket.on.bind(socket) as (event: string, listener: AnyListener) => TypedSocket;
  const localizedOn = (event: string, listener: AnyListener): TypedSocket =>
    baseOn(event, (...args: unknown[]) => {
      const last = args[args.length - 1];
      if (typeof last === 'function') {
        const ack = last as (res: unknown) => void;
        args[args.length - 1] = (res: unknown) => {
          if (
            res &&
            typeof res === 'object' &&
            typeof (res as { error?: unknown }).error === 'string'
          ) {
            const r = res as { error: string };
            ack({ ...r, error: localize(r.error, lang()) });
          } else {
            ack(res);
          }
        };
      }
      return listener(...args);
    });
  (socket as unknown as { on: typeof localizedOn }).on = localizedOn;

  // 2) Sunucunun bu sokete yolladığı metinli olaylar.
  const baseEmit = socket.emit.bind(socket) as (event: string, ...args: unknown[]) => boolean;
  (socket as unknown as { emit: typeof baseEmit }).emit = (event: string, ...args: unknown[]) => {
    const payload = args[0] as Record<string, unknown> | undefined;
    if (event === 'room:error' && typeof payload?.message === 'string') {
      args[0] = { ...payload, message: localize(payload.message, lang()) };
    } else if (event === 'room:kicked' && typeof payload?.reason === 'string') {
      args[0] = { ...payload, reason: localize(payload.reason, lang()) };
    }
    return baseEmit(event, ...args);
  };

  socket.on('client:setLang', (payload) => {
    socket.data.lang = parseLang((payload as { lang?: unknown } | undefined)?.lang);
  });
}
