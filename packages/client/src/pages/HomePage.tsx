import { useState } from 'react';
import { DEFAULT_ROOM_CONFIG } from '@fal/shared';
import { HowToPlay } from '../components/HowToPlay.js';
import { createRoom, joinRoom } from '../lib/roomClient.js';
import { saveSession } from '../lib/session.js';
import { useRoomStore } from '../store.js';

const NICK_KEY = 'fal:nickname';

const { squad, squadSize, startingBudget } = DEFAULT_ROOM_CONFIG;

export function HomePage() {
  const enterRoom = useRoomStore((s) => s.enterRoom);
  const connected = useRoomStore((s) => s.connected);
  const notice = useRoomStore((s) => s.notice);
  const setNotice = useRoomStore((s) => s.setNotice);

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
    <>
      <div className="panel gold">
        <h1 className="headline">
          Kadronu
          <br />
          açık artırmayla kur
        </h1>
        <p className="lede">Yeni bir oda kur ya da bir oda koduyla arkadaşlarına katıl.</p>

        {notice && (
          <div className="panel cobalt" style={{ marginBottom: 16 }}>
            <p style={{ margin: 0 }}>{notice}</p>
            <button
              type="button"
              className="btn-outline"
              style={{ marginTop: 10, padding: '6px 12px', fontSize: 13 }}
              onClick={() => setNotice(null)}
            >
              Tamam
            </button>
          </div>
        )}

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

      {/*
        ARAMA MOTORU İÇİN KALICI İÇERİK — kaldırmayın.

        Google sayfayı JS çalıştıktan SONRAKİ DOM'dan indeksler; index.html'deki
        statik blok React mount olunca siliniyor, yani oraya yazılan metin
        sıralamaya girmez. "Nasıl oynanır" anlatımı da yalnız modalde duruyor ve
        modal açılmadan DOM'a hiç girmiyor. Bu yüzden oyunun ne olduğu burada,
        ana sayfanın kalıcı bir parçası olarak anlatılıyor — hem yeni gelen
        oyuncu için hem arama motoru için.

        Sayılar DEFAULT_ROOM_CONFIG'ten okunur ki ayar değişince metin
        kendiliğinden güncellensin (elle senkron tutulacak ikinci kaynak olmasın).
      */}
      <section className="panel" style={{ marginTop: 20 }} aria-labelledby="hakkinda-baslik">
        <h2 id="hakkinda-baslik" className="headline" style={{ fontSize: 24 }}>
          Futbol açık artırma oyunu nedir?
        </h2>
        <p className="lede">
          Açık Artırma Ligi, tarayıcıdan oynanan ücretsiz bir futbol açık artırma oyunudur.
          Arkadaşlarınla aynı odaya girer, sahte bir futbolcu piyasasında açık arttırmaya
          katılırsın: her turda bir futbolcu ortaya çıkar, süre dolmadan en yüksek teklifi veren onu
          kadrosuna katar. Kadrolar dolunca eleme turnuvası başlar ve şampiyon belirlenir.
        </p>
        <p className="lede">
          Kurulum, indirme ya da üyelik yok. Bir oda kurup kodu arkadaşlarına göndermen yeterli. Tek
          başına da oynayabilirsin — eksik takımları, gerçek oyuncu gibi teklif veren botlar
          doldurur.
        </p>

        <h3 className="section-label">Nasıl oynanır?</h3>
        <ol className="lede" style={{ paddingLeft: 20 }}>
          <li>Takma adını yaz, yeni bir oda kur ya da oda koduyla arkadaşının odasına katıl.</li>
          <li>
            Açık artırma başlar: sıra sendeyken açılış teklifini verirsin, sonra herkes serbestçe
            teklif verir. Son saniye teklifi süreyi uzatır, kimse sondan vurup kaçamaz.
          </li>
          <li>
            Bütçeni doğru dağıt. Havuzda herkese tam yetecek kadar futbolcu var; bir yıldıza
            gereğinden fazla ödersen kalan mevkileri ucuzlarla doldurmak zorunda kalırsın.
          </li>
          <li>
            Kadrolar tamamlanınca eleme turnuvası oynanır: maçlar dakika dakika simüle edilir,
            beraberlikte uzatma, hâlâ eşitse canlı seri penaltı gelir.
          </li>
        </ol>

        <h3 className="section-label">Kurallar</h3>
        <ul className="lede" style={{ paddingLeft: 20 }}>
          <li>
            Kadro {squadSize} futbolcu: {squad.GK} kaleci, {squad.DEF} defans, {squad.MID} orta
            saha, {squad.FWD} forvet. Eksik mevkiyle turnuvaya giremezsin.
          </li>
          <li>
            Başlangıç bütçesi {startingBudget}M. Taban fiyat yok — fiyatı tamamen rekabet belirler.
          </li>
          <li>2, 4 ya da 8 takımlık eleme turnuvası; odaya 1-8 oyuncu girebilir.</li>
          <li>
            Takım gücü futbolcuların genel reytinginden hesaplanır; forvet hücuma, defans ve kaleci
            savunmaya, orta saha ikisine birden katkı verir.
          </li>
        </ul>

        <h3 className="section-label">Seri penaltı — köşe oyunu</h3>
        <p className="lede" style={{ marginBottom: 0 }}>
          Turnuva maçı uzatmada da berabere biterse seri penaltıyı canlı oynarsın. Atıcı ve kaleci
          aynı anda ve birbirinden gizli şekilde sol, orta ya da sağ köşeyi seçer. Kaleci köşeyi
          bilirse kurtarma şansı yükselir; yani iş şansa değil rakibini okumaya kalır.
        </p>
      </section>
    </>
  );
}
