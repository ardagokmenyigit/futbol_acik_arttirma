import { useEffect, useMemo, useState } from 'react';
import {
  calculateTeamStats,
  isBudgetHidden,
  type Footballer,
  type Position,
  type RoomState,
} from '@fal/shared';
import { PositionBadge } from '../components/PositionBadge.js';
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

  const lastWonFootballer = useMemo(() => {
    if (!lastWon) return null;
    for (const p of room.participants) {
      const found = p.squad.find((pl) => pl.name === lastWon.footballerName);
      if (found) return found;
    }
    return null;
  }, [lastWon, room.participants]);

  const auction = room.auction;
  const minInc = room.config.minBidIncrement;

  const floor = useMemo(() => {
    if (!auction) return 0;
    // Taban fiyat yok: açılış minBidIncrement kadardır.
    return auction.highestBid ? auction.highestBid.amount + minInc : minInc;
  }, [auction, minInc]);

  const [amount, setAmount] = useState(floor);
  const [bidError, setBidError] = useState<string | null>(null);

  useEffect(() => {
    setAmount(floor);
    setBidError(null);
  }, [floor]);

  if (!you) return null;

  const squadCount = (pos: Position) => you.squad.filter((f) => f.position === pos).length;
  const myTeamStats = useMemo(() => calculateTeamStats(you.squad), [you.squad]);

  if (!auction) {
    return (
      <div className="panel crimson">
        <div className="round-label">Açık Artırma</div>
        <h1 style={{ fontSize: 30, marginBottom: 16 }}>Draft</h1>
        {lastWon && <Ticker text={wonText(lastWon, lastWonFootballer)} />}
        <p className="footnote">Sıradaki futbolcu için hazırlanıyor…</p>
      </div>
    );
  }

  const f = auction.footballer;
  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
  const isOpening = auction.phase === 'opening';
  const totalMs = Math.max(
    1,
    (isOpening ? room.config.turnDurationSec : room.config.bidDurationSec) * 1000,
  );
  const progress = Math.max(0, Math.min(1, remainingMs / totalMs));
  const ringLead = secs <= 5 ? 'var(--crimson)' : 'var(--gold)';
  const deg = Math.round(progress * 360);

  const leaderNick =
    room.participants.find((p) => p.id === auction.highestBid?.playerId)?.nickname ?? null;
  const youAreLeading = auction.highestBid?.playerId === you.id;
  const budgetShort = floor > you.budget;

  const eligible = auction.eligibleIds.includes(you.id);
  const youOpen = isOpening && auction.openerId === you.id;
  const openerNick = room.participants.find((p) => p.id === auction.openerId)?.nickname ?? null;

  const canBid = isOpening
    ? youOpen && !budgetShort && secs > 0
    : eligible && !youAreLeading && !budgetShort && secs > 0;

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
            <div className="round-label">
              Tur {auction.round}/{auction.totalRounds}
              {isOpening ? ' · açılış teklifi' : ' · serbest teklif'}
            </div>
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

        {lastWon && <Ticker text={wonText(lastWon, lastWonFootballer)} />}

        <div className="player-card">
          <div className="player-top">
            <span className="player-name">{f.name}</span>
            <PositionBadge position={f.position} size="md" showLabel />
          </div>
          <div className="player-meta">
            {isOpening
              ? `Açılışı ${openerNick ?? '—'} yapacak (en az ${minInc}M)`
              : auction.highestBid
                ? 'Serbest teklif'
                : '—'}
          </div>

          <div className="turn-strip">
            {auction.turnOrder.map((id, i) => {
              const p = room.participants.find((x) => x.id === id);
              const isOpener = auction.openerId === id;
              const out = !auction.eligibleIds.includes(id);
              const leads = auction.highestBid?.playerId === id;
              return (
                <span
                  key={id}
                  className={`turn-chip${isOpener ? ' now' : ''}${out ? ' out' : ''}${leads ? ' leads' : ''}`}
                  title={
                    out ? 'kadrosu bu pozisyonda dolu' : isOpener ? 'açılışı yapıyor' : undefined
                  }
                >
                  <span className="turn-no">{i + 1}</span>
                  {p?.nickname ?? '—'}
                  {id === you.id && <span className="turn-you">sen</span>}
                </span>
              );
            })}
          </div>

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
          {isOpening ? 'Açılış teklifi ver' : 'Teklif ver'}
        </button>

        {youOpen && (
          <p className="footnote turn-alert">
            Açılış sırası sende — vermezsen süre sonunda {minInc}M ile senin adına açılır.
          </p>
        )}
        {isOpening && !youOpen && openerNick && (
          <p className="footnote">Açılışı {openerNick} yapıyor…</p>
        )}
        {!eligible && <p className="footnote">{f.position} kadron dolu — teklif veremezsin.</p>}
        {youAreLeading && <p className="footnote">En yüksek teklif sende.</p>}
        {budgetShort && eligible && <p className="footnote">Bütçen bu teklif için yetmiyor.</p>}
        {bidError && <p className="error">{bidError}</p>}

        <div className="squad-grid">
          {POSITIONS.map((pos) => {
            const met = squadCount(pos) >= room.config.squad[pos];
            const target = room.config.squad[pos];
            return (
              <div
                key={pos}
                className={`squad-tile tile-${pos.toLowerCase()}${pos === f.position ? ' active' : ''}`}
              >
                <div className="pos" style={{ marginBottom: 6 }}>
                  <PositionBadge position={pos} size="sm" />
                </div>
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: you.squad.length === 0 ? 0 : 4,
          }}
        >
          <div className="section-label" style={{ margin: 0 }}>
            Kadrom ({you.squad.length}/{room.config.squadSize})
          </div>
          {you.squad.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 10,
                fontSize: 12,
                fontFamily: 'var(--font-cond)',
                color: 'var(--chalk-dim)',
                padding: '3px 8px',
                background: 'var(--turf)',
                borderRadius: 4,
              }}
            >
              <span>
                HÜC: <strong style={{ color: 'var(--chalk)' }}>{myTeamStats.attack}</strong>
              </span>
              <span>·</span>
              <span>
                DEF: <strong style={{ color: 'var(--chalk)' }}>{myTeamStats.defense}</strong>
              </span>
            </div>
          )}
        </div>
        {you.squad.length === 0 ? (
          <p className="footnote" style={{ margin: '6px 0 0' }}>
            Henüz futbolcu almadın. Aldığın futbolcular mevkilerine göre gruplanarak burada
            listelenecek.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {POSITIONS.map((pos) => {
              const posPlayers = you.squad.filter((pl) => pl.position === pos);
              const quota = room.config.squad[pos];
              return (
                <div key={pos} className={`position-group-block pos-block-${pos.toLowerCase()}`}>
                  <div className="position-group-header">
                    <PositionBadge position={pos} size="sm" showLabel />
                    <span className="position-group-count">
                      {posPlayers.length}/{quota} Oyuncu
                    </span>
                  </div>
                  {posPlayers.length === 0 ? (
                    <div className="squad-empty-slot">Henüz oyuncu alınmadı</div>
                  ) : (
                    <div className="squad-player-list" style={{ marginTop: 2, gap: 5 }}>
                      {posPlayers.map((pl) => (
                        <div key={pl.id} className="squad-player-item">
                          <div className="squad-player-info">
                            <span className="squad-player-name">{pl.name}</span>
                          </div>
                          <div className="squad-player-stats">
                            <span className="stat-tag gen">GEN {pl.overall}</span>
                            <span className="sep">|</span>
                            <span className="stat-tag">HÜC {pl.attack}</span>
                            <span className="sep">|</span>
                            <span className="stat-tag">DEF {pl.defense}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="section-label">
          Rakipler
          {room.config.hiddenBudgets && (
            <span className="tag" style={{ marginLeft: 8 }}>
              🔒 gizli bütçe
            </span>
          )}
        </div>
        {room.participants
          .filter((p) => p.id !== you.id)
          .map((p) => (
            <div key={p.id} className="kv-row">
              <span className="roster-name">
                <span className={`dot ${p.connected ? '' : 'off'}`} />
                {p.nickname}
                {p.isBot && <span className="tag bot">bot</span>}
              </span>
              <span className="amt">
                {isBudgetHidden(p.budget) ? '🔒' : `${p.budget}M`}
                <span className="lbl" style={{ marginLeft: 4 }}>
                  kalan
                </span>
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

function wonText(
  w: {
    footballerName: string;
    winnerNickname: string | null;
    amount: number;
  },
  f?: Footballer | null,
): string {
  if (!w.winnerNickname) return `${w.footballerName} satılmadı (teklif gelmedi).`;
  const stats = f ? ` (GEN ${f.overall}, HÜC ${f.attack}, DEF ${f.defense})` : '';
  return `${w.winnerNickname}, ${w.footballerName}${stats} oyuncusunu ${w.amount}M'ye aldı.`;
}
