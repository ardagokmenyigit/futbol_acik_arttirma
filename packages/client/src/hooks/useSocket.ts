import { useEffect, useState } from 'react';
import { SERVER_URL, socket } from '../socket.js';

/** Socket bağlantısını kurar ve bağlantı durumunu döndürür. */
export function useSocket() {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
    }
    function onDisconnect() {
      setConnected(false);
    }
    // Sessizce "Bağlanıyor…"da kalmamak için sebebi konsola yaz.
    function onConnectError(err: Error) {
      console.error(
        `[socket] ${SERVER_URL} adresine bağlanılamadı: ${err.message}\n` +
          'Sunucu ayakta mı? (npm run dev) — farklı bir adres için VITE_SERVER_URL ayarlayın.',
      );
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    if (!socket.connected) socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, []);

  return { socket, connected };
}
