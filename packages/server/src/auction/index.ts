import type { TypedServer, TypedSocket } from '../socketTypes.js';
import { handleBid, handlePass } from './engine.js';

export { beginDraft, cancelAuction, dropBidderIfLeading, handleBotTakeover } from './engine.js';
export { loadFootballers } from './pool.js';
export { buildTurnOrders } from './turnOrder.js';

/** Bir socket için `auction:*` handler'larını bağlar. */
export function registerAuctionHandlers(io: TypedServer, socket: TypedSocket): void {
  socket.on('auction:bid', ({ amount }, ack) => {
    handleBid(io, socket, amount, ack);
  });
  socket.on('auction:pass', (ack) => {
    handlePass(io, socket, ack);
  });
}
