import { useState } from 'react';
import type { RoomState, TournamentSize } from '@fal/shared';
import { useT } from '../i18n/index.js';
import { leaveRoom, setFormat, setReady, startGame } from '../lib/roomClient.js';
import { clearSession } from '../lib/session.js';
import { selectYou, useRoomStore } from '../store.js';

interface Props {
  room: RoomState;
}

export function LobbyPage({ room }: Props) {
  const t = useT();
  const you = useRoomStore(selectYou);
  const exitRoom = useRoomStore((s) => s.exitRoom);
  const [copied, setCopied] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  if (!you) return null;

  const isHost = room.hostId === you.id;
  // Sunucu gibi: sadece bağlı oyunculara bak (kopuk oyuncu "hazır" olamaz).
  const connectedPlayers = room.participants.filter((p) => p.connected);
  const otherPlayers = connectedPlayers.filter((p) => p.id !== room.hostId && !p.isBot);
  const otherReadyCount = otherPlayers.filter((p) => p.isReady).length;
  const othersReady = otherPlayers.every((p) => p.isReady);
  const format = room.config.tournamentSize;
  // Eksik takımlar botlarla dolar — tek kişi bile başlatabilir.
  const enoughPlayers = connectedPlayers.length >= 1;
  const canStart = isHost && enoughPlayers && othersReady;
  const botCount = Math.max(0, format - room.participants.length);

  async function chooseFormat(size: TournamentSize) {
    setStartError(null);
    try {
      await setFormat(size);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : t.lobby.formatError);
    }
  }

  function copyCode() {
    void navigator.clipboard?.writeText(room.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function handleStart() {
    setStartError(null);
    try {
      await startGame();
    } catch (err) {
      setStartError(err instanceof Error ? err.message : t.lobby.startError);
    }
  }

  function handleLeave() {
    leaveRoom();
    clearSession();
    exitRoom();
  }

  return (
    <div className="panel cobalt">
      <h1 className="headline" style={{ fontSize: 30 }}>
        {room.gameNumber > 1 ? t.lobby.rematchTitle(room.gameNumber) : t.lobby.title}
      </h1>
      <p className="lede" style={{ marginBottom: 22 }}>
        {t.lobby.connectedCount(connectedPlayers.length, format)}
        {otherPlayers.length > 0 ? t.lobby.readyCount(otherReadyCount, otherPlayers.length) : '.'}
      </p>

      <label className="field-label">{t.lobby.roomCode}</label>
      <div className="code-panel">
        <span className="code-text">{room.code}</span>
        <button className="icon-btn" aria-label={t.lobby.copyCode} onClick={copyCode}>
          {copied ? (
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
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="12" height="12" rx="1.5" />
              <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
            </svg>
          )}
        </button>
      </div>

      <div className="section-label">{t.lobby.tournamentSize}</div>
      <div className="format-row">
        {([2, 4, 8] as const).map((size) => (
          <button
            key={size}
            className={`format-btn${format === size ? ' active' : ''}`}
            disabled={!isHost || room.participants.length > size}
            onClick={() => void chooseFormat(size)}
          >
            <span className="ft">{t.lobby.formats[size].title}</span>
            <span className="fs">{t.lobby.formats[size].sub}</span>
          </button>
        ))}
      </div>
      {botCount > 0 && (
        <p className="footnote" style={{ marginTop: 8 }}>
          {t.lobby.botsFill(botCount)}
        </p>
      )}
      <p className="footnote" style={{ marginTop: 8 }}>
        {t.lobby.budgetMode}:{' '}
        <strong>{room.config.hiddenBudgets ? t.lobby.budgetHidden : t.lobby.budgetOpen}</strong> ·{' '}
        {t.lobby.botDifficulty}:{' '}
        <strong>
          {t.difficulty.labels[room.config.botDifficulty] ?? t.difficulty.labels.normal}
        </strong>{' '}
        — {t.lobby.fixedAtCreate}
      </p>

      <div className="section-label" style={{ marginTop: 22 }}>
        {t.lobby.participants}
      </div>
      <div className="roster-list">
        {room.participants.map((p) => (
          <div className="roster-row" key={p.id}>
            <div className="roster-name">
              <span className={`dot ${p.connected ? '' : 'off'}`} />
              {p.nickname}
              {p.id === you.id && <span className="sub">({t.common.you})</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {p.isBot && <span className="tag bot">{t.common.bot}</span>}
              {p.isHost && <span className="tag host">{t.common.host}</span>}
              {!p.isHost && !p.isBot && (
                <span className={`tag ${p.isReady ? 'ready' : 'waiting'}`}>
                  {p.isReady ? t.common.ready : t.common.waiting}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="btn-row">
        <button className="btn-outline" onClick={handleLeave}>
          {t.lobby.leave}
        </button>
        {!isHost && (
          <button className="btn-outline" onClick={() => setReady(!you.isReady)}>
            {you.isReady ? t.lobby.notReady : t.lobby.imReady}
          </button>
        )}
        {isHost && (
          <button className="btn-primary" disabled={!canStart} onClick={() => void handleStart()}>
            {t.lobby.start}
          </button>
        )}
      </div>

      {isHost && !canStart && (
        <p className="footnote">
          {otherPlayers.length > 0 && !othersReady
            ? t.lobby.othersNotReady
            : !enoughPlayers
              ? t.lobby.needOnePlayer
              : t.lobby.cannotStart}
        </p>
      )}
      {isHost && canStart && otherPlayers.length > 0 && (
        <p className="footnote" style={{ color: 'var(--accent-green, #10b981)' }}>
          {t.lobby.allReady}
        </p>
      )}
      {!isHost && (
        <p className="footnote">{you.isReady ? t.lobby.youAreReady : t.lobby.pressReady}</p>
      )}
      {startError && <p className="error">{startError}</p>}
    </div>
  );
}
