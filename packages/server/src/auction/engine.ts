import type { AckResult, Bid, Footballer, Participant, RoomState } from '@fal/shared';
import { runLeague } from '../league/runLeague.js';
import { roomStore } from '../rooms/roomStore.js';
import type { TypedServer, TypedSocket } from '../socketTypes.js';
import { runTournament } from '../tournament/runTournament.js';
import { botBidDelayMs, botOpeningBid, decideBotBid } from './bot.js';
import { buildDraftPool, findFootballer } from './pool.js';
import { buildTurnOrders, type TurnOrderPlan } from './turnOrder.js';
import { bidFloor, positionCount, validateBid } from './validateBid.js';

/**
 * ============================================================================
 *  AÇIK ARTIRMA MOTORU
 * ----------------------------------------------------------------------------
 *  YAPI
 *  - Draft `squadSize × katılımcı` TUR sürer (4 oyuncu × 7 kadro = 28 tur).
 *  - Draft havuzu önceden seçilir ve pozisyon başına TAM OLARAK ihtiyaç kadar
 *    futbolcu içerir (4 kaleci, 8 defans, 8 orta saha, 8 forvet). Arz talebe
 *    denk: her tur satılır, herkes tam kadroyla biter (28 satış, kişi başı
 *    tavan 7 → aritmetik zorunluluk).
 *  - Her tur, havuzdan bir futbolcunun açık artırmasıdır.
 *
 *  AKIŞ (tur başına iki evre)
 *  1. `opening` — o turun sırasındaki ilk UYGUN katılımcı açılış teklifini
 *     vermek ZORUNDADIR. Süresi dolarsa sunucu onun adına asgari açılışı
 *     yapar. Böylece her turda mutlaka gerçek bir teklif olur.
 *  2. `bidding` — teklif serbest; pozisyona girebilen herkes teklif verebilir.
 *     PAS HAKKI YOK: istemeyen teklif vermez, fikri değişirse geri girer.
 *     Süre bitiminde en yüksek teklif kazanır. Son saniye teklifi mümkün
 *     olduğu için anti-snipe devrede.
 *
 *  TABAN FİYAT YOK: açılış `minBidIncrement` kadardır, fiyatı rekabet belirler.
 *
 *  Sıra yalnızca açılışı belirler ve sıra numaralarının toplamı tüm
 *  katılımcılar için eşittir (bkz. turnOrder.ts).
 *
 *  Sunucu tek doğruluk kaynağıdır (CLAUDE.md §5): istemci yalnızca gösterir.
 * ============================================================================
 */

const TICK_MS = 1000;

/**
 * Serbest teklif evresinde bitişe bu süreden az kala gelen teklif turu uzatır.
 * Rakibin karşılık verebilmesi için garanti edilen süre.
 */
const ANTI_SNIPE_MS = 5000;

/** Bir turda TEK BİR botun verebileceği teklif sayısı. */
const MAX_BIDS_PER_BOT_PER_ROUND = 10;

/** Patolojik döngülere karşı tur başına mutlak tavan (normalde bağlamaz). */
const MAX_BOT_BIDS_PER_ROUND = 60;

interface RoomTimers {
  tick: NodeJS.Timeout | null;
  /** Evrenin (opening ya da bidding) bitiş zamanlayıcısı. */
  end: NodeJS.Timeout | null;
  /** Bekleyen bot "düşünme" zamanlayıcıları. */
  bots: NodeJS.Timeout[];
  botBids: number;
  botBidCount: Map<string, number>;
}

interface DraftRuntime {
  plan: TurnOrderPlan;
  /** 0 tabanlı tur indeksi. */
  turIndex: number;
  timers: RoomTimers;
}

const runtimes = new Map<string, DraftRuntime>();

function freshTimers(): RoomTimers {
  return { tick: null, end: null, bots: [], botBids: 0, botBidCount: new Map() };
}

function clearTimers(t: RoomTimers): void {
  if (t.tick) clearInterval(t.tick);
  if (t.end) clearTimeout(t.end);
  for (const b of t.bots) clearTimeout(b);
  t.tick = null;
  t.end = null;
  t.bots = [];
}

