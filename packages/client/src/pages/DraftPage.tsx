import type { RoomState } from '@fal/shared';
import { selectYou, useRoomStore } from '../store.js';

interface Props {
  room: RoomState;
}

/**
 * Yer tutucu — asıl draft ekranı (aktif futbolcu kartı, canlı teklif geçmişi,
 * geri sayım, bütçe göstergesi) açık artırma motoru göreviyle birlikte gelecek.
 */
export function DraftPage({ room }: Props) {
  const you = useRoomStore(selectYou);

  return (
    <div className="stack">
      <h1>Draft başladı</h1>
      <div className="panel stack">
        <p className="muted">
          Oyun <code>draft</code> fazına geçti. Açık artırma round döngüsü bir sonraki adımda
          (auction motoru) devreye girecek.
        </p>
        <p>
          Bütçen: <strong>{you?.budget ?? room.config.startingBudget}M</strong> · Kadro hedefi:{' '}
          <strong>{room.config.squadSize}</strong> oyuncu
        </p>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Kadro dağılımı: GK {room.config.squad.GK} · DEF {room.config.squad.DEF} · MID{' '}
          {room.config.squad.MID} · FWD {room.config.squad.FWD}
        </p>
      </div>
    </div>
  );
}
