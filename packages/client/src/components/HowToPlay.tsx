import { useEffect } from 'react';
import { DEFAULT_ROOM_CONFIG } from '@fal/shared';
import { useLang, useT } from '../i18n/index.js';

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
  const t = useT();
  const lang = useLang();
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
            <div className="round-label">{t.howTo.kicker}</div>
            <h2 id="htp-title" className="htp-title">
              {t.howTo.title}
            </h2>
          </div>
          <button className="htp-close" onClick={onClose} aria-label={t.howTo.close}>
            ✕
          </button>
        </div>

        {lang === 'en' ? <BodyEn /> : <BodyTr />}

        <div className="htp-foot">
          <button className="btn-primary" onClick={onClose}>
            {t.howTo.gotIt}
          </button>
        </div>
      </div>
    </div>
  );
}

function BodyTr() {
  const totalRounds = `${squadSize} × oyuncu sayısı`;
  return (
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
            <strong>2, 4 veya 8 takım</strong>. Eksik takımlar <strong>botlarla</strong> dolar —
            yani tek başına da oynayabilirsin.
          </p>
          <p>
            Oda kurulurken <strong>bütçe modu</strong> ve <strong>bot zorluğu</strong> seçilir,
            sonra değişmez:
          </p>
          <ul>
            <li>
              <strong>Açık bütçe</strong> — rakiplerin kalan parasını görürsün. Botlar da görür ve
              buna göre teklif verir.
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
              <em>zorundadır</em>, en az {minBidIncrement}M. Süre dolarsa sunucu onun adına asgari
              teklifle açar.
            </li>
            <li>
              <strong>Pas hakkı</strong> — oyun boyunca 2 takımda <strong>1</strong>, 4 ve 8 takımda{' '}
              <strong>2</strong> kez, açılış sırası sendeyken istemediğin futbolcuya "pas"
              diyebilirsin. Futbolcu masada kalır, açılış <em>pas demeyenlerden</em> rastgele birine
              geçer; sen o turda teklif veremezsin. Tur sınırı yok — herkes pas derse sıra (son pas
              diyen hariç) rastgele birine geri döner; hakkı kalmayan açmak zorunda kalır.
            </li>
            <li>
              <strong>Serbest teklif ({bidDurationSec} sn)</strong> — o pozisyona hâlâ ihtiyacı olan
              herkes teklif verebilir. Son saniyede gelen teklif süreyi <strong>5 sn uzatır</strong>
              , böylece kimse son anda kapıp kaçamaz.
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
            Pratik kural: <strong>reyting her mevkide aynı değerdedir.</strong> 90'lık bir kaleci de
            90'lık bir forvet de takım gücüne aynı miktarı katar; fark, gücün hücuma mı savunmaya mı
            gittiğidir. Maçta hücumun rakibin savunmasıyla karşılaştırılır — bir tarafı ihmal etmek
            diğerini şişirmekle telafi edilmez.
          </p>
        </div>
      </section>

      <div className="htp-tips">
        <div className="section-label">Kazandıran ipuçları</div>
        <ul>
          <li>
            <strong>Bütçeni erken bitirme.</strong> Havuz tam denk olduğu için son turlarda da alman
            gereken oyuncular var; parası biten asgari teklifle yetinmek zorunda kalır.
          </li>
          <li>
            <strong>Ama beklemek de bedava değil.</strong> Sen beklerken iyiler tükenir — geriye
            kalan gerçekten kimsenin istemediğidir.
          </li>
          <li>
            <strong>Açık bütçe modunda rakip parasını izle.</strong> Rakibin parası bittiyse ucuza
            kapatabilirsin.
          </li>
          <li>
            <strong>Kadro derinliği penaltıda işe yarar.</strong> Seri penaltıda 5. atışı bir
            defans, uzayan seride kaleci atar; iyi bir kaleci köşeyi bildiğinde neredeyse hepsini
            çeler.
          </li>
        </ul>
      </div>

      <p className="footnote" style={{ marginBottom: 0 }}>
        Oyun sırasında odadan çıkabilirsin — yerine bot geçer ve kadronla oynamaya devam eder,
        diğerlerinin oyunu bölünmez.
      </p>
    </div>
  );
}