/** Oda silinince / draft yarıda kalınca timer'ları temizle. */
export function cancelAuction(roomId: string): void {
  const rt = runtimes.get(roomId);
  if (!rt) return;
  clearTimers(rt.timers);
  runtimes.delete(roomId);
}

/** Lobi 'start' sonrası: draft havuzunu kur, sıraları üret, ilk turu başlat. */
export function beginDraft(io: TypedServer, roomId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room || room.phase !== 'draft') return;

  const n = room.participants.length;
  const pool = buildDraftPool(room.config, n);
  room.remainingPoolIds = pool.map((f) => f.id);

  const totalRounds = room.config.squadSize * n;
  const plan = buildTurnOrders(
    room.participants.map((p) => p.id),
    totalRounds,
  );
  runtimes.set(roomId, { plan, turIndex: -1, timers: freshTimers() });

  console.log(
    `[auction] ${roomId}: ${n} katılımcı · ${totalRounds} tur · havuz ${pool.length} futbolcu · ` +
      `sıra toplamları ${JSON.stringify(plan.sums)} (fark ${plan.spread}${plan.perfectlyFair ? ' — TAM ADALET' : ''})`,
  );
  startNextRound(io, roomId);
}

/* --------------------------- tur yönetimi --------------------------- */

/** Bu katılımcı bu futbolcuyu kadrosuna alabilir mi? (bütçe kapı değil) */
function canTake(room: RoomState, p: Participant, f: Footballer): boolean {
  return (
    p.squad.length < room.config.squadSize &&
    positionCount(p, f.position) < room.config.squad[f.position]
  );
}

function everySquadFull(room: RoomState): boolean {
  return room.participants.every((p) => p.squad.length >= room.config.squadSize);
}

function startNextRound(io: TypedServer, roomId: string): void {
  const room = roomStore.getRoom(roomId);
  const rt = runtimes.get(roomId);
  if (!room || !rt) return;
  clearTimers(rt.timers);
  rt.timers = freshTimers();

  if (everySquadFull(room)) {
    finishDraft(io, room);
    return;
  }

  rt.turIndex += 1;
  const order = rt.plan.orders[rt.turIndex] ?? room.participants.map((p) => p.id);

  // AÇILIŞ SIRASI: sıradaki, kadrosu HÂLÂ EKSİK olan ilk katılımcı.
  const opener = order
    .map((id) => room.participants.find((p) => p.id === id))
    .find((p): p is Participant => !!p && p.squad.length < room.config.squadSize);
  if (!opener) {
    finishDraft(io, room);
    return;
  }

  // Futbolcu, AÇILIŞI YAPACAK KİŞİNİN ihtiyacına göre seçilir. Böylece
  // sıradaki kişi her zaman açılışı yapabilir (açılış sayıları eşit kalır) ve
  // "sıra sende, ihtiyacın olan bir futbolcu geliyor" sezgisi korunur.
  // Havuz tam denk olduğu için bu kimseyi mağdur etmez: herkesin ihtiyacı
  // eninde sonunda karşılanır.
  let next: Footballer | undefined;
  let nextIdx = -1;
  for (let i = 0; i < room.remainingPoolIds.length; i++) {
    const candidate = findFootballer(room.remainingPoolIds[i]!);
    if (candidate && canTake(room, opener, candidate)) {
      next = candidate;
      nextIdx = i;
      break;
    }
  }
  if (!next || nextIdx < 0) {
    finishDraft(io, room);
    return;
  }
  room.remainingPoolIds.splice(nextIdx, 1);

  const eligibleIds = room.participants.filter((p) => canTake(room, p, next!)).map((p) => p.id);
  const openerId = opener.id;

  const durationMs = room.config.turnDurationSec * 1000;
  room.auction = {
    round: rt.turIndex + 1,
    totalRounds: rt.plan.orders.length,
    footballer: next,
    turnOrder: order,
    openerId,
    phase: 'opening',
    eligibleIds,
    highestBid: null,
    endsAt: Date.now() + durationMs,
    history: [],
  };

  io.to(roomId).emit('auction:started', room.auction);
  io.to(roomId).emit('room:state', room);

  rt.timers.tick = setInterval(() => emitTick(io, roomId), TICK_MS);
  // Süre dolarsa sunucu onun adına asgari açılışı yapar (pas hakkı yok).
  rt.timers.end = setTimeout(() => autoOpen(io, roomId), durationMs);

  if (opener.isBot) {
    const handle = setTimeout(() => runBotOpening(io, roomId, openerId), botBidDelayMs(durationMs));
    rt.timers.bots.push(handle);
  }
}

