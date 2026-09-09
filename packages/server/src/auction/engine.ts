import type { AckResult, Bid, Footballer, Participant, RoomState } from '@fal/shared';
import { runLeague } from '../league/runLeague.js';
import { roomStore } from '../rooms/roomStore.js';
import type { TypedServer, TypedSocket } from '../socketTypes.js';
import { runTournament } from '../tournament/runTournament.js';
import { botBidDelayMs, decideBotBid } from './bot.js';
import { findFootballer, loadFootballers, shuffled } from './pool.js';
import { bidFloor, positionCount, validateBid } from './validateBid.js';

const TICK_MS = 1000;
/**
 * Bitişe bu süreden az kala gelen teklif turu uzatır (sniping önleme).
 * Teklif sonrası rakibin karşılık verebilmesi için garanti edilen süre.
 */
const ANTI_SNIPE_MS = 5000;

/** Bir turda botların verebileceği toplam teklif sayısı (sonsuz savaş kilidi). */
const MAX_BOT_BIDS_PER_ROUND = 14;

interface RoomTimers {
  tick: NodeJS.Timeout;
  end: NodeJS.Timeout;
  /** Bekleyen bot "düşünme" zamanlayıcıları — tur bitince temizlenir. */
  bots: NodeJS.Timeout[];
  /** Bu turda botların verdiği teklif sayısı. */
  botBids: number;
}
const timers = new Map<string, RoomTimers>();

/** Lobi 'start' sonrası: havuzu karıştır, ilk round'u başlat. */
export function beginDraft(io: TypedServer, roomId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room || room.phase !== 'draft') return;
  room.remainingPoolIds = shuffled(loadFootballers().map((f) => f.id));
  startNextRound(io, roomId);
}

/** Oda silinince / draft yarıda kalınca timer'ları temizle. */
export function cancelAuction(roomId: string): void {
  const t = timers.get(roomId);
  if (!t) return;
  clearInterval(t.tick);
  clearTimeout(t.end);
  for (const b of t.bots) clearTimeout(b);
  timers.delete(roomId);
}

/** Ayrılan oyuncu aktif turda en yüksek teklif sahibiyse teklifi düşür. */
export function dropBidderIfLeading(io: TypedServer, roomId: string, playerId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room?.auction || room.auction.highestBid?.playerId !== playerId) return;
  room.auction.highestBid = null;
  io.to(roomId).emit('auction:bid', { highestBid: null, history: room.auction.history });
  io.to(roomId).emit('room:state', room);
}

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

  const result = applyBid(io, room, bidder, rawAmount);
  if (!result.ok) {
    ack({ ok: false, error: result.error });
    return;
  }
  ack({ ok: true, data: { highestBid: result.bid } });
}

/**
 * Teklifi doğrula ve uygula. İnsan (handleBid) ve bot (runBotTurn) aynı
 * yoldan geçer — kural tek yerde durur.
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

  // Teklif geldi — diğer botlar karşılık vermeyi düşünsün.
  scheduleBotBids(io, room.roomId, bidder.id);

  return { ok: true, bid };
}

/* ----------------------------- botlar ----------------------------- */

/** Havuzda kalan futbolcular — bot rezerv hesabı için fiyat referansı. */
function remainingPool(room: RoomState): Footballer[] {
  const out: Footballer[] = [];
  for (const id of room.remainingPoolIds) {
    const f = findFootballer(id);
    if (f) out.push(f);
  }
  return out;
}

/**
 * Aktif turdaki her bot için gecikmeli bir teklif denemesi planlar.
 * @param exceptId teklifi yeni veren katılımcı (kendi teklifine karşılık vermesin)
 */
function scheduleBotBids(io: TypedServer, roomId: string, exceptId?: string): void {
  const room = roomStore.getRoom(roomId);
  const t = timers.get(roomId);
  if (!room?.auction || !t) return;
  if (t.botBids >= MAX_BOT_BIDS_PER_ROUND) return;

  const remainingMs = room.auction.endsAt - Date.now();
  for (const p of room.participants) {
    if (!p.isBot || p.id === exceptId) continue;
    const delay = botBidDelayMs(remainingMs);
    // Tur zaten bitecekse boşuna planlama
    if (delay >= remainingMs) continue;
    const handle = setTimeout(() => runBotTurn(io, roomId, p.id), delay);
    t.bots.push(handle);
  }
}

/** Tek bir botun teklif kararı ve uygulaması. */
function runBotTurn(io: TypedServer, roomId: string, botId: string): void {
  const room = roomStore.getRoom(roomId);
  const t = timers.get(roomId);
  if (!room?.auction || !t) return;
  if (t.botBids >= MAX_BOT_BIDS_PER_ROUND) return;

  const bot = room.participants.find((p) => p.id === botId);
  if (!bot?.isBot) return;

  const amount = decideBotBid(
    bot,
    room.auction.footballer,
    room.config,
    remainingPool(room),
    room.auction.highestBid,
    bidFloor(room.auction, room.config),
  );
  if (amount === null) return;

  t.botBids += 1;
  const res = applyBid(io, room, bot, amount);
  if (!res.ok) {
    // Yarış durumu (araya insan teklifi girdi) — sessizce geç.
    t.botBids -= 1;
  }
}

/* --------------------------- iç mantık --------------------------- */

function anyoneCanUse(room: RoomState, f: Footballer): boolean {
  return room.participants.some(
    (p) =>
      p.squad.length < room.config.squadSize &&
      positionCount(p, f.position) < room.config.squad[f.position] &&
      p.budget >= f.basePrice,
  );
}

