import { useState } from 'react';
import { HowToPlay } from '../components/HowToPlay.js';
import { createRoom, joinRoom } from '../lib/roomClient.js';
import { saveSession } from '../lib/session.js';
import { useRoomStore } from '../store.js';

const NICK_KEY = 'fal:nickname';

export function HomePage() {
  const enterRoom = useRoomStore((s) => s.enterRoom);
  const connected = useRoomStore((s) => s.connected);

  const [nickname, setNickname] = useState(() => localStorage.getItem(NICK_KEY) ?? '');
  const [code, setCode] = useState('');
  const [hiddenBudgets, setHiddenBudgets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = connected && nickname.trim().length > 0 && !busy;

  async function handle(action: 'create' | 'join') {
    setError(null);
    setBusy(true);
    try {
      localStorage.setItem(NICK_KEY, nickname.trim());
      const res =
        action === 'create'
          ? await createRoom(nickname, { hiddenBudgets })
          : await joinRoom(code, nickname);
      saveSession({ roomId: res.roomState.roomId, playerId: res.you.id });
      enterRoom(res.roomState, res.you.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel gold">
      <h1 className="headline">
        Kadronu
        <br />
        artırmayla kur
      </h1>
      <p className="lede">Yeni bir oda kur ya da bir oda koduyla arkadaşlarına katıl.</p>

      <button type="button" className="htp-open" onClick={() => setShowHelp(true)}>
        <span className="htp-open-icon">?</span>
        <span className="htp-open-text">
          <strong>Nasıl oynanır?</strong>
          <span>Kurallar, açık artırma düzeni ve ipuçları — 1 dakika</span>
        </span>
      </button>

      <div className="field-block">
        <label className="field-label" htmlFor="nick">
          Takma adın
        </label>
        <input
          id="nick"
          type="text"
          value={nickname}
          maxLength={20}
          placeholder="örn. Kaptan Mert"
          onChange={(e) => setNickname(e.target.value)}
        />
      </div>

      <div className="field-block">
        <span className="field-label">Bütçe modu</span>
        <div className="format-row">
          <button
            type="button"
            className={`format-btn${!hiddenBudgets ? ' active' : ''}`}
            onClick={() => setHiddenBudgets(false)}
          >
            <span className="ft">Açık bütçe</span>
            <span className="fs">Rakiplerin kalan parası görünür</span>
          </button>
          <button
            type="button"
            className={`format-btn${hiddenBudgets ? ' active' : ''}`}
            onClick={() => setHiddenBudgets(true)}
          >
            <span className="ft">Gizli bütçe</span>
            <span className="fs">Kimse rakip bütçesini göremez</span>
          </button>
        </div>
        <p className="footnote" style={{ marginTop: 6 }}>
          Gizli modda botlar da rakip bütçelerini görmez. Oda kurulduktan sonra değişmez.
        </p>
      </div>

      <button className="btn-primary" disabled={!canSubmit} onClick={() => void handle('create')}>
        Yeni oda kur
      </button>

      <hr className="divider-line" />

      <div className="field-block" style={{ marginBottom: 0 }}>
        <label className="field-label" htmlFor="code">
          Oda kodu
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            id="code"
            type="text"
            value={code}
            maxLength={6}
            placeholder="ABC123"
            style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '2px' }}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button
            className="btn-outline"
            disabled={!canSubmit || code.trim().length < 4}
            onClick={() => void handle('join')}
          >
            Katıl
          </button>
        </div>
      </div>

      {!connected && <p className="footnote">Sunucuya bağlanılıyor…</p>}
      {error && <p className="error">{error}</p>}

      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