/* ----------------------------- açılış ----------------------------- */

/** Açılış teklifini uygula ve serbest teklif evresine geç. */
function applyOpening(
  io: TypedServer,
  roomId: string,
  amount: number,
  auto: boolean,
): { ok: true } | { ok: false; error: string } {
  const room = roomStore.getRoom(roomId);
  const rt = runtimes.get(roomId);
  if (!room?.auction || !rt) return { ok: false, error: 'Şu an aktif bir açık artırma yok' };
  if (room.auction.phase !== 'opening') return { ok: false, error: 'Açılış evresi bitti' };

  const opener = room.participants.find((p) => p.id === room.auction!.openerId);
  if (!opener) return { ok: false, error: 'Açılışı yapacak katılımcı bulunamadı' };

  const min = room.config.minBidIncrement;
  const capped = Math.max(min, Math.min(Math.floor(amount), Math.max(min, opener.budget)));
  const paidCap = Math.min(capped, Math.max(min, opener.budget));

  const bid: Bid = { playerId: opener.id, amount: paidCap, at: Date.now() };
  room.auction.highestBid = bid;
  room.auction.history.push(bid);
  room.auction.phase = 'bidding';

  const durationMs = room.config.bidDurationSec * 1000;
  room.auction.endsAt = Date.now() + durationMs;

  clearTimers(rt.timers);
  rt.timers = freshTimers();
  rt.timers.tick = setInterval(() => emitTick(io, roomId), TICK_MS);
  rt.timers.end = setTimeout(() => endRound(io, roomId), durationMs);

  io.to(roomId).emit('auction:opened', {
    openerId: opener.id,
    amount: paidCap,
    endsAt: room.auction.endsAt,
    auto,
  });
  io.to(roomId).emit('auction:bid', { highestBid: bid, history: room.auction.history });
  io.to(roomId).emit('room:state', room);

  scheduleBotBids(io, roomId, opener.id);
  return { ok: true };
}

/** Açılış süresi doldu — sunucu asgari açılışı onun adına yapar. */
function autoOpen(io: TypedServer, roomId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room?.auction || room.auction.phase !== 'opening') return;
  applyOpening(io, roomId, room.config.minBidIncrement, true);
}

function runBotOpening(io: TypedServer, roomId: string, botId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room?.auction || room.auction.phase !== 'opening') return;
  if (room.auction.openerId !== botId) return;
  const bot = room.participants.find((p) => p.id === botId);
  if (!bot?.isBot) return;

  const amount = botOpeningBid(bot, room.auction.footballer, room.config, remainingPool(room));
  applyOpening(io, roomId, amount, false);
}

/* ------------------------------ teklif ------------------------------ */