function everySquadFull(room: RoomState): boolean {
  return room.participants.every((p) => p.squad.length >= room.config.squadSize);
}

/**
 * Draft'ın sürebileceği azami tur sayısı. Bir oyuncu pasif kalır / AFK olursa
 * kadrosu hiç dolmaz ve draft havuz bitene kadar (100+ tur) sürerdi. Bu tavan,
 * oyunun makul sürede bitmesini garanti eder.
 */
function maxRounds(room: RoomState): number {
  // ×3: satılmayan turlara pay bırakır ama üst sınırı korur.
  return room.config.squadSize * room.participants.length * 3;
}

/**
 * Draft biterken eksik kalan kadroları havuzdan tamamlar. Simülasyona her
 * takımın geçerli (pozisyon kuralına uyan) bir kadroyla girmesini garanti eder.
 * Bütçe burada zorlanmaz — oyun sonu bütünlüğü teklif kuralından önce gelir.
 */
function autoCompleteSquads(room: RoomState): void {
  const used = new Set(room.participants.flatMap((p) => p.squad.map((f) => f.id)));
  const pool = loadFootballers().filter((f) => !used.has(f.id));

  for (const p of room.participants) {
    for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as const) {
      while (positionCount(p, pos) < room.config.squad[pos]) {
        // O pozisyondan en ucuz boşta futbolcuyu ata
        let pick: Footballer | undefined;
        let pickIdx = -1;
        for (let i = 0; i < pool.length; i++) {
          const f = pool[i];
          if (!f || f.position !== pos) continue;
          if (!pick || f.basePrice < pick.basePrice) {
            pick = f;
            pickIdx = i;
          }
        }
        if (!pick) break; // havuzda o pozisyondan kalmadı
        pool.splice(pickIdx, 1);
        p.squad.push(pick);
      }
    }
  }
}

function startNextRound(io: TypedServer, roomId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room) return;
  cancelAuction(roomId);

  if (everySquadFull(room)) {
    finishDraft(io, room);
    return;
  }

  // Pasif oyuncu yüzünden draft'ın sonsuza sürüklenmesini engelle.
  if ((room.auction?.round ?? 0) >= maxRounds(room)) {
    console.log(`[auction] ${roomId}: tur tavanına ulaşıldı, draft sonlandırılıyor`);
    finishDraft(io, room);
    return;
  }

  // Havuzdan kullanılabilir bir sonraki futbolcuyu çek (kimsenin
  // alamayacağı futbolcuları atla). next bulunamazsa havuz tükenmiştir.
  let next: Footballer | undefined;
  while (room.remainingPoolIds.length > 0) {
    const id = room.remainingPoolIds.shift();
    if (!id) break;
    const candidate = findFootballer(id);
    if (candidate && anyoneCanUse(room, candidate)) {
      next = candidate;
      break;
    }
  }

  if (!next) {
    finishDraft(io, room);
    return;
  }

  const round = (room.auction?.round ?? 0) + 1;
  const durationMs = room.config.bidDurationSec * 1000;
  room.auction = {
    round,
    footballer: next,
    highestBid: null,
    endsAt: Date.now() + durationMs,
    history: [],
  };

  io.to(roomId).emit('auction:started', room.auction);
  io.to(roomId).emit('room:state', room);

  const tick = setInterval(() => emitTick(io, roomId), TICK_MS);
  const end = setTimeout(() => endRound(io, roomId), durationMs);
  timers.set(roomId, { tick, end, bots: [], botBids: 0 });

  // Botlar yeni futbolcuyu değerlendirsin.
  scheduleBotBids(io, roomId);
}

function emitTick(io: TypedServer, roomId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room?.auction) return;
  io.to(roomId).emit('auction:tick', {
    round: room.auction.round,
    remainingMs: Math.max(0, room.auction.endsAt - Date.now()),
  });
}

function rescheduleEnd(io: TypedServer, roomId: string, inMs: number): void {
  const t = timers.get(roomId);
  if (!t) return;
  clearTimeout(t.end);
  t.end = setTimeout(() => endRound(io, roomId), inMs);
}

function endRound(io: TypedServer, roomId: string): void {
  const room = roomStore.getRoom(roomId);
  if (!room?.auction) return;
  cancelAuction(roomId);

  const { footballer, highestBid, round } = room.auction;
  const winner = highestBid
    ? room.participants.find((p) => p.id === highestBid.playerId)
    : undefined;

  if (highestBid && winner) {
    winner.budget -= highestBid.amount;
    winner.squad.push(footballer);
  }

  io.to(roomId).emit('auction:won', {
    round,
    footballerId: footballer.id,
    footballerName: footballer.name,
    winnerId: winner?.id ?? null,
    winnerNickname: winner?.nickname ?? null,
    amount: winner ? highestBid!.amount : 0,
  });
  io.to(roomId).emit('room:state', room);

  startNextRound(io, roomId);
}

function finishDraft(io: TypedServer, room: RoomState): void {
  cancelAuction(room.roomId);
  room.auction = null;
  // Eksik kalan kadroları tamamla — simülasyona herkes tam kadro girsin.
  autoCompleteSquads(room);
  room.phase = 'simulation';
  io.to(room.roomId).emit('room:state', room);
  io.to(room.roomId).emit('auction:finished', room);

  // Formata göre devral (phase === 'simulation').
  if (room.config.tournamentSize) {
    runTournament(io, room.roomId);
  } else {
    runLeague(io, room.roomId);
  }
}
