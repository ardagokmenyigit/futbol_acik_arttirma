import { useState } from 'react';
import { BOT_DIFFICULTIES, DEFAULT_ROOM_CONFIG, type BotDifficulty } from '@fal/shared';
import { HomeAbout } from '../components/HomeAbout.js';
import { HowToPlay } from '../components/HowToPlay.js';
import { useT } from '../i18n/index.js';
import { createRoom, joinRoom } from '../lib/roomClient.js';
import { saveSession } from '../lib/session.js';
import { useRoomStore } from '../store.js';

const NICK_KEY = 'fal:nickname';

export function HomePage() {
  const t = useT();
  const enterRoom = useRoomStore((s) => s.enterRoom);
  const connected = useRoomStore((s) => s.connected);
  const notice = useRoomStore((s) => s.notice);
  const setNotice = useRoomStore((s) => s.setNotice);

  const [nickname, setNickname] = useState(() => localStorage.getItem(NICK_KEY) ?? '');
  const [code, setCode] = useState('');
  const [hiddenBudgets, setHiddenBudgets] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(
    DEFAULT_ROOM_CONFIG.botDifficulty,
  );
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
          ? await createRoom(nickname, { hiddenBudgets, botDifficulty })
          : await joinRoom(code, nickname);
      saveSession({ roomId: res.roomState.roomId, playerId: res.you.id });
      enterRoom(res.roomState, res.you.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel gold">
        <h1 className="headline">
          {t.home.headline1}
          <br />
          {t.home.headline2}
        </h1>
        <p className="lede">{t.home.lede}</p>

        {notice && (
          <div className="panel cobalt" style={{ marginBottom: 16 }}>
            <p style={{ margin: 0 }}>{notice}</p>
            <button
              type="button"
              className="btn-outline"
              style={{ marginTop: 10, padding: '6px 12px', fontSize: 13 }}
              onClick={() => setNotice(null)}
            >
              {t.common.ok}
            </button>
          </div>
        )}

        <button type="button" className="htp-open" onClick={() => setShowHelp(true)}>
          <span className="htp-open-icon">?</span>
          <span className="htp-open-text">
            <strong>{t.home.howToTitle}</strong>
            <span>{t.home.howToSub}</span>
          </span>
        </button>

        <div className="field-block">
          <label className="field-label" htmlFor="nick">
            {t.home.nickname}
          </label>
          <input
            id="nick"
            type="text"
            value={nickname}
            maxLength={20}
            placeholder={t.home.nicknamePlaceholder}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>

        <div className="field-block">
          <span className="field-label">{t.home.budgetMode}</span>
          <div className="format-row">
            <button
              type="button"
              className={`format-btn${!hiddenBudgets ? ' active' : ''}`}
              onClick={() => setHiddenBudgets(false)}
            >
              <span className="ft">{t.home.openBudget}</span>
              <span className="fs">{t.home.openBudgetSub}</span>
            </button>
            <button
              type="button"
              className={`format-btn${hiddenBudgets ? ' active' : ''}`}
              onClick={() => setHiddenBudgets(true)}
            >
              <span className="ft">{t.home.hiddenBudget}</span>
              <span className="fs">{t.home.hiddenBudgetSub}</span>
            </button>
          </div>
          <p className="footnote" style={{ marginTop: 6 }}>
            {t.home.budgetFootnote}
          </p>
        </div>

        <div className="field-block">
          <span className="field-label">{t.difficulty.title}</span>
          <div className="format-row">
            {BOT_DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                className={`format-btn${botDifficulty === d ? ' active' : ''}`}
                onClick={() => setBotDifficulty(d)}
              >
                <span className="ft">{t.difficulty.labels[d]}</span>
                <span className="fs">{t.difficulty.subs[d]}</span>
              </button>
            ))}
          </div>
          <p className="footnote" style={{ marginTop: 6 }}>
            {t.difficulty.footnote}
          </p>
        </div>

        <button className="btn-primary" disabled={!canSubmit} onClick={() => void handle('create')}>
          {t.home.createRoom}
        </button>

        <hr className="divider-line" />

        <div className="field-block" style={{ marginBottom: 0 }}>
          <label className="field-label" htmlFor="code">
            {t.home.roomCode}
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
              {t.home.join}
            </button>
          </div>
        </div>

        {!connected && <p className="footnote">{t.home.connecting}</p>}
        {error && <p className="error">{error}</p>}

        {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
      </div>

      <HomeAbout />
    </>
  );
}