export function handleBid(
  io: TypedServer,
  socket: TypedSocket,
  rawAmount: unknown,
  ack: (res: AckResult<{ highestBid: Bid }>) => void,
): void {
  const { roomId, playerId } = socket.data;
  if (!roomId || !playerId) {
    ack({ ok: false, error: 'Bir odada değilsin' });
    return;
  }
  const room = roomStore.getRoom(roomId);
  if (!room || room.phase !== 'draft' || !room.auction) {
    ack({ ok: false, error: 'Şu an aktif bir açık artırma yok' });
    return;
  }
  const bidder = room.participants.find((p) => p.id === playerId);
  if (!bidder) {
    ack({ ok: false, error: 'Katılımcı bulunamadı' });
    return;
  }

  // Açılış evresi: yalnızca sıradaki katılımcı ve zorunlu.
  if (room.auction.phase === 'opening') {
    if (room.auction.openerId !== playerId) {
      ack({ ok: false, error: 'Açılış teklifi sırası sende değil' });
      return;
    }
    const amount = Number(rawAmount);
    if (!Number.isInteger(amount) || amount < room.config.minBidIncrement) {
      ack({ ok: false, error: `Açılış en az ${room.config.minBidIncrement}M olmalı` });
      return;
    }
    if (amount > bidder.budget) {
      ack({ ok: false, error: `Bütçen yetmiyor (kalan ${bidder.budget}M)` });
      return;
    }
    const res = applyOpening(io, roomId, amount, false);
    if (!res.ok) {
      ack({ ok: false, error: res.error });
      return;
    }
    ack({ ok: true, data: { highestBid: room.auction.highestBid! } });
    return;
  }

  const result = applyBid(io, room, bidder, rawAmount);
  if (!result.ok) {
    ack({ ok: false, error: result.error });
    return;
  }
  ack({ ok: true, data: { highestBid: result.bid } });
}

/**
 * Serbest evrede teklifi doğrula ve uygula. İnsan ve bot aynı yoldan geçer.
 */
function applyBid(
  io: TypedServer,
  room: RoomState,
  bidder: Participant,
  rawAmount: unknown,
): { ok: true; bid: Bid } | { ok: false; error: string } {
  if (!room.auction) return { ok: false, error: 'Şu an aktif bir açık artırma yok' };

  const check = validateBid(room.auction, bidder, room.config, rawAmount);
  if (!check.ok) return { ok: false, error: check.error };

  const bid: Bid = { playerId: bidder.id, amount: check.amount, at: Date.now() };
  room.auction.highestBid = bid;
  room.auction.history.push(bid);

  if (room.auction.endsAt - Date.now() < ANTI_SNIPE_MS) {
    room.auction.endsAt = Date.now() + ANTI_SNIPE_MS;
    rescheduleEnd(io, room.roomId, ANTI_SNIPE_MS);
  }

  io.to(room.roomId).emit('auction:bid', { highestBid: bid, history: room.auction.history });
  io.to(room.roomId).emit('room:state', room);

  scheduleBotBids(io, room.roomId, bidder.id);
  return { ok: true, bid };
}

/* ------------------------------ botlar ------------------------------ */

/** Draft havuzunda kalan futbolcular — bot değerlemesi için referans. */
function remainingPool(room: RoomState): Footballer[] {
  const out: Footballer[] = [];
  for (const id of room.remainingPoolIds) {
    const f = findFootballer(id);
    if (f) out.push(f);
  }
  return out;
}

function scheduleBotBids(io: TypedServer, roomId: string, exceptId?: string): void {
  const room = roomStore.getRoom(roomId);
  const rt = runtimes.get(roomId);
  if (!room?.auction || !rt) return;
  if (room.auction.phase !== 'bidding') return;
  if (rt.timers.botBids >= MAX_BOT_BIDS_PER_ROUND) return;

  const remainingMs = room.auction.endsAt - Date.now();
  for (const p of room.participants) {
    if (!p.isBot || p.id === exceptId) continue;
    if (!room.auction.eligibleIds.includes(p.id)) continue;
    if ((rt.timers.botBidCount.get(p.id) ?? 0) >= MAX_BIDS_PER_BOT_PER_ROUND) continue;
    const delay = botBidDelayMs(remainingMs);
    if (delay >= remainingMs) continue;
    rt.timers.bots.push(setTimeout(() => runBotTurn(io, roomId, p.id), delay));
  }
}

