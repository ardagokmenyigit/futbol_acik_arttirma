import { useEffect, useMemo, useState } from 'react';
import type { Position, RoomState } from '@fal/shared';
import { placeBid } from '../lib/auctionClient.js';
import { selectYou, useRoomStore } from '../store.js';

interface Props {
  room: RoomState;
}

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];

export function DraftPage({ room }: Props) {
  const you = useRoomStore(selectYou);
  const remainingMs = useRoomStore((s) => s.remainingMs);
  const lastWon = useRoomStore((s) => s.lastWon);

  const auction = room.auction;
  const minInc = room.config.minBidIncrement;

  const floor = useMemo(() => {
    if (!auction) return 0;
    return auction.highestBid ? auction.highestBid.amount + minInc : auction.footballer.basePrice;
  }, [auction, minInc]);

  const [amount, setAmount] = useState(floor);
  const [bidError, setBidError] = useState<string | null>(null);

  // Taban teklif değişince input'u ona hizala.
  useEffect(() => {
    setAmount(floor);
    setBidError(null);
  }, [floor]);

  if (!you) return null;

  const squadCount = (pos: Position) => you.squad.filter((f) => f.position === pos).length;

  if (!auction) {
    return (
      <div className="stack">
        <h1>Draft</h1>
        <div className="panel">
          <p className="muted">Sıradaki futbolcu hazırlanıyor…</p>
          {lastWon && <WonLine text={wonText(lastWon)} />}
        </div>
      </div>
    );
  }

  const f = auction.footballer;
  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
  const leaderNick =
    room.participants.find((p) => p.id === auction.highestBid?.playerId)?.nickname ?? null;
  const youAreLeading = auction.highestBid?.playerId === you.id;
  const posFull = squadCount(f.position) >= room.config.squad[f.position];
  const budgetShort = floor > you.budget;
  const canBid = !youAreLeading && !posFull && !budgetShort && secs > 0;

  async function submitBid() {
    setBidError(null);
    try {
      await placeBid(amount);
    } catch (err) {
      setBidError(err instanceof Error ? err.message : 'Teklif reddedildi');
    }
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Round {auction.round}</h1>
        <span className="code-badge" style={{ fontSize: '1.1rem' }}>
          {secs}s
        </span>
      </div>

      {lastWon && <WonLine text={wonText(lastWon)} />}

      <div className="panel stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong style={{ fontSize: '1.2rem' }}>{f.name}</strong>
          <span className="tag">{f.position}</span>
        </div>
        <div className="row muted" style={{ gap: 16, fontSize: '0.9rem' }}>
          <span>Genel {f.overall}</span>
          <span>Hücum {f.attack}</span>
          <span>Defans {f.defense}</span>
          <span>Hız {f.pace}</span>
          <span>Kondisyon {f.stamina}</span>
        </div>
        <div>
          {auction.highestBid ? (
            <span>
              En yüksek: <strong>{auction.highestBid.amount}M</strong>
              {leaderNick && <span className="muted"> — {leaderNick}</span>}
            </span>
          ) : (
            <span className="muted">Henüz teklif yok · başlangıç {f.basePrice}M</span>
          )}
        </div>
      </div>

      <div className="panel stack">
        <label htmlFor="bid">Teklifin (kalan bütçe {you.budget}M)</label>
        <div className="row">
          <input
            id="bid"
            type="text"
            inputMode="numeric"
            value={String(amount)}
            style={{ maxWidth: 120 }}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9]/g, ''));
              setAmount(Number.isFinite(n) ? n : 0);
            }}
          />
          <button onClick={() => setAmount(floor)}>min {floor}M</button>
          <button onClick={() => setAmount(Math.min(floor + 1, you.budget))}>+1</button>
          <button onClick={() => setAmount(Math.min(floor + 5, you.budget))}>+5</button>
          <button
            className="primary"
            disabled={!canBid || amount < floor}
            onClick={() => void submitBid()}
          >
            Teklif ver
          </button>
        </div>
        {youAreLeading && <p className="muted">En yüksek teklif sende.</p>}
        {posFull && (
          <p className="muted">{f.position} kadron dolu — bu futbolcuya teklif veremezsin.</p>
        )}
        {budgetShort && !posFull && <p className="muted">Bütçen bu round için yetmiyor.</p>}
        {bidError && <p className="error">{bidError}</p>}
      </div>

      <div className="panel">
        <label>
          Kadron — {you.squad.length}/{room.config.squadSize}
        </label>
        <div className="row" style={{ gap: 14 }}>
          {POSITIONS.map((pos) => (
            <span key={pos} className={squadCount(pos) >= room.config.squad[pos] ? '' : 'muted'}>
              {pos} {squadCount(pos)}/{room.config.squad[pos]}
            </span>
          ))}
        </div>
      </div>

      <div className="panel">
        <label>Rakipler</label>
        {room.participants
          .filter((p) => p.id !== you.id)
          .map((p) => (
            <div key={p.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                <span className={`dot ${p.connected ? 'on' : 'off'}`} />
                {p.nickname}
              </span>
              <span className="muted">
                {p.budget}M · {p.squad.length}/{room.config.squadSize}
              </span>
            </div>
          ))}
      </div>

      <div className="panel">
        <label>Teklif geçmişi</label>
        {auction.history.length === 0 && <p className="muted">—</p>}
        {[...auction.history]
          .reverse()
          .slice(0, 6)
          .map((b, i) => {
            const nick = room.participants.find((p) => p.id === b.playerId)?.nickname ?? '?';
            return (
              <div key={`${b.at}-${i}`} className="row" style={{ justifyContent: 'space-between' }}>
                <span>{nick}</span>
                <span>{b.amount}M</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function WonLine({ text }: { text: string }) {
  return (
    <div className="panel" style={{ padding: '10px 14px', borderColor: 'var(--accent)' }}>
      {text}
    </div>
  );
}

function wonText(w: {
  footballerName: string;
  winnerNickname: string | null;
  amount: number;
}): string {
  if (!w.winnerNickname) return `${w.footballerName} satılmadı (teklif gelmedi).`;
  return `${w.winnerNickname}, ${w.footballerName} oyuncusunu ${w.amount}M'ye aldı.`;
}
