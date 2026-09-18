import type { AckResult, PenaltyDirection } from '@fal/shared';
import { socket } from '../socket.js';

/**
 * Canlı seri penaltıda köşe seç (atıcıysan vuruş köşesi, kaleciysen uzanış).
 * Süre dolana kadar yeniden gönderilebilir; sunucu reddederse Promise reject olur.
 */
export function choosePenalty(
  matchId: string,
  kickIndex: number,
  direction: PenaltyDirection,
): Promise<{ role: 'shooter' | 'keeper' }> {
  return new Promise((resolve, reject) => {
    socket.emit(
      'tournament:penaltyChoose',
      { matchId, kickIndex, direction },
      (res: AckResult<{ role: 'shooter' | 'keeper' }>) => {
        if (res.ok) resolve(res.data);
        else reject(new Error(res.error));
      },
    );
  });
}
