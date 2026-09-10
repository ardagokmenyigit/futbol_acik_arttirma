import type { AuctionState, Participant, Position, RoomConfig } from '@fal/shared';

export type BidCheck = { ok: true; amount: number } | { ok: false; error: string };

/** Kaç adet verilen pozisyondan kadroda var. */
export function positionCount(participant: Participant, position: Position): number {
  return participant.squad.filter((f) => f.position === position).length;
}

/**
 * Verilebilecek en düşük geçerli teklif.
 *
 * TABAN FİYAT YOK: açık artırma 0'dan başlar, ilk teklif `minBidIncrement`
 * kadardır. Futbolcunun `basePrice` alanı artık hiçbir yerde kullanılmaz —
 * fiyatı tamamen rekabet belirler.
 */
export function bidFloor(auction: AuctionState, config: RoomConfig): number {
  return auction.highestBid
    ? auction.highestBid.amount + config.minBidIncrement
    : config.minBidIncrement;
}

/**
 * Teklif validasyonu (CLAUDE.md §3.1). Saf fonksiyon — sunucu durumunu
 * değiştirmez, sadece kararı döndürür.
 */
export function validateBid(
  auction: AuctionState,
  bidder: Participant,
  config: RoomConfig,
  rawAmount: unknown,
): BidCheck {
  const amount = Number(rawAmount);
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, error: 'Teklif pozitif bir tam sayı olmalı' };
  }
  if (auction.highestBid?.playerId === bidder.id) {
    return { ok: false, error: 'En yüksek teklif zaten sende' };
  }
  if (auction.phase !== 'bidding') {
    return { ok: false, error: 'Açılış teklifi bekleniyor' };
  }
  if (!auction.eligibleIds.includes(bidder.id)) {
    return { ok: false, error: 'Bu futbolcuya teklif veremezsin' };
  }

  const floor = bidFloor(auction, config);
  if (amount < floor) {
    return { ok: false, error: `En az ${floor}M teklif vermelisin` };
  }
  if (amount > bidder.budget) {
    return { ok: false, error: `Bütçen yetmiyor (kalan ${bidder.budget}M)` };
  }

  const position = auction.footballer.position;
  if (positionCount(bidder, position) >= config.squad[position]) {
    return { ok: false, error: `${position} kadron dolu` };
  }
  if (bidder.squad.length >= config.squadSize) {
    return { ok: false, error: 'Kadron dolu' };
  }
  return { ok: true, amount };
}
