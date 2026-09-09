import { useEffect, useMemo, useState } from 'react';
import type { Position, RoomState } from '@fal/shared';
import { placeBid } from '../lib/auctionClient.js';
import { selectYou, useRoomStore } from '../store.js';

interface Props {
  room: RoomState;
}

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
const RING_R = 27;
const RING_C = 2 * Math.PI * RING_R;

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
        <div>
          <div className="kicker">Açık Artırma</div>
          <h1>Draft</h1>
        </div>
        {lastWon && <WonBanner text={wonText(lastWon)} />}
        <div className="panel">
          <p className="muted">Sıradaki futbolcu hazırlanıyor…</p>
        </div>
      </div>
    );
  }

  const f = auction.footballer;
  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
  const totalMs = Math.max(1, room.config.bidDurationSec * 1000);
  const progress = Math.max(0, Math.min(1, remainingMs / totalMs));
  const ringColor = secs <= 5 ? 'var(--danger)' : 'var(--accent)';

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
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="kicker">Açık Artırma</div>
          <h1>Round {auction.round}</h1>
        </div>
        <div className="countdown">
          <svg width="66" height="66" viewBox="0 0 66 66">
            <circle cx="33" cy="33" r={RING_R} fill="none" stroke="#25324a" strokeWidth="5" />
            <circle
              cx="33"
              cy="33"
              r={RING_R}
              fill="none"
              stroke={ringColor}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - progress)}
              transform="rotate(-90 33 33)"
              style={{ transition: 'stroke-dashoffset 0.4s linear' }}
            />
          </svg>
          <span className="num">{secs}</span>
        </div>
      </div>

      {lastWon && <WonBanner text={wonText(lastWon)} />}

      <div className="hero-card">
        <div className="hero-inner">
          <div
            className="row"
            style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
          >
            <div>
              <div className="display" style={{ fontSize: '1.6rem', lineHeight: 1 }}>
                {f.name}
              </div>
              <div className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                Başlangıç {f.basePrice}M
              </div>
            </div>
            <span className="pill">{f.position}</span>
          </div>

          <div className="statgrid">
            <StatBar label="GEN" value={f.overall} />
            <StatBar label="HÜC" value={f.attack} />
            <StatBar label="DEF" value={f.defense} />
          </div>

          <div className="hi-bid">
            {auction.highestBid ? (
              <>
                <span className="kicker">En yüksek</span>
                <span className="amount">{auction.highestBid.amount}M</span>
                {leaderNick && <span className="muted">— {leaderNick}</span>}
              </>
            ) : (
              <span className="muted">Henüz teklif yok · başlangıç {f.basePrice}M</span>
            )}
          </div>
        </div>
      </div>

      <div className="panel stack">
        <label htmlFor="bid">Teklifin — kalan bütçe {you.budget}M</label>
        <div className="row" style={{ gap: 8 }}>
          <input
            id="bid"
            type="text"
            inputMode="numeric"
            value={String(amount)}
            style={{ maxWidth: 74, textAlign: 'center' }}
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
        <div className="postiles">
          {POSITIONS.map((pos) => {
            const met = squadCount(pos) >= room.config.squad[pos];
            return (
              <div key={pos} className={`postile${met ? ' met' : ''}`}>
                <div className="pos">{pos}</div>
                <div className="count">
                  {squadCount(pos)}/{room.config.squad[pos]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <label>Rakipler</label>
        {room.participants
          .filter((p) => p.id !== you.id)
          .map((p) => (
            <div key={p.id} className="hist-row" style={{ padding: '3px 0' }}>
              <span>
                <span className={`dot ${p.connected ? 'on' : 'off'}`} />
                {p.nickname}
              </span>
              <span className="muted" style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>
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
              <div key={`${b.at}-${i}`} className="hist-row" style={{ padding: '3px 0' }}>
                <span className={i === 0 ? undefined : 'muted'}>{nick}</span>
                <span
                  className={i === 0 ? 'display' : 'muted'}
                  style={i === 0 ? { color: 'var(--accent)' } : undefined}
                >
                  {b.amount}M
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="stat">
      <div className="stat-head">
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <div className="stat-track">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function WonBanner({ text }: { text: string }) {
  return (
    <div className="banner">
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
      <span>{text}</span>
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
