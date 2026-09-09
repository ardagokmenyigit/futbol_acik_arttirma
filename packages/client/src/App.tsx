import { useEffect } from 'react';
import type { RoomState } from '@fal/shared';
import { useSocket } from './hooks/useSocket.js';
import { rejoinRoom } from './lib/roomClient.js';
import { clearSession, loadSession } from './lib/session.js';
import { DraftPage } from './pages/DraftPage.js';
import { HomePage } from './pages/HomePage.js';
import { LobbyPage } from './pages/LobbyPage.js';
import { useRoomStore } from './store.js';

export function App() {
  const { socket, connected } = useSocket();
  const roomState = useRoomStore((s) => s.roomState);
  const error = useRoomStore((s) => s.error);

  // Sunucudan gelen tam durum güncellemeleri (client sadece render eder).
  useEffect(() => {
    const store = useRoomStore.getState();

    function onRoomState(next: RoomState) {
      useRoomStore.getState().updateRoom(next);
    }
    function onRoomError({ message }: { message: string }) {
      useRoomStore.getState().setError(message);
    }

    store.setConnected(connected);
    socket.on('room:state', onRoomState);
    socket.on('room:error', onRoomError);

    return () => {
      socket.off('room:state', onRoomState);
      socket.off('room:error', onRoomError);
    };
  }, [socket, connected]);

  // Bağlantı kurulunca kayıtlı oturumla odaya geri dön (CLAUDE.md §4.5).
  useEffect(() => {
    if (!connected) return;
    const store = useRoomStore.getState();
    if (store.roomState) return;
    const session = loadSession();
    if (!session) return;

    rejoinRoom(session.roomId, session.playerId)
      .then((res) => useRoomStore.getState().enterRoom(res.roomState, res.you.id))
      .catch(() => clearSession());
  }, [connected]);

  return (
    <div className="app">
      <div className="conn" style={{ marginBottom: 8 }}>
        {connected ? '🟢 bağlı' : '🔴 bağlanıyor…'}
      </div>

      {!roomState && <HomePage />}
      {roomState?.phase === 'lobby' && <LobbyPage room={roomState} />}
      {roomState?.phase === 'draft' && <DraftPage room={roomState} />}
      {roomState && (roomState.phase === 'simulation' || roomState.phase === 'finished') && (
        <p className="muted">Simülasyon / sonuç ekranları Kişi 2 tarafından gelecek.</p>
      )}

      {error && roomState && <p className="error">{error}</p>}
    </div>
  );
}
