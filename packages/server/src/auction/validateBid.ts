import type { AuctionState, Participant, Position, RoomConfig } from '@fal/shared';

export type BidCheck = { ok: true; amount: number } | { ok: false; error: string };

/** Kaç adet verilen pozisyondan kadroda var. */
export function positionCount(participant: Participant, position: Position): number {
  return participant.squad.filter((f) => f.position === position).length;
}

/** Bir round'da verilebilecek en düşük geçerli teklif. */
export function bidFloor(auction: AuctionState, config: RoomConfig): number {
  return auction.highestBid
    ? auction.highestBid.amount + config.minBidIncrement
    : auction.footballer.basePrice;
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
  return { ok: true, amount };
}
