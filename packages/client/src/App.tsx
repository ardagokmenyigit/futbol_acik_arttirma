import { useEffect, useState } from 'react';
import { useSocket } from './hooks/useSocket.js';

/**
 * FAZ 0 — hello-world doğrulaması.
 * Sunucuya bağlanır, "hello" gönderir, ack yanıtını ekranda gösterir.
 * Lobi / Draft / Sonuç ekranları buradan yönlendirilecek (Kişi 1 & Kişi 2).
 */
export function App() {
  const { socket, connected } = useSocket();
  const [reply, setReply] = useState<string>('(henüz yanıt yok)');

  useEffect(() => {
    if (!connected) return;
    socket.emit('hello', 'client hazır', (res) => {
      setReply(res);
    });
  }, [connected, socket]);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32, lineHeight: 1.6 }}>
      <h1>⚽ Açık Artırma Ligi</h1>
      <p>
        Sunucu bağlantısı: <strong>{connected ? '🟢 bağlı' : '🔴 bağlanıyor…'}</strong>
      </p>
      <p>
        Sunucu yanıtı: <code>{reply}</code>
      </p>
      <hr />
      <p style={{ color: '#666' }}>
        Faz 0 iskeleti. Sıradaki: Lobi ekranı (Kişi 1) &amp; veri seti (Kişi 2).
      </p>
    </main>
  );
}
