import { useEffect } from 'react';
import { DEFAULT_ROOM_CONFIG } from '@fal/shared';

interface Props {
  onClose: () => void;
}

const { squad, squadSize, startingBudget, turnDurationSec, bidDurationSec, minBidIncrement } =
  DEFAULT_ROOM_CONFIG;

/**
 * Oynanış anlatımı — ayrı sayfaya gitmeden, ekranın üstünde açılan pencere.
 *
 * Sayılar `DEFAULT_ROOM_CONFIG`'ten okunur; kadro ya da bütçe ayarı değişirse
 * metin kendiliğinden güncellenir (elle senkron tutulacak ikinci bir kaynak
 * oluşmasın diye).
 */
export function HowToPlay({ onClose }: Props) {
  // Esc ile kapansın; açıkken arka plan kaymasın.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const totalRounds = `${squadSize} × oyuncu sayısı`;

  return (
    <div className="htp-backdrop" onClick={onClose} role="presentation">
      <div
        className="htp-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="htp-title"
      >
        <div className="htp-head">
          <div>
            <div className="round-label">Kısa rehber</div>
            <h2 id="htp-title" className="htp-title">
              Nasıl oynanır?
            </h2>
          </div>
          <button className="htp-close" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        <div className="htp-body">
          <p className="htp-lede">
            Sahte bir futbolcu piyasasında <strong>açık artırmayla</strong> kadro kurarsın. Kadrolar
            tamamlanınca maçlar simüle edilir ve bir <strong>eleme turnuvası</strong> şampiyonu
            belirler.
          </p>

          <section className="htp-step">
            <div className="htp-step-no">1</div>
            <div className="htp-step-body">
              <h3>Lobi</h3>
              <p>
                Oda kurup kodu paylaş ya da bir kodla katıl. Host turnuva boyutunu seçer:{' '}
                <strong>4 veya 8 takım</strong>. Eksik takımlar <strong>botlarla</strong> dolar —
                yani tek başına da oynayabilirsin.
              </p>
              <p>
                Oda kurulurken <strong>bütçe modu</strong> seçilir ve sonra değişmez:
              </p>
              <ul>
                <li>
                  <strong>Açık bütçe</strong> — rakiplerin kalan parasını görürsün. Botlar da görür
                  ve buna göre teklif verir.
                </li>
                <li>
                  <strong>Gizli bütçe</strong> — kimse kimsenin parasını göremez. Botlar da göremez.
                </li>
              </ul>
            </div>
          </section>

          <section className="htp-step">
            <div className="htp-step-no">2</div>
            <div className="htp-step-body">
              <h3>Açık artırma</h3>
              <p>
                Herkes <strong>{startingBudget}M</strong> bütçeyle başlar ve tam{' '}
                <strong>{squadSize} oyuncu</strong> alır:
              </p>
              <div className="htp-squad">
                <span>{squad.GK} kaleci</span>
                <span>{squad.DEF} defans</span>
                <span>{squad.MID} orta saha</span>
                <span>{squad.FWD} forvet</span>
              </div>
              <p>
                Draft <strong>{totalRounds}</strong> tur sürer (4 oyuncu → 28 tur) ve her tur bir
                futbolcunun artırmasıdır. Havuzda pozisyon başına <strong>tam ihtiyaç kadar</strong>{' '}
                futbolcu vardır — yani herkes kadrosunu doldurur, ama beklersen geriye kimsenin
                istemediği kalır.
              </p>
              <p>Her tur iki evrelidir:</p>
              <ul>
                <li>
                  <strong>Açılış ({turnDurationSec} sn)</strong> — sıradaki kişi açılışı yapmak{' '}
                  <em>zorundadır</em>, en az {minBidIncrement}M. Süre dolarsa sunucu onun adına
                  asgari teklifle açar.
                </li>
                <li>
                  <strong>Pas hakkı</strong> — oyun boyunca 2 takımda <strong>1</strong>, 4 ve 8
                  takımda <strong>2</strong> kez, açılış sırası sendeyken istemediğin futbolcuya
                  "pas" diyebilirsin. Futbolcu masada kalır, açılış <em>pas demeyenlerden</em>{' '}
                  rastgele birine geçer; sen o turda teklif veremezsin. Tur sınırı yok — herkes pas
                  derse sıra (son pas diyen hariç) rastgele birine geri döner; hakkı kalmayan açmak
                  zorunda kalır.
                </li>
                <li>
                  <strong>Serbest teklif ({bidDurationSec} sn)</strong> — o pozisyona hâlâ ihtiyacı
                  olan herkes teklif verebilir. Son saniyede gelen teklif süreyi{' '}
                  <strong>5 sn uzatır</strong>, böylece kimse son anda kapıp kaçamaz.
                </li>
              </ul>
              <p className="htp-note">
                <strong>Taban fiyat yoktur.</strong> Fiyatı tamamen rekabet belirler. Kadrosu o
                pozisyonda dolan kişi teklif veremez.
              </p>
            </div>
          </section>

          <section className="htp-step">
            <div className="htp-step-no">3</div>
            <div className="htp-step-body">
              <h3>Turnuva</h3>
              <p>
                Kadrolar tamamlanınca eleme ağacı kurulur. Maçlar dakika dakika simüle edilir;{' '}
                <strong>bir insanın oynadığı maçlar canlı</strong> akar, bot–bot maçlar anında
                sonuçlanır. Beraberlikte önce <strong>30 dakika uzatma</strong>, hâlâ eşitse{' '}
                <strong>seri penaltı</strong> vardır.
              </p>
              <p className="htp-note">
                <strong>Seri penaltıyı sen atarsın.</strong> Her vuruşta atıcı ve kaleci aynı anda,
                gizlice <strong>sol / orta / sağ</strong> seçer (8 saniye; ekrandaki kale ya da
                butonlar, klavyede ← ↑ →). Kaleci yanlış köşeye giderse gol neredeyse kesin, doğru
                köşeyi bilirse iyi kaleci çoğunu çeler. Üç köşe eşit güçte — kazandıran, rakibin
                alışkanlığını okumak; botların da favori köşesi var ve seni okumaya çalışırlar. Süre
                dolarsa ortaya vurursun / ortada kalırsın.
              </p>
              <p className="htp-note">
                <strong>Maçı belirleyen sayı GÜÇ'tür</strong> ve tek girdisi futbolcunun{' '}
                <strong>genel reytingi</strong>dir. Mevki, reytingin nereye aktığını belirler:{' '}
                <strong>kaleci ve defans</strong> tamamen savunmaya, <strong>forvet</strong> tamamen
                hücuma, <strong>orta saha</strong> ağırlıkla hücuma (1.5) ve biraz savunmaya (0.5)
                yazılır. Takımın hücum ve savunma gücü bu ağırlıklı ortalamalardır; güç ikisinin
                ortalamasıdır.
              </p>
              <p>
                Pratik kural: <strong>reyting her mevkide aynı değerdedir.</strong> 90'lık bir
                kaleci de 90'lık bir forvet de takım gücüne aynı miktarı katar; fark, gücün hücuma
                mı savunmaya mı gittiğidir. Maçta hücumun rakibin savunmasıyla karşılaştırılır — bir
                tarafı ihmal etmek diğerini şişirmekle telafi edilmez.
              </p>
            </div>
          </section>

          <div className="htp-tips">
            <div className="section-label">Kazandıran ipuçları</div>
            <ul>
              <li>
                <strong>Bütçeni erken bitirme.</strong> Havuz tam denk olduğu için son turlarda da
                alman gereken oyuncular var; parası biten asgari teklifle yetinmek zorunda kalır.
              </li>
              <li>
                <strong>Ama beklemek de bedava değil.</strong> Sen beklerken iyiler tükenir — geriye
                kalan gerçekten kimsenin istemediğidir.
              </li>
              <li>
                <strong>Açık bütçe modunda rakip parasını izle.</strong> Rakibin parası bittiyse
                ucuza kapatabilirsin.
              </li>
              <li>
                <strong>Kadro derinliği penaltıda işe yarar.</strong> Seri penaltıda 5. atışı bir
                defans, uzayan seride kaleci atar; iyi bir kaleci köşeyi bildiğinde neredeyse
                hepsini çeler.
              </li>
            </ul>
          </div>

          <p className="footnote" style={{ marginBottom: 0 }}>
            Oyun sırasında odadan çıkabilirsin — yerine bot geçer ve kadronla oynamaya devam eder,
            diğerlerinin oyunu bölünmez.
          </p>
        </div>

        <div className="htp-foot">
          <button className="btn-primary" onClick={onClose}>
            Anladım, başlayalım
          </button>
        </div>
      </div>
    </div>
  );
}
