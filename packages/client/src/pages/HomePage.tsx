import { useState } from 'react';
import { createRoom, joinRoom } from '../lib/roomClient.js';
import { saveSession } from '../lib/session.js';
import { useRoomStore } from '../store.js';

const NICK_KEY = 'fal:nickname';

export function HomePage() {
  const enterRoom = useRoomStore((s) => s.enterRoom);
  const connected = useRoomStore((s) => s.connected);

  const [nickname, setNickname] = useState(() => localStorage.getItem(NICK_KEY) ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = connected && nickname.trim().length > 0 && !busy;

  async function handle(action: 'create' | 'join') {
    setError(null);
    setBusy(true);
    try {
      localStorage.setItem(NICK_KEY, nickname.trim());
      const res = action === 'create' ? await createRoom(nickname) : await joinRoom(code, nickname);
      saveSession({ roomId: res.roomState.roomId, playerId: res.you.id });
      enterRoom(res.roomState, res.you.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>⚽ Açık Artırma Ligi</h1>
        <p className="subtitle">Oda kur ya da bir oda koduyla katıl.</p>
      </div>

      <div className="panel stack">
        <div>
          <label htmlFor="nick">Takma adın</label>
          <input
            id="nick"
            type="text"
            value={nickname}
            maxLength={20}
            placeholder="örn. Kaptan"
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>

        <div className="row">
          <button className="primary" disabled={!canSubmit} onClick={() => void handle('create')}>
            Yeni oda kur
          </button>
        </div>

        <hr style={{ border: 0, borderTop: '1px solid var(--border)' }} />

        <div>
          <label htmlFor="code">Oda kodu</label>
          <div className="row">
            <input
              id="code"
              type="text"
              value={code}
              maxLength={6}
              placeholder="ABC123"
              style={{ textTransform: 'uppercase', maxWidth: 160 }}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button
              disabled={!canSubmit || code.trim().length < 4}
              onClick={() => void handle('join')}
            >
              Odaya katıl
            </button>
          </div>
        </div>

        {!connected && <p className="conn">Sunucuya bağlanılıyor…</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
