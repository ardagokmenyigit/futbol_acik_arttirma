import { useEffect } from 'react';
import type { AuctionState, LeagueState, MatchResult, RoomState } from '@fal/shared';
import { useSocket } from './hooks/useSocket.js';
import { rejoinRoom } from './lib/roomClient.js';
import { clearSession, loadSession } from './lib/session.js';
import { DraftPage } from './pages/DraftPage.js';
import { HomePage } from './pages/HomePage.js';
import { LobbyPage } from './pages/LobbyPage.js';
import { ResultsPage } from './pages/ResultsPage.js';
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
      // Tick'ler arasında / reconnect sonrası geri sayımı endsAt'ten türet.
      if (next.auction) {
        useRoomStore.getState().setRemainingMs(Math.max(0, next.auction.endsAt - Date.now()));
      }
      // finished halinde lig durumu room:state ile de gelir (reconnect).
      if (next.league) {
        useRoomStore.getState().setLeague(next.league);
      }
    }
    function onRoomError({ message }: { message: string }) {
      useRoomStore.getState().setError(message);
    }
    function onAuctionStarted(auction: AuctionState) {
      const durationMs = Math.max(0, auction.endsAt - Date.now());
      useRoomStore.getState().roundStarted(durationMs);
    }
    function onAuctionTick({ remainingMs }: { remainingMs: number }) {
      useRoomStore.getState().setRemainingMs(remainingMs);
    }
    function onAuctionWon(payload: {
      round: number;
      footballerName: string;
      winnerNickname: string | null;
      amount: number;
    }) {
      useRoomStore.getState().setLastWon(payload);
    }
    function onLeagueFixtures(league: LeagueState) {
      useRoomStore.getState().setLeague(league);
    }
    function onLeagueMatchResult({ league }: { result: MatchResult; league: LeagueState }) {
      useRoomStore.getState().setLeague(league);
    }
    function onLeagueFinished({ league }: { league: LeagueState }) {
      useRoomStore.getState().setLeague(league);
    }

    store.setConnected(connected);
    socket.on('room:state', onRoomState);
    socket.on('room:error', onRoomError);
    socket.on('auction:started', onAuctionStarted);
    socket.on('auction:tick', onAuctionTick);
    socket.on('auction:won', onAuctionWon);
    socket.on('league:fixtures', onLeagueFixtures);
    socket.on('league:matchResult', onLeagueMatchResult);
    socket.on('league:finished', onLeagueFinished);

    return () => {
      socket.off('room:state', onRoomState);
      socket.off('room:error', onRoomError);
      socket.off('auction:started', onAuctionStarted);
      socket.off('auction:tick', onAuctionTick);
      socket.off('auction:won', onAuctionWon);
      socket.off('league:fixtures', onLeagueFixtures);
      socket.off('league:matchResult', onLeagueMatchResult);
      socket.off('league:finished', onLeagueFinished);
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
      <div className="conn" style={{ marginBottom: 12 }}>
        <span className={`dot ${connected ? 'on' : 'off'}`} />
        {connected ? 'sunucuya bağlı' : 'bağlanıyor…'}
      </div>

      {!roomState && <HomePage />}
      {roomState?.phase === 'lobby' && <LobbyPage room={roomState} />}
      {roomState?.phase === 'draft' && <DraftPage room={roomState} />}
      {roomState && (roomState.phase === 'simulation' || roomState.phase === 'finished') && (
        <ResultsPage room={roomState} />
      )}

      {error && roomState && <p className="error">{error}</p>}
    </div>
  );
}
