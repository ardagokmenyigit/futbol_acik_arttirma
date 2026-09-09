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

  useEffect(() => {
    setAmount(floor);
    setBidError(null);
  }, [floor]);

  if (!you) return null;

  const squadCount = (pos: Position) => you.squad.filter((f) => f.position === pos).length;

  if (!auction) {
    return (
      <div className="panel crimson">
        <div className="round-label">Açık Artırma</div>
        <h1 style={{ fontSize: 30, marginBottom: 16 }}>Draft</h1>
        {lastWon && <Ticker text={wonText(lastWon)} />}
        <p className="footnote">Sıradaki futbolcu için hazırlanıyor…</p>
      </div>
    );
  }

  const f = auction.footballer;
  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
  const totalMs = Math.max(1, room.config.bidDurationSec * 1000);
  const progress = Math.max(0, Math.min(1, remainingMs / totalMs));
  const ringLead = secs <= 5 ? 'var(--crimson)' : 'var(--gold)';
  const deg = Math.round(progress * 360);

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
      <div className="panel crimson">
        <div className="live-head">
          <div>
            <div className="round-label">Tur {auction.round}</div>
            <h1>Açık Artırma</h1>
          </div>
          <div
            className="timer-ring"
            style={{
              background: `conic-gradient(${ringLead} 0deg ${deg}deg, var(--panel-raised) ${deg}deg 360deg)`,
              transition: 'background 0.4s linear',
            }}
          >
            <div className="timer-ring-inner">{secs}</div>
          </div>
        </div>

        {lastWon && <Ticker text={wonText(lastWon)} />}

        <div className="player-card">
          <div className="player-top">
            <span className="player-name">{f.name}</span>
            <span className="position-chip">{f.position}</span>
          </div>
          <div className="player-meta">Başlangıç değeri {f.basePrice}M</div>

          <div className="stat-row">
            <StatItem label="GEN" value={f.overall} />
            <StatItem label="HÜC" value={f.attack} />
            <StatItem label="DEF" value={f.defense} />
          </div>

          <div className="top-bid-row">
            <span className="lbl">En yüksek teklif</span>
            {auction.highestBid ? (
              <span>
                <span className="amt">{auction.highestBid.amount}M</span>{' '}
                {leaderNick && <span className="who">— {leaderNick}</span>}
              </span>
            ) : (
              <span className="who">henüz yok</span>
            )}
          </div>
        </div>

        <div className="budget-strip">
          <span className="lbl">Kalan bütçe</span>
          <span className="amt">{you.budget}M</span>
        </div>
        <div className="bid-input-row">
          <input
            type="text"
            inputMode="numeric"
            value={String(amount)}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9]/g, ''));
              setAmount(Number.isFinite(n) ? n : 0);
            }}
          />
          <button className="step-btn" onClick={() => setAmount(floor)}>
            MIN
          </button>
          <button className="step-btn" onClick={() => setAmount(Math.min(floor + 1, you.budget))}>
            +1
          </button>
          <button className="step-btn" onClick={() => setAmount(Math.min(floor + 5, you.budget))}>
            +5
          </button>
        </div>
        <button
          className="btn-primary"
          disabled={!canBid || amount < floor}
          onClick={() => void submitBid()}
        >
          Teklif ver
        </button>

        {youAreLeading && <p className="footnote">En yüksek teklif sende.</p>}
        {posFull && (
          <p className="footnote">{f.position} kadron dolu — bu futbolcuya teklif veremezsin.</p>
        )}
        {budgetShort && !posFull && <p className="footnote">Bütçen bu tur için yetmiyor.</p>}
        {bidError && <p className="error">{bidError}</p>}

        <div className="squad-grid">
          {POSITIONS.map((pos) => {
            const met = squadCount(pos) >= room.config.squad[pos];
            const target = room.config.squad[pos];
            return (
              <div key={pos} className={`squad-tile${pos === f.position ? ' active' : ''}`}>
                <div className="pos">{pos}</div>
                <div className="frac">
                  {squadCount(pos)}/{target}
                </div>
                <div className="strack">
                  <div
                    className="sfill"
                    style={{
                      width: `${(squadCount(pos) / target) * 100}%`,
                      background: met ? 'var(--ready)' : 'var(--gold)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="section-label">Rakipler</div>
        {room.participants
          .filter((p) => p.id !== you.id)
          .map((p) => (
            <div key={p.id} className="kv-row">
              <span className="roster-name">
                <span className={`dot ${p.connected ? '' : 'off'}`} />
                {p.nickname}
              </span>
              <span className="mono">
                {p.budget}M · {p.squad.length}/{room.config.squadSize}
              </span>
            </div>
          ))}
      </div>

      <div className="panel">
        <div className="section-label">Teklif geçmişi</div>
        {auction.history.length === 0 && (
          <p className="footnote" style={{ marginTop: 0 }}>
            —
          </p>
        )}
        {[...auction.history]
          .reverse()
          .slice(0, 6)
          .map((b, i) => {
            const nick = room.participants.find((p) => p.id === b.playerId)?.nickname ?? '?';
            return (
              <div key={`${b.at}-${i}`} className="kv-row">
                <span style={{ color: i === 0 ? 'var(--chalk)' : 'var(--chalk-faint)' }}>
                  {nick}
                </span>
                <span
                  className="mono"
                  style={i === 0 ? { color: 'var(--gold-bright)' } : undefined}
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

function StatItem({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="stat-item">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      <div className="stat-track">
        <div className="stat-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Ticker({ text }: { text: string }) {
  return (
    <div className="ticker">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
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
