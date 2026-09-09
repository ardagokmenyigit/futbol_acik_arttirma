/** Reconnect için tarayıcıda tutulan oturum bilgisi (CLAUDE.md §4.5). */
const KEY = 'fal:session';

export interface StoredSession {
  roomId: string;
  playerId: string;
}

export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* özel sekme / storage kapalı — sorun değil */
  }
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.roomId === 'string' && typeof parsed.playerId === 'string') {
      return { roomId: parsed.roomId, playerId: parsed.playerId };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* yoksay */
  }
}
