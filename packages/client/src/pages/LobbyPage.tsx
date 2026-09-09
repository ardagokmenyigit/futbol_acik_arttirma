import { useState } from 'react';
import type { RoomState } from '@fal/shared';
import { leaveRoom, setReady, startGame } from '../lib/roomClient.js';
import { clearSession } from '../lib/session.js';
import { selectYou, useRoomStore } from '../store.js';

interface Props {
  room: RoomState;
}

export function LobbyPage({ room }: Props) {
  const you = useRoomStore(selectYou);
  const exitRoom = useRoomStore((s) => s.exitRoom);
  const [copied, setCopied] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  if (!you) return null;

  const isHost = room.hostId === you.id;
  const readyCount = room.participants.filter((p) => p.isReady).length;
  const enoughPlayers = room.participants.length >= room.config.minPlayers;
  const allReady = readyCount === room.participants.length;
  const canStart = isHost && enoughPlayers && allReady;

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
      setStartError(err instanceof Error ? err.message : 'Başlatılamadı');
    }
  }

  function handleLeave() {
    leaveRoom();
    clearSession();
    exitRoom();
  }

  return (
    <div className="stack">
      <div>
        <h1>Lobi</h1>
        <p className="subtitle">
          {room.participants.length}/{room.config.maxPlayers} oyuncu · {readyCount} hazır
        </p>
      </div>

      <div className="panel stack">
        <div>
          <label>Oda kodu — arkadaşlarınla paylaş</label>
          <div className="row">
            <span className="code-badge">{room.code}</span>
            <button onClick={copyCode}>{copied ? 'Kopyalandı ✓' : 'Kopyala'}</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <label>Katılımcılar</label>
        {room.participants.map((p) => (
          <div className="participant" key={p.id}>
            <span>
              <span className={`dot ${p.connected ? 'on' : 'off'}`} />
              {p.nickname}
              {p.id === you.id && <span className="muted"> (sen)</span>}
            </span>
            <span className="row" style={{ gap: 6 }}>
              {p.isHost && <span className="tag host">host</span>}
              <span className={`tag ${p.isReady ? 'ready' : ''}`}>
                {p.isReady ? 'hazır' : 'bekliyor'}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="panel stack">
        <div className="row">
          <button className={you.isReady ? '' : 'primary'} onClick={() => setReady(!you.isReady)}>
            {you.isReady ? 'Hazır değilim' : 'Hazırım'}
          </button>

          {isHost && (
            <button className="primary" disabled={!canStart} onClick={() => void handleStart()}>
              Oyunu başlat
            </button>
          )}

          <button onClick={handleLeave}>Odadan çık</button>
        </div>

        {isHost && !canStart && (
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            {!enoughPlayers
              ? `Başlatmak için en az ${room.config.minPlayers} oyuncu gerekli.`
              : 'Tüm oyuncular "Hazırım" demeden başlatılamaz.'}
          </p>
        )}
        {!isHost && (
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Oyunu host başlatır.
          </p>
        )}
        {startError && <p className="error">{startError}</p>}
      </div>
    </div>
  );
}
