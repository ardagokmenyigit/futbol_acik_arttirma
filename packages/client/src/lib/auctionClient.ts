import type { AckResult, Bid } from '@fal/shared';
import { socket } from '../socket.js';

/** Teklif gönderir; sunucu reddederse Promise reject olur. */
export function placeBid(amount: number): Promise<{ highestBid: Bid }> {
  return new Promise((resolve, reject) => {
    socket.emit('auction:bid', { amount }, (res: AckResult<{ highestBid: Bid }>) => {
      if (res.ok) resolve(res.data);
      else reject(new Error(res.error));
    });
  });
}
