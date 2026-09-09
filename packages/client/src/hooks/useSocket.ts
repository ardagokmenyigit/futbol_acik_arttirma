import { useEffect, useState } from 'react';
import { socket } from '../socket.js';

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

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (!socket.connected) socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket, connected };
}
