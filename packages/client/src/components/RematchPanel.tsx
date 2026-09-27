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
import { useT } from '../i18n/index.js';
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
  const t = useT();
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
      setError(err instanceof Error ? err.message : t.common.errorGeneric);
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
            {p.id === you.id && <span className="sub">{t.rematch.you}</span>}
          </div>
          <span className={`tag ${accepted.has(p.id) ? 'ready' : 'waiting'}`}>
            {accepted.has(p.id) ? t.rematch.accepted : t.rematch.waiting}
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
            {others.length === 0 ? t.rematch.playAgain : t.rematch.playRematch}
          </button>
          <button className="btn-outline" disabled={busy} onClick={leave}>
            {t.rematch.newGame}
          </button>
        </div>
        <p className="footnote" style={{ marginTop: 0 }}>
          {others.length === 0 ? t.rematch.soloInfo : t.rematch.groupInfo}
        </p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  if (isProposer) {
    return (
      <div className="panel cobalt" style={{ marginTop: 8, textAlign: 'left' }}>
        <div className="section-label">{t.rematch.sent}</div>
        <p className="footnote" style={{ marginTop: 4 }}>
          {pending.length === 0
            ? t.rematch.allAccepted
            : t.rematch.acceptedCount(accepted.size, humans.length)}
        </p>
        {roster}
        <div className="btn-row">
          {pending.length > 0 && (
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => void run(startRematchNow)}
              title={t.rematch.startWithAcceptedTitle}
            >
              {t.rematch.startWithAccepted(accepted.size)}
            </button>
          )}
          <button className="btn-outline" disabled={busy} onClick={() => void run(cancelRematch)}>
            {t.rematch.cancelInvite}
          </button>
          <button className="btn-outline" disabled={busy} onClick={leave}>
            {t.rematch.giveUpLeave}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  if (youAccepted) {
    return (
      <div className="panel cobalt" style={{ marginTop: 8, textAlign: 'left' }}>
        <div className="section-label">{t.rematch.youAccepted}</div>
        <p className="footnote" style={{ marginTop: 4 }}>
          {pending.length === 0
            ? t.rematch.allAccepted
            : t.rematch.waitingFor(pending.map((p) => p.nickname).join(', '))}
        </p>
        {roster}
        <div className="btn-row">
          <button
            className="btn-outline"
            disabled={busy}
            onClick={() => void run(() => respondRematch(false))}
          >
            {t.rematch.withdraw}
          </button>
          <button className="btn-outline" disabled={busy} onClick={leave}>
            {t.rematch.leave}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="panel gold" style={{ marginTop: 8, textAlign: 'left' }}>
      <div className="section-label">{t.rematch.invite}</div>
      <h2 style={{ fontSize: 22, margin: '6px 0 4px' }}>
        {t.rematch.invites(proposer?.nickname ?? t.rematch.somePlayer)}
      </h2>
      <p className="footnote" style={{ marginTop: 0 }}>
        {t.rematch.inviteInfo(accepted.size, humans.length)}
      </p>
      {roster}
      <div className="btn-row">
        <button
          className="btn-primary"
          disabled={busy}
          onClick={() => void run(() => respondRematch(true))}
        >
          {t.rematch.accept}
        </button>
        <button className="btn-outline" disabled={busy} onClick={leave}>
          {t.rematch.declineLeave}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