function runBotTurn(io: TypedServer, roomId: string, botId: string): void {
  const room = roomStore.getRoom(roomId);
  const rt = runtimes.get(roomId);
  if (!room?.auction || !rt) return;
  if (room.auction.phase !== 'bidding') return;
  if (rt.timers.botBids >= MAX_BOT_BIDS_PER_ROUND) return;

  const bot = room.participants.find((p) => p.id === botId);
  if (!bot?.isBot) return;

  const own = rt.timers.botBidCount.get(botId) ?? 0;
  if (own >= MAX_BIDS_PER_BOT_PER_ROUND) return;

  const amount = decideBotBid(
    bot,
    room.auction.footballer,
    room.config,
    remainingPool(room),
    room.auction.highestBid,
    bidFloor(room.auction, room.config),
  );
  if (amount === null) return;

  rt.timers.botBids += 1;
  rt.timers.botBidCount.set(botId, own + 1);
  const res = applyBid(io, room, bot, amount);
  if (!res.ok) {
    rt.timers.botBids -= 1;
    rt.timers.botBidCount.set(botId, own);
  }
}

/* ----------------------------- sonuçlanma ----------------------------- */

function emitTick(io: TypedServer, roomId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room?.auction) return;
  io.to(roomId).emit('auction:tick', {
    round: room.auction.round,
    remainingMs: Math.max(0, room.auction.endsAt - Date.now()),
  });
}

function rescheduleEnd(io: TypedServer, roomId: string, inMs: number): void {
  const rt = runtimes.get(roomId);
  if (!rt) return;
  if (rt.timers.end) clearTimeout(rt.timers.end);
  rt.timers.end = setTimeout(() => endRound(io, roomId), inMs);
}

function endRound(io: TypedServer, roomId: string): void {
  const room = roomStore.getRoom(roomId);
  const rt = runtimes.get(roomId);
  if (!room?.auction || !rt) return;
  clearTimers(rt.timers);

  const { footballer, highestBid, round } = room.auction;
  // Açılış zorunlu olduğu için burada her zaman bir teklif vardır.
  const winner = highestBid
    ? room.participants.find((p) => p.id === highestBid.playerId)
    : undefined;
  const amount = winner && highestBid ? Math.min(winner.budget, highestBid.amount) : 0;

  if (winner) {
    winner.budget -= amount;
    winner.squad.push(footballer);
  }

  io.to(roomId).emit('auction:won', {
    round,
    footballerId: footballer.id,
    footballerName: footballer.name,
    winnerId: winner?.id ?? null,
    winnerNickname: winner?.nickname ?? null,
    amount: winner ? amount : 0,
  });
  io.to(roomId).emit('room:state', room);

  startNextRound(io, roomId);
}

/** Ayrılan oyuncu açılışı tıkamasın / lider değilse teklifi düşür. */
export function dropBidderIfLeading(io: TypedServer, roomId: string, playerId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room?.auction) return;
  if (room.auction.phase === 'opening' && room.auction.openerId === playerId) {
    autoOpen(io, roomId);
    return;
  }
  if (room.auction.highestBid?.playerId === playerId) {
    room.auction.highestBid = null;
    io.to(roomId).emit('auction:bid', { highestBid: null, history: room.auction.history });
    io.to(roomId).emit('room:state', room);
  }
}

/**
 * Draft biterken eksik kalan kadroları tamamlar (güvenlik ağı). Havuz tam denk
 * olduğu için normalde devreye girmez.
 */
function autoCompleteSquads(room: RoomState): void {
  const used = new Set(room.participants.flatMap((p) => p.squad.map((f) => f.id)));
  const pool = buildDraftPool(room.config, room.participants.length).filter((f) => !used.has(f.id));

  for (const p of room.participants) {
    for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as const) {
      while (positionCount(p, pos) < room.config.squad[pos]) {
        const idx = pool.findIndex((f) => f.position === pos);
        if (idx < 0) break;
        p.squad.push(pool[idx]!);
        pool.splice(idx, 1);
      }
    }
  }
}

function finishDraft(io: TypedServer, room: RoomState): void {
  cancelAuction(room.roomId);
  room.auction = null;
  autoCompleteSquads(room);
  room.phase = 'simulation';
  io.to(room.roomId).emit('room:state', room);
  io.to(room.roomId).emit('auction:finished', room);

  if (room.config.tournamentSize) {
    runTournament(io, room.roomId);
  } else {
    runLeague(io, room.roomId);
  }
}
