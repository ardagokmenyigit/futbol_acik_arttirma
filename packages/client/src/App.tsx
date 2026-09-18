import { useEffect, useState } from 'react';
import type {
  AuctionState,
  MatchResult,
  RoomState,
  ShootoutState,
  TournamentState,
} from '@fal/shared';
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
    // Sunucu bizi odadan çıkardı (örn. rövanş sensiz başladı) → ana ekran.
    function onRoomKicked({ reason }: { reason: string }) {
      clearSession();
      useRoomStore.getState().exitRoom(reason);
    }
    function onAuctionStarted(auction: AuctionState) {
      const durationMs = Math.max(0, auction.endsAt - Date.now());
      useRoomStore.getState().roundStarted(durationMs);
    }
    // Açılış teklifi verildi — serbest teklif evresinin geri sayımına geç.
    function onAuctionOpened({ endsAt }: { endsAt: number }) {
      useRoomStore.getState().roundStarted(Math.max(0, endsAt - Date.now()));
    }
    // Açılış pas geçildi — aynı futbolcu, yeni açıcı, geri sayım baştan.
    function onAuctionPassed(payload: {
      passerNickname: string;
      nextOpenerNickname: string;
      endsAt: number;
    }) {
      const store = useRoomStore.getState();
      store.setRemainingMs(Math.max(0, payload.endsAt - Date.now()));
      store.setLastPass({
        passerNickname: payload.passerNickname,
        nextOpenerNickname: payload.nextOpenerNickname,
      });
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
    function onTournamentMatchLive(payload: {
      matchId: string;
      result: MatchResult;
      startedAt?: number;
    }) {
      useRoomStore.getState().setLiveMatch(payload);
    }
    function onTournamentMatch({ tournament }: { tournament: TournamentState }) {
      const s = useRoomStore.getState();
      s.setTournament(tournament);
      // Maç ağaca işlendi — canlı oynatmayı kapat (sonucu bracket'te görünür).
      s.setLiveMatch(null);
      s.setShootout(null);
    }
    function onTournamentFinished({ tournament }: { tournament: TournamentState }) {
      const s = useRoomStore.getState();
      s.setTournament(tournament);
      s.setLiveMatch(null);
      s.setShootout(null);
    }
    // Canlı seri penaltı: yeni vuruş (seçim evresi) ve açıklanan vuruş
    // (`state.lastAttempt`). Tek doğruluk kaynağı sunucunun gönderdiği durum.
    function onShootoutPrompt(state: ShootoutState) {
      useRoomStore.getState().setShootout(state);
    }
    function onShootoutKick({ state }: { state: ShootoutState }) {
      useRoomStore.getState().setShootout(state);
    }

    store.setConnected(connected);
    socket.on('room:state', onRoomState);
    socket.on('room:error', onRoomError);
    socket.on('room:kicked', onRoomKicked);
    socket.on('auction:started', onAuctionStarted);
    socket.on('auction:opened', onAuctionOpened);
    socket.on('auction:passed', onAuctionPassed);
    socket.on('auction:tick', onAuctionTick);
    socket.on('auction:won', onAuctionWon);
    socket.on('tournament:bracket', onTournamentBracket);
    socket.on('tournament:matchLive', onTournamentMatchLive);
    socket.on('tournament:matchResult', onTournamentMatch);
    socket.on('tournament:finished', onTournamentFinished);
    socket.on('tournament:shootoutPrompt', onShootoutPrompt);
    socket.on('tournament:shootoutKick', onShootoutKick);

    return () => {
      socket.off('room:state', onRoomState);
      socket.off('room:error', onRoomError);
      socket.off('room:kicked', onRoomKicked);
      socket.off('auction:started', onAuctionStarted);
      socket.off('auction:opened', onAuctionOpened);
      socket.off('auction:passed', onAuctionPassed);
      socket.off('auction:tick', onAuctionTick);
      socket.off('auction:won', onAuctionWon);
      socket.off('tournament:bracket', onTournamentBracket);
      socket.off('tournament:matchLive', onTournamentMatchLive);
      socket.off('tournament:matchResult', onTournamentMatch);
      socket.off('tournament:finished', onTournamentFinished);
      socket.off('tournament:shootoutPrompt', onShootoutPrompt);
      socket.off('tournament:shootoutKick', onShootoutKick);
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
      <div className="app">
        <div
          className="status-row"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img className="brand-logo" src="/icon-192.png" alt="Açık Artırma Ligi" />
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