function BodyEn() {
  const totalRounds = `${squadSize} × number of players`;
  return (
    <div className="htp-body">
      <p className="htp-lede">
        You build a squad at <strong>auction</strong> in a mock transfer market. When the squads are
        complete, the matches are simulated and a <strong>knockout tournament</strong> decides the
        champion.
      </p>

      <section className="htp-step">
        <div className="htp-step-no">1</div>
        <div className="htp-step-body">
          <h3>Lobby</h3>
          <p>
            Create a room and share the code, or join with a code. The host picks the tournament
            size: <strong>2, 4 or 8 teams</strong>. Empty teams are filled with{' '}
            <strong>bots</strong> — so you can play solo too.
          </p>
          <p>
            The <strong>budget mode</strong> and <strong>bot difficulty</strong> are chosen when the
            room is created and can&apos;t be changed later:
          </p>
          <ul>
            <li>
              <strong>Open budget</strong> — you see your rivals&apos; remaining money. So do the
              bots, and they bid accordingly.
            </li>
            <li>
              <strong>Hidden budget</strong> — nobody can see anyone&apos;s money. Neither can the
              bots.
            </li>
          </ul>
        </div>
      </section>

      <section className="htp-step">
        <div className="htp-step-no">2</div>
        <div className="htp-step-body">
          <h3>The auction</h3>
          <p>
            Everyone starts with a <strong>{startingBudget}M</strong> budget and buys exactly{' '}
            <strong>{squadSize} players</strong>:
          </p>
          <div className="htp-squad">
            <span>{squad.GK} goalkeeper</span>
            <span>{squad.DEF} defenders</span>
            <span>{squad.MID} midfielders</span>
            <span>{squad.FWD} forwards</span>
          </div>
          <p>
            The draft lasts <strong>{totalRounds}</strong> rounds (4 players → 28 rounds) and each
            round auctions one player. The pool has <strong>exactly as many</strong> players per
            position as needed — so everyone fills their squad, but if you wait, you&apos;re left
            with the ones nobody wanted.
          </p>
          <p>Each round has two phases:</p>
          <ul>
            <li>
              <strong>Opening ({turnDurationSec} s)</strong> — the next player in line <em>must</em>{' '}
              open the bidding, at least {minBidIncrement}M. If time runs out, the server opens with
              the minimum bid on their behalf.
            </li>
            <li>
              <strong>Passes</strong> — during the game you can say &quot;pass&quot; to a player you
              don&apos;t want when it&apos;s your turn to open: <strong>1</strong> time with 2
              teams, <strong>2</strong> times with 4 or 8 teams. The player stays on the table and
              the opening moves at random to <em>someone who hasn&apos;t passed</em>; you can&apos;t
              bid that round. There&apos;s no per-round limit — if everyone passes, the turn goes
              back to someone at random (except the last to pass); whoever has no passes left must
              open.
            </li>
            <li>
              <strong>Open bidding ({bidDurationSec} s)</strong> — anyone who still needs that
              position can bid. A bid in the final seconds <strong>adds 5 s</strong> to the clock,
              so nobody can snipe at the last moment.
            </li>
          </ul>
          <p className="htp-note">
            <strong>There is no reserve price.</strong> Competition alone sets the price. Once your
            squad is full at a position, you can&apos;t bid on players in it.
          </p>
        </div>
      </section>

      <section className="htp-step">
        <div className="htp-step-no">3</div>
        <div className="htp-step-body">
          <h3>The tournament</h3>
          <p>
            When the squads are complete, the knockout bracket is drawn. Matches are simulated
            minute by minute; <strong>matches with a human player are played live</strong>, bot vs
            bot matches finish instantly. A draw goes to <strong>30 minutes of extra time</strong>,
            and if it&apos;s still level, a <strong>penalty shootout</strong>.
          </p>
          <p className="htp-note">
            <strong>You take the penalties yourself.</strong> On every kick the taker and the keeper
            secretly pick <strong>left / center / right</strong> at the same time (8 seconds; tap
            the goal or the buttons, or use ← ↑ → on the keyboard). If the keeper goes the wrong way
            it&apos;s almost always a goal; if he guesses the corner, a good keeper saves most of
            them. All three corners are equally strong — what wins is reading your opponent&apos;s
            habits; bots have favorite corners too and try to read you. If time runs out you shoot
            down the middle / stay in the middle.
          </p>
          <p className="htp-note">
            <strong>The number that decides a match is POWER</strong>, and its only input is each
            player&apos;s <strong>overall rating</strong>. The position decides where the rating
            goes: <strong>goalkeepers and defenders</strong> count fully toward defense,{' '}
            <strong>forwards</strong> fully toward attack, and <strong>midfielders</strong> mostly
            toward attack (1.5) and a bit toward defense (0.5). A team&apos;s attack and defense are
            these weighted averages; power is the average of the two.
          </p>
          <p>
            Rule of thumb: <strong>a rating point is worth the same at every position.</strong> A
            90-rated goalkeeper and a 90-rated forward add the same amount to team power; the
            difference is whether it goes to attack or defense. In a match your attack is compared
            with the rival&apos;s defense — neglecting one side can&apos;t be made up for by
            inflating the other.
          </p>
        </div>
      </section>

      <div className="htp-tips">
        <div className="section-label">Winning tips</div>
        <ul>
          <li>
            <strong>Don&apos;t run out of money early.</strong> The pool is exactly balanced, so
            there are still players you must buy in the last rounds; whoever is out of money has to
            settle for minimum bids.
          </li>
          <li>
            <strong>But waiting isn&apos;t free either.</strong> While you wait, the good ones run
            out — what&apos;s left is what nobody really wanted.
          </li>
          <li>
            <strong>In open budget mode, watch your rivals&apos; money.</strong> If a rival is out
            of money, you can pick players up cheaply.
          </li>
          <li>
            <strong>Squad depth matters in a shootout.</strong> In a shootout a defender takes the
            5th kick, and in a long one the goalkeeper steps up; a good keeper who guesses the
            corner saves almost all of them.
          </li>
        </ul>
      </div>

      <p className="footnote" style={{ marginBottom: 0 }}>
        You can leave the room mid-game — a bot takes your place and keeps playing with your squad,
        so nobody else&apos;s game is interrupted.
      </p>
    </div>
  );
}
