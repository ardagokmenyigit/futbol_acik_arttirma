import { useState } from 'react';
import type { RoomState } from '@fal/shared';
import {
  cancelRematch,
  leaveRoom,
  proposeRematch,
  respondRematch,
  startRematchNow,
} from '../lib/roomClient.js';
import { clearSession } from '../lib/session.js';
import { useRoomStore } from '../store.js';

interface Props {
  room: RoomState;
  youId: string | null;
}

/**
 * Oyun bitince: rövanş teklif et / daveti yanıtla / çık.
 * Sunucu tek doğruluk kaynağı — burada yalnız `room.rematch` render edilir.
 */
export function RematchPanel({ room, youId }: Props) {
  const exitRoom = useRoomStore((s) => s.exitRoom);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const you = room.participants.find((p) => p.id === youId);
  if (!you || you.isBot) return null;

  const humans = room.participants.filter((p) => !p.isBot);
  const others = humans.filter((p) => p.id !== you.id);
  const rematch = room.rematch;
  const accepted = new Set(rematch?.acceptedIds ?? []);
  const pending = humans.filter((p) => !accepted.has(p.id));
  const proposer = rematch ? room.participants.find((p) => p.id === rematch.proposerId) : null;
  const isProposer = !!rematch && rematch.proposerId === you.id;
  const youAccepted = accepted.has(you.id);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    leaveRoom();
    clearSession();
    exitRoom();
  }

  const roster = (
    <div className="roster-list" style={{ marginTop: 10 }}>
      {humans.map((p) => (
        <div className="roster-row" key={p.id}>
          <div className="roster-name">
            <span className={`dot ${p.connected ? '' : 'off'}`} />
            {p.nickname}
            {p.id === you.id && <span className="sub">(sen)</span>}
          </div>
          <span className={`tag ${accepted.has(p.id) ? 'ready' : 'waiting'}`}>
            {accepted.has(p.id) ? 'kabul etti' : 'bekliyor'}
          </span>
        </div>
      ))}
    </div>
  );

  if (!rematch) {
    return (
      <div className="stack" style={{ gap: 8 }}>
        <div className="btn-row">
          <button className="btn-primary" disabled={busy} onClick={() => void run(proposeRematch)}>
            {others.length === 0 ? '🔁 Tekrar oyna' : '🔁 Rövanş oyna'}
          </button>
          <button className="btn-outline" disabled={busy} onClick={leave}>
            Yeni oyun
          </button>
        </div>
        <p className="footnote" style={{ marginTop: 0 }}>
          {others.length === 0
            ? 'Aynı oda ve ayarlarla yeni bir oyun başlar.'
            : 'Rövanş: aynı oda, aynı oyuncular — herkese davet gider, kabul edenler devam eder.'}
        </p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  if (isProposer) {
    return (
      <div className="panel cobalt" style={{ marginTop: 8, textAlign: 'left' }}>
        <div className="section-label">Rövanş daveti gönderildi</div>
        <p className="footnote" style={{ marginTop: 4 }}>
          {pending.length === 0
            ? 'Herkes kabul etti — lobiye geçiliyor…'
            : `${accepted.size}/${humans.length} kabul etti. Kalanları bekleyebilir ya da kabul edenlerle başlayabilirsin.`}
        </p>
        {roster}
        <div className="btn-row">
          {pending.length > 0 && (
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => void run(startRematchNow)}
              title="Yanıt vermeyenler odadan çıkarılır; lobiye kodla geri katılabilirler."
            >
              Kabul edenlerle başla ({accepted.size})
            </button>
          )}
          <button className="btn-outline" disabled={busy} onClick={() => void run(cancelRematch)}>
            Daveti iptal et
          </button>
          <button className="btn-outline" disabled={busy} onClick={leave}>
            Vazgeç ve çık
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  if (youAccepted) {
    return (
      <div className="panel cobalt" style={{ marginTop: 8, textAlign: 'left' }}>
        <div className="section-label">Rövanşı kabul ettin</div>
        <p className="footnote" style={{ marginTop: 4 }}>
          {pending.length === 0
            ? 'Herkes kabul etti — lobiye geçiliyor…'
            : `Bekleniyor: ${pending.map((p) => p.nickname).join(', ')}`}
        </p>
        {roster}
        <div className="btn-row">
          <button
            className="btn-outline"
            disabled={busy}
            onClick={() => void run(() => respondRematch(false))}
          >
            Kabulü geri çek
          </button>
          <button className="btn-outline" disabled={busy} onClick={leave}>
            Çık
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="panel gold" style={{ marginTop: 8, textAlign: 'left' }}>
      <div className="section-label">Rövanş daveti</div>
      <h2 style={{ fontSize: 22, margin: '6px 0 4px' }}>
        {proposer?.nickname ?? 'Bir oyuncu'} sizi rövanşa davet ediyor
      </h2>
      <p className="footnote" style={{ marginTop: 0 }}>
        Aynı oda ve ayarlarla yeni bir oyun. {accepted.size}/{humans.length} kabul etti.
      </p>
      {roster}
      <div className="btn-row">
        <button
          className="btn-primary"
          disabled={busy}
          onClick={() => void run(() => respondRematch(true))}
        >
          Kabul et
        </button>
        <button className="btn-outline" disabled={busy} onClick={leave}>
          Reddet ve çık
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
