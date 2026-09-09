import type { TypedServer, TypedSocket } from '../socketTypes.js';
import { handleBid } from './engine.js';

export { beginDraft, cancelAuction, dropBidderIfLeading } from './engine.js';
export { loadFootballers } from './pool.js';

/** Bir socket için `auction:*` handler'larını bağlar. */
export function registerAuctionHandlers(io: TypedServer, socket: TypedSocket): void {
  socket.on('auction:bid', ({ amount }, ack) => {
    handleBid(io, socket, amount, ack);
  });
}
