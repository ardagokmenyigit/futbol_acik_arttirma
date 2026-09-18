import type { ClientToServerEvents } from '@fal/shared';
import type { TypedSocket } from './socketTypes.js';

/**
 * ============================================================================
 *  SOKET SAĞLAMLAŞTIRMA — bozuk / kötü niyetli istemci sunucuyu düşüremez
 * ----------------------------------------------------------------------------
 *  Socket.io dinleyici içindeki istisnayı yakalamaz: `ack` bekleyen bir
 *  event'e ack'siz gelen TEK paket (`ack is not a function`) ya da handler'da
 *  patlayan herhangi bir hata süreci öldürür — yani bir istemci tüm odaları
 *  kapatabilir (18 Eylül 2026'da `tournament:penaltyChoose` ile ölçüldü, aynı
 *  açık `room:create`, `auction:bid` vb. için de geçerliydi). Üç katman:
 *
 *   1. PAKET SÜZGECİ (`socket.use`): ack bekleyen event'lere ack'siz gelen
 *      paket düşürülür; saniyede `RATE_LIMIT` üstü paket gönderen soket
 *      kısılır (canlı seride her seçim odaya `room:state` yayınlatır —
 *      spam tüm odayı sel altında bırakırdı).
 *   2. DİNLEYİCİ ZIRHI: her `socket.on` dinleyicisi try/catch'e alınır;
 *      hata loglanır, ack varsa istemciye `{ ok:false }` döner, süreç yaşar.
 *   3. SON EMNİYET (`index.ts`): `uncaughtException` / `unhandledRejection`
 *      loglanır; süreç düşmez. Bir odanın hatası diğerlerini kapatmasın.
 * ============================================================================
 */

/** Ack bekleyen istemci event'leri (`ClientToServerEvents` imzalarından). */
const ACK_EVENTS: ReadonlySet<keyof ClientToServerEvents> = new Set<keyof ClientToServerEvents>([
  'hello',
  'room:create',
  'room:join',
  'room:rejoin',
  'room:setFormat',
  'room:start',
  'room:rematchPropose',
  'room:rematchRespond',
  'room:rematchStart',
  'room:rematchCancel',
  'auction:bid',
  'auction:pass',
  'tournament:penaltyChoose',
]);

/** Soket başına saniyede izin verilen paket (meşru istemci bunun çok altında). */
const RATE_LIMIT = 40;

type AnyListener = (...args: unknown[]) => unknown;

function reportError(socketId: string, event: string, err: unknown, args: unknown[]): void {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(`[socket] ${socketId}: '${event}' dinleyicisi hata verdi:\n${message}`);
  const ack = args[args.length - 1];
  if (typeof ack === 'function') {
    try {
      (ack as (res: unknown) => void)({ ok: false, error: 'Sunucu hatası, tekrar dene.' });
    } catch {
      /* ack zaten çağrılmış olabilir */
    }
  }
}

export function hardenSocket(socket: TypedSocket): void {
  let windowStart = Date.now();
  let count = 0;

  socket.use(([event, ...args], next) => {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      count = 0;
    }
    if (++count > RATE_LIMIT) {
      if (count === RATE_LIMIT + 1) {
        console.warn(`[socket] ${socket.id}: saniyede ${RATE_LIMIT}+ paket — kısıldı`);
      }
      return; // paket düşer, dinleyici çalışmaz
    }
    if (
      ACK_EVENTS.has(event as keyof ClientToServerEvents) &&
      typeof args[args.length - 1] !== 'function'
    ) {
      console.warn(`[socket] ${socket.id}: '${event}' ack'siz geldi — düşürüldü`);
      return;
    }
    next();
  });

  // `next(err)` kullanılmıyor ama olası bir 'error' emit'i dinleyicisiz kalıp
  // EventEmitter'ı fırlatmasın.
  socket.on('error', (err) => {
    console.error(`[socket] ${socket.id}: hata`, err);
  });

  const rawOn = socket.on.bind(socket) as (event: string, listener: AnyListener) => TypedSocket;
  const guardedOn = (event: string, listener: AnyListener): TypedSocket =>
    rawOn(event, (...args: unknown[]) => {
      try {
        const out = listener(...args);
        if (out instanceof Promise) {
          out.catch((err: unknown) => reportError(socket.id, event, err, args));
        }
      } catch (err) {
        reportError(socket.id, event, err, args);
      }
    });
  // Tip imzası korunur; çalışma zamanında her dinleyici zırhlı kayıt olur.
  (socket as unknown as { on: typeof guardedOn }).on = guardedOn;
}
