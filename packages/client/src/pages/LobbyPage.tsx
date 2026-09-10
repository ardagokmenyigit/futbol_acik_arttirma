import { useState } from 'react';
import type { RoomState, TournamentSize } from '@fal/shared';
import { leaveRoom, setFormat, setReady, startGame } from '../lib/roomClient.js';
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
  // Sunucu gibi: sadece bağlı oyunculara bak (kopuk oyuncu "hazır" olamaz).
  const connectedPlayers = room.participants.filter((p) => p.connected);
  const readyCount = connectedPlayers.filter((p) => p.isReady).length;
  const format = room.config.tournamentSize;
  // Eksik takımlar botlarla dolar — tek kişi bile başlatabilir.
  const enoughPlayers = connectedPlayers.length >= 1;
  const allReady = connectedPlayers.length > 0 && readyCount === connectedPlayers.length;
  const canStart = isHost && enoughPlayers && allReady;
  const botCount = Math.max(0, format - room.participants.length);

  async function chooseFormat(size: TournamentSize) {
    setStartError(null);
    try {
      await setFormat(size);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Format değiştirilemedi');
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
      setStartError(err instanceof Error ? err.message : 'Başlatılamadı');
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
        Lobi
      </h1>
      <p className="lede" style={{ marginBottom: 22 }}>
        {connectedPlayers.length}/{format} oyuncu bağlandı, {readyCount} tanesi hazır.
      </p>

      <label className="field-label">Oda kodu</label>
      <div className="code-panel">
        <span className="code-text">{room.code}</span>
        <button className="icon-btn" aria-label="Kodu kopyala" onClick={copyCode}>
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

      <div className="section-label">Turnuva boyutu</div>
      <div className="format-row">
        {(
          [
            { key: 't4', size: 4, title: '4 Takım', sub: 'Yarı final' },
            { key: 't8', size: 8, title: '8 Takım', sub: 'Çeyrek final' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.key}
            className={`format-btn${format === opt.size ? ' active' : ''}`}
            disabled={!isHost}
            onClick={() => void chooseFormat(opt.size)}
          >
            <span className="ft">{opt.title}</span>
            <span className="fs">{opt.sub}</span>
          </button>
        ))}
      </div>
      {botCount > 0 && (
        <p className="footnote" style={{ marginTop: 8 }}>
          Eksik {botCount} takım yapay zekâ botlarıyla tamamlanacak — botlar açık artırmaya da
          katılır.
        </p>
      )}

      <div className="section-label" style={{ marginTop: 22 }}>
        Katılımcılar
      </div>
      <div className="roster-list">
        {room.participants.map((p) => (
          <div className="roster-row" key={p.id}>
            <div className="roster-name">
              <span className={`dot ${p.connected ? '' : 'off'}`} />
              {p.nickname}
              {p.id === you.id && <span className="sub">(sen)</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {p.isBot && <span className="tag bot">bot</span>}
              {p.isHost && <span className="tag host">host</span>}
              <span className={`tag ${p.isReady ? 'ready' : 'waiting'}`}>
                {p.isReady ? 'hazır' : 'bekliyor'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="btn-row">
        <button className="btn-outline" onClick={handleLeave}>
          Odadan çık
        </button>
        <button className="btn-outline" onClick={() => setReady(!you.isReady)}>
          {you.isReady ? 'Hazır değilim' : 'Hazırım'}
        </button>
        {isHost && (
          <button className="btn-primary" disabled={!canStart} onClick={() => void handleStart()}>
            Başlat
          </button>
        )}
      </div>

      {isHost && !canStart && (
        <p className="footnote">
          {!enoughPlayers
            ? 'Başlatmak için en az 1 bağlı oyuncu gerekli.'
            : 'Bağlı oyuncuların tamamı hazır olmadan oyun başlatılamaz.'}
        </p>
      )}
      {!isHost && <p className="footnote">Formatı ve başlatmayı host belirler.</p>}
      {startError && <p className="error">{startError}</p>}
    </div>
  );
}
