import { DEFAULT_ROOM_CONFIG } from '@fal/shared';
import { useLang } from '../i18n/index.js';

const { squad, squadSize, startingBudget } = DEFAULT_ROOM_CONFIG;

/**
 * ARAMA MOTORU İÇİN KALICI İÇERİK — kaldırmayın.
 *
 * Google sayfayı JS çalıştıktan SONRAKİ DOM'dan indeksler; index.html'deki
 * statik blok React mount olunca siliniyor, yani oraya yazılan metin
 * sıralamaya girmez. "Nasıl oynanır" anlatımı da yalnız modalde duruyor ve
 * modal açılmadan DOM'a hiç girmiyor. Bu yüzden oyunun ne olduğu burada,
 * ana sayfanın kalıcı bir parçası olarak anlatılıyor — hem yeni gelen
 * oyuncu için hem arama motoru için. Varsayılan dil Türkçe olduğu için
 * tarayıcı Türkçe metni görür; İngilizce yalnız kullanıcı seçerse.
 *
 * Sayılar DEFAULT_ROOM_CONFIG'ten okunur ki ayar değişince metin
 * kendiliğinden güncellensin (elle senkron tutulacak ikinci kaynak olmasın).
 */
export function HomeAbout() {
  return useLang() === 'en' ? <AboutEn /> : <AboutTr />;
}

function AboutTr() {
  return (
    <section className="panel" style={{ marginTop: 20 }} aria-labelledby="hakkinda-baslik">
      <h2 id="hakkinda-baslik" className="headline" style={{ fontSize: 24 }}>
        Futbol açık artırma oyunu nedir?
      </h2>
      <p className="lede">
        Açık Artırma Ligi, tarayıcıdan oynanan ücretsiz bir futbol açık artırma oyunudur.
        Arkadaşlarınla aynı odaya girer, sahte bir futbolcu piyasasında açık arttırmaya katılırsın:
        her turda bir futbolcu ortaya çıkar, süre dolmadan en yüksek teklifi veren onu kadrosuna
        katar. Kadrolar dolunca eleme turnuvası başlar ve şampiyon belirlenir.
      </p>
      <p className="lede">
        Kurulum, indirme ya da üyelik yok. Bir oda kurup kodu arkadaşlarına göndermen yeterli. Tek
        başına da oynayabilirsin — eksik takımları, gerçek oyuncu gibi teklif veren botlar doldurur.
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
          Kadro {squadSize} futbolcu: {squad.GK} kaleci, {squad.DEF} defans, {squad.MID} orta saha,{' '}
          {squad.FWD} forvet. Eksik mevkiyle turnuvaya giremezsin.
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
  );
}

function AboutEn() {
  return (
    <section className="panel" style={{ marginTop: 20 }} aria-labelledby="hakkinda-baslik">
      <h2 id="hakkinda-baslik" className="headline" style={{ fontSize: 24 }}>
        What is the football auction game?
      </h2>
      <p className="lede">
        Açık Artırma Ligi (Auction League) is a free football auction game you play in your browser.
        You join a room with your friends and bid in a mock transfer market: each round one player
        comes up, and whoever has the highest bid when the clock runs out adds them to their squad.
        Once every squad is complete, a knockout tournament decides the champion.
      </p>
      <p className="lede">
        No installs, downloads or sign-ups. Just create a room and send the code to your friends.
        You can also play solo — bots that bid like real players fill the empty teams.
      </p>

      <h3 className="section-label">How to play?</h3>
      <ol className="lede" style={{ paddingLeft: 20 }}>
        <li>Enter a nickname, create a new room or join a friend&apos;s room with its code.</li>
        <li>
          The auction begins: when it&apos;s your turn you make the opening bid, then everyone bids
          freely. A last-second bid extends the clock, so nobody can snipe at the buzzer.
        </li>
        <li>
          Spend your budget wisely. The pool has exactly enough players for everyone; overpay for
          one star and you&apos;ll have to fill the other positions with cheap players.
        </li>
        <li>
          When the squads are complete, a knockout tournament is played: matches are simulated
          minute by minute, a draw goes to extra time, and if it&apos;s still level there&apos;s a
          live penalty shootout.
        </li>
      </ol>

      <h3 className="section-label">Rules</h3>
      <ul className="lede" style={{ paddingLeft: 20 }}>
        <li>
          A squad has {squadSize} players: {squad.GK} goalkeeper, {squad.DEF} defenders, {squad.MID}{' '}
          midfielders, {squad.FWD} forwards. You can&apos;t enter the tournament with a position
          missing.
        </li>
        <li>
          Starting budget is {startingBudget}M. There is no reserve price — competition alone sets
          the price.
        </li>
        <li>2, 4 or 8-team knockout tournament; 1–8 players can join a room.</li>
        <li>
          Team power comes from the players&apos; overall ratings; forwards add to attack, defenders
          and the goalkeeper to defense, midfielders to both.
        </li>
      </ul>

      <h3 className="section-label">Penalty shootout — the corner game</h3>
      <p className="lede" style={{ marginBottom: 0 }}>
        If a tournament match is still level after extra time, you play the shootout live. The taker
        and the keeper pick left, center or right at the same time, in secret. If the keeper guesses
        the corner, the chance of a save goes up — so it&apos;s not about luck, it&apos;s about
        reading your opponent.
      </p>
    </section>
  );
}
