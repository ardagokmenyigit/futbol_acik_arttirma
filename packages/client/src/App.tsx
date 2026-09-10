import { useEffect, useState } from 'react';
import type { AuctionState, MatchResult, RoomState, TournamentState } from '@fal/shared';
import { useSocket } from './hooks/useSocket.js';
import { rejoinRoom } from './lib/roomClient.js';
import { clearSession, loadSession } from './lib/session.js';
import { DraftPage } from './pages/DraftPage.js';
import { HomePage } from './pages/HomePage.js';
import { LobbyPage } from './pages/LobbyPage.js';
import { TournamentPage } from './pages/TournamentPage.js';
import { SimulationPage } from './pages/SimulationPage.js';
import { useRoomStore } from './store.js';

export function App() {
  const { socket, connected } = useSocket();
  const roomState = useRoomStore((s) => s.roomState);
  const error = useRoomStore((s) => s.error);
  const youId = useRoomStore((s) => s.youId);
  const tournament = useRoomStore((s) => s.tournament);
  const [forceSimulationPreview, setForceSimulationPreview] = useState(false);

  // Sunucudan gelen tam durum güncellemeleri (client sadece render eder).
  useEffect(() => {
    const store = useRoomStore.getState();

    function onRoomState(next: RoomState) {
      useRoomStore.getState().updateRoom(next);
      // Tick'ler arasında / reconnect sonrası geri sayımı endsAt'ten türet.
      if (next.auction) {
        useRoomStore.getState().setRemainingMs(Math.max(0, next.auction.endsAt - Date.now()));
      }
      if (next.tournament) {
        useRoomStore.getState().setTournament(next.tournament);
      }
    }
    function onRoomError({ message }: { message: string }) {
      useRoomStore.getState().setError(message);
    }
    function onAuctionStarted(auction: AuctionState) {
      const durationMs = Math.max(0, auction.endsAt - Date.now());
      useRoomStore.getState().roundStarted(durationMs);
    }
    // Açılış teklifi verildi — serbest teklif evresinin geri sayımına geç.
    function onAuctionOpened({ endsAt }: { endsAt: number }) {
      useRoomStore.getState().roundStarted(Math.max(0, endsAt - Date.now()));
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
    function onTournamentBracket(tournament: TournamentState) {
      useRoomStore.getState().setTournament(tournament);
    }
    // İnsan içeren maç canlı oynanmak üzere — LiveMatchTicker'ı aç.
    function onTournamentMatchLive(payload: { matchId: string; result: MatchResult }) {
      useRoomStore.getState().setLiveMatch(payload);
    }
    function onTournamentMatch({ tournament }: { tournament: TournamentState }) {
      useRoomStore.getState().setTournament(tournament);
      // Maç ağaca işlendi — canlı oynatmayı kapat (sonucu bracket'te görünür).
      useRoomStore.getState().setLiveMatch(null);
    }
    function onTournamentFinished({ tournament }: { tournament: TournamentState }) {
      useRoomStore.getState().setTournament(tournament);
      useRoomStore.getState().setLiveMatch(null);
    }

    store.setConnected(connected);
    socket.on('room:state', onRoomState);
    socket.on('room:error', onRoomError);
    socket.on('auction:started', onAuctionStarted);
    socket.on('auction:opened', onAuctionOpened);
    socket.on('auction:tick', onAuctionTick);
    socket.on('auction:won', onAuctionWon);
    socket.on('tournament:bracket', onTournamentBracket);
    socket.on('tournament:matchLive', onTournamentMatchLive);
    socket.on('tournament:matchResult', onTournamentMatch);
    socket.on('tournament:finished', onTournamentFinished);

    return () => {
      socket.off('room:state', onRoomState);
      socket.off('room:error', onRoomError);
      socket.off('auction:started', onAuctionStarted);
      socket.off('auction:opened', onAuctionOpened);
      socket.off('auction:tick', onAuctionTick);
      socket.off('auction:won', onAuctionWon);
      socket.off('tournament:bracket', onTournamentBracket);
      socket.off('tournament:matchLive', onTournamentMatchLive);
      socket.off('tournament:matchResult', onTournamentMatch);
      socket.off('tournament:finished', onTournamentFinished);
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
    <>
      <div className="pitch-mark" />
      <a
        href="/easter-target.jpg"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Sürpriz Hediye"
        title="Sürpriz"
        style={{
          position: 'fixed',
          top: '10px',
          right: '12px',
          zIndex: 999,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--gold)',
          opacity: 0.6,
          transition: 'opacity 0.2s ease, transform 0.2s ease, filter 0.2s ease',
          cursor: 'pointer',
          padding: '4px',
          textDecoration: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.transform = 'scale(1.2) rotate(-6deg)';
          e.currentTarget.style.filter = 'drop-shadow(0 0 6px rgba(201, 151, 74, 0.6))';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.6';
          e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
          e.currentTarget.style.filter = 'none';
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ display: 'block' }}
        >
          <rect x="3" y="8" width="18" height="4" rx="1" />
          <path d="M12 8v13" />
          <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
          <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
        </svg>
      </a>
      <div className="app">
        <div
          className="status-row"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`dot ${connected ? '' : 'off'}`} />
            {connected ? 'Sunucuya bağlı' : 'Bağlanıyor…'}
          </div>
          {import.meta.env.DEV && (
            <button
              type="button"
              className="btn-outline"
              style={{ padding: '6px 10px', fontSize: 12 }}
              onClick={() => setForceSimulationPreview((v) => !v)}
            >
              {forceSimulationPreview ? '✕ Önizleme' : '🏆 Turnuva önizleme'}
            </button>
          )}
        </div>

        {forceSimulationPreview ? (
          <SimulationPage
            initialParticipants={roomState?.participants}
            myParticipantId={youId ?? roomState?.participants[0]?.id}
          />
        ) : (
          <>
            {!roomState && <HomePage />}
            {roomState?.phase === 'lobby' && <LobbyPage room={roomState} />}
            {roomState?.phase === 'draft' && <DraftPage room={roomState} />}
            {roomState &&
              (roomState.phase === 'simulation' || roomState.phase === 'finished') &&
              (tournament ? (
                <TournamentPage room={roomState} tournament={tournament} />
              ) : (
                <div className="panel gold">
                  <div className="round-label" style={{ color: 'var(--chalk-faint)' }}>
                    Draft tamamlandı
                  </div>
                  <h1 style={{ fontSize: 30, marginBottom: 12 }}>Turnuva hazırlanıyor</h1>
                  <p className="footnote" style={{ marginTop: 0 }}>
                    Eşleşmeler kuruluyor, maçlar birazdan başlıyor…
                  </p>
                </div>
              ))}
          </>
        )}

        {error && roomState && <p className="error">{error}</p>}
      </div>
    </>
  );
}
