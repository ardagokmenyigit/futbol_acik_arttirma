# Proje: Açık Artırma Ligi (Football Auction League)

Bu dosya, projeyi Claude Code'a tanıtmak ve iki geliştirici arasındaki görev
dağılımını netleştirmek için hazırlanmıştır. Her oturumda bu dosyayı referans
al, kodlama konvansiyonlarına ve mimariye sadık kal.

---

## 1. Oyun Nedir?

1-8 kişilik, gerçek zamanlı, tarayıcı tabanlı çok oyunculu bir web oyunu.
Oyuncular sahte bir futbolcu piyasasında **açık artırmayla** kadro kurar,
kadrolar tamamlanınca sistem **maçları simüle eder** ve bir **eleme
turnuvası** (2, 4 ya da 8 takım) sonunda kazananı belirler. Tek kişi de
oynayabilir — eksik takımlar botlarla tamamlanır. (Lig formatı kaldırıldı.)

### 1.1 Oyun Akışı (Uçtan Uca)

1. **Lobi**: Bir kullanıcı oda kurar (host), diğerleri oda koduyla katılır.
   Host turnuva boyutunu (2, 4 ya da 8 takım) seçer. Odaya o sayıya kadar insan
   girebilir; 1 kişi bile yeter. Bağlı herkes "hazır" işaretleyince host
   başlatır, eksik takımlar botlarla dolar.
2. **Draft (Açık Artırma) Fazı**: Tam yapı §3.1'de. Özet: draft havuzu
   pozisyon başına tam ihtiyaç kadar (4 oyuncu → 28 futbolcu), draft
   `squadSize × katılımcı` tur sürer, her tur bir futbolcunun açık
   artırmasıdır (zorunlu açılış + serbest teklif, taban fiyat yok; açıcının
   sınırlı **açılış pas hakkı** var, bkz. §3.1).
3. **Kadro Kuralları**: Her takım **7 oyuncu** — 1 GK, 2 DEF, 2 MID, 2 FWD.
   Başlangıç bütçesi **150M** (kurgusal, "M"). Kural dışı pozisyon veya
   bütçe aşımı → teklif reddedilir. (`DEFAULT_ROOM_CONFIG`, ayarlanabilir.)
4. **Simülasyon Fazı**: Tüm kadrolar tamamlanınca **eleme usulü turnuva**
   (2, 4 ya da 8 takım) kurulur; maçlar tur tur olay bazlı simüle edilir.
5. **Sonuç**: Turnuva ağacı, maç skorları, gol dakikaları ve şampiyon
   gösterilir.

---

## 2. Teknoloji Yığını

| Katman         | Teknoloji                                                                               |
| -------------- | --------------------------------------------------------------------------------------- |
| Frontend       | React + TypeScript + Vite                                                               |
| Backend        | Node.js + TypeScript + Socket.io + Express                                              |
| Paylaşılan kod | `packages/shared` içinde ortak TS tipleri                                               |
| State yönetimi | Sunucu tarafında in-memory (Map<roomId, RoomState>); istemcide Zustand veya React state |
| Veri deposu    | Futbolcu havuzu için statik JSON (`packages/server/data/players.json`)                  |
| Deployment     | Vercel (client), Railway veya Fly.io (server)                                           |

### 2.1 Proje Yapısı

```
.
├── packages/
│   ├── client/
│   │   ├── src/
│   │   │   ├── pages/        # Lobi, Draft, Maç Sonucu, Puan Tablosu ekranları
│   │   │   ├── components/
│   │   │   ├── hooks/        # useSocket, useAuctionState vb.
│   │   │   └── App.tsx
│   ├── server/
│   │   ├── src/
│   │   │   ├── rooms/        # Oda/lobi yönetimi
│   │   │   ├── auction/      # Açık artırma motoru
│   │   │   ├── simulation/   # Maç simülasyon algoritması
│   │   │   ├── league/       # Fikstür ve puan tablosu mantığı
│   │   │   └── index.ts      # Socket.io server giriş noktası
│   │   └── data/players.json
│   └── shared/
│       └── src/types.ts      # Footballer, Team, RoomState, SocketEvent tipleri
├── .github/workflows/        # CI (lint, build)
├── package.json              # npm workspaces root
├── README.md
└── CLAUDE.md                 # bu dosya
```

---

## 3. Kritik Algoritmalar (Detaylı)

### 3.1 Açık Artırma (Draft) Motoru

> Güncel yapı. Eski "serbest teklif + tek havuz" ve ondan sonraki "sıra
> tabanlı teklif/pas" modelleri KALDIRILDI.

**Havuz tam denk.** Draft başında `buildDraftPool()` pozisyon başına TAM
OLARAK ihtiyaç kadar futbolcu seçer: 4 katılımcı → 4 kaleci, 8 defans,
8 orta saha, 8 forvet = 28 futbolcu. Sonuçları:

- 28 satış + kişi başı kadro tavanı 7 → herkes tam kadroyla biter (aritmetik).
- "Beklersem ucuza kaparım" bedava olmaktan çıkar: beklerken iyiler tükenir,
  elde kalan gerçekten kimsenin istemediğidir. (Eski geniş havuzda 28 slot
  için 108 futbolcu vardı; beklemenin hiçbir maliyeti yoktu.)

**Draft `squadSize × katılımcı` TUR sürer** (4 oyuncu → 28 tur). Her tur bir
futbolcunun açık artırmasıdır ve iki evrelidir:

1. **`opening` — açılış teklifi ZORUNLU.** Sıradaki (kadrosu hâlâ eksik olan
   ilk) katılımcı açılışı yapar. Futbolcu, AÇILIŞI YAPACAK KİŞİNİN ihtiyacına
   göre havuzdan seçilir — böylece sıradaki her zaman açabilir ve "sıra sende,
   ihtiyacın olan biri geliyor" sezgisi korunur. Süre (`turnDurationSec`)
   dolarsa sunucu onun adına `minBidIncrement` ile açar. Bu sayede her turda
   mutlaka gerçek bir teklif olur; "kimse teklif vermedi, bedavaya gitti"
   durumu ortadan kalkar. Tek istisna aşağıdaki **açılış pası**.
2. **`bidding` — serbest teklif.** Pozisyona girebilen herkes teklif verebilir,
   istemeyen vermez, fikri değişirse geri girer. Süre `bidDurationSec`;
   son saniye teklifi mümkün olduğu için **anti-snipe (5sn) devrede.**
   Süre bitiminde en yüksek teklif kazanır (`auction:won`).

**AÇILIŞ PASI (`auction:pass`).** Açıcının `Participant.passesLeft` hakkı
varsa istemediği futbolcuya pas diyebilir. Oyun başına hak `passesForSize`:
2 takım → 1, 4 ve 8 takım → 2 (`shared/config.ts` `PASSES_BY_SIZE`);
`startDraft` ve rövanşta yeniden dağıtılır. Kurallar:

- Futbolcu **masada kalır**; açılış görevi bu turda pas demeyen uygun
  katılımcılardan **rastgele** birine geçer (`pickNextOpener`), açılış süresi
  baştan başlar, `auction:passed` yayınlanır.
- Pas diyen o turda **teklif de veremez** (`eligibleIds`'den düşer,
  `passedIds`'e girer). Aksi halde "açılışı başkasına yıkıp sonra ucuza kap"
  bedava olurdu.
- **Tur sınırı yok**: herkes pas derse dışlama sıfırlanır, son pas diyen hariç
  uygun herkesten rastgele seçilir; hakkı olan yine pas diyebilir, olmayan
  açmak zorunda kalır. Haklar sonlu olduğu için zincir her zaman biter.
  Herkes pas dediyse bidding'de kimse teklif veremez → zorunlu açıcı
  futbolcuyu asgariden alır (bilinçli: pası herkes harcadıysa bedeli budur).
- Süre dolunca sunucu pas DEĞİL asgari açılış yapar (`autoOpen`).
- Botlar (`botShouldPass`): futbolcu havuzda kalan aynı mevkidekilerin alt
  diliminde (eşik kişiliğe bağlı %25–%50) ve ihtiyaçtan en az 2 fazla aday
  varsa pas; kıtlıkta asla. Bot açılış/teklif değerlemesi pas diyenleri rakip
  saymaz (`rivalsFor` passedIds'i düşer).
- Doğrulama: `caffeinate -i npx tsx packages/server/src/scripts/e2ePass.ts`
  (gerçek sunucu + Socket.io istemcileri; 2 takım/1 pas ve 4 takım/2 pas
  senaryoları, hatalı çağrılar, değişmezler, tam kadro bitişi).

**TABAN FİYAT YOKTUR.** `Footballer.basePrice` hiçbir yerde kullanılmaz;
açılış `minBidIncrement` kadardır, fiyatı tamamen rekabet belirler.

**Sıra adaleti** (`server/src/auction/turnOrder.ts`): sıra yalnızca açılışı
belirler. Tur sayısı `squadSize × n` olduğu için r her zaman n'in katıdır;
döngüsel kaydırma her katılımcıya her sırayı tam `squadSize` kez verir →
**sıra numaralarının toplamı TÜM oyuncu sayılarında birebir eşittir (fark 0).**
(Eski 7 turluk yapıda çift oyuncu sayılarında bu matematiksel olarak
imkansızdı; 28 tur bunu çözüyor.) r, n'in katı değilse deterministik onarım
araması devreye girer ve teorik optimuma iner.

### 3.2 Maç Simülasyon Algoritması

**TEK KAYNAK: `packages/shared/src/simulation/simulator.ts`.**
`server/src/simulation/simulator.ts` ve `random.ts` yalnızca yeniden dışa
aktarır (`teamStats.ts` ile aynı desen). Motor bir dönem iki ayrı kopya
halindeydi ve sabitleri sessizce ayrışmıştı (`chanceRate` 0.3 vs 0.078,
`baseConversion` 0.088 vs 0.21) — aynı seed iki farklı skor, maç başına
2.73'e karşı 1.60 gol üretiyordu. **Motoru değiştiren yalnızca shared'daki
kopyayı değiştirir.**

Takım gücü `calculateTeamStats()` ile hesaplanır — **tek girdi GEN'dir**
(`overall`), mevki GEN'in hangi eksene aktığını belirler
(`POSITION_POWER_WEIGHT`, bkz. `shared/src/types.ts`):

| mevki   | hücum | savunma |
| ------- | ----- | ------- |
| GK, DEF | 0     | 2.0     |
| MID     | 1.5   | 0.5     |
| FWD     | 2.0   | 0       |

Takım hücumu = GEN'lerin hücum ağırlıklı ortalaması, savunma = savunma
ağırlıklı ortalaması; güç = ikisinin ortalaması. Sonuç doğal olarak 0–100'de
kalır, veri setine bağlı kalibrasyon yoktur.

**NEDEN GEN TABANLI (17 Eylül 2026).** Eski model oyuncu başına elle
kalibre edilmiş HÜC/SAV alanlarını mevki ağırlığıyla (+ MID rol ağırlığı)
topluyordu ve "aynı mevkide GEN yüksek olanın katkısı yüksektir" sözleşmesini
`checkPowerMonotonic.ts` ile doğruluyordu. Sözleşme veri setine yaslandığı
için kırılgandı: 16 Eylül veri güncellemesi (11 commit, doğrudan main'e)
**321 ihlal** üretti — Pedri (94) De Bruyne'den (91) ve Çalhanoğlu'ndan (88)
az güç veriyor, Mbappé (96) Olise'nin (94) altında kalıyordu. GEN tek kaynak
olunca mevki içinde GEN sırası = güç sırası yapısal olarak sağlanır; HÜC/SAV
alanları veri setinden kaldırıldı, kontrol scripti silindi.

- **MEVKİLER ARASI ADALET FORMÜLDEN GELİR.** Her oyuncu toplam 2.0 ağırlık
  taşır; varsayılan dizilişte (1-2-2-2) iki eksenin paydası da 7'dir
  (savunma 2+4+1, hücum 4+3). Dolayısıyla her mevkide 1 GEN puanı takım
  gücüne tam **1/7** katar. Orta sahanın 1.5/0.5 bölünmesi bu eşitliğin tek
  çözümüdür — sezgisel 1.0/1.0 paydaları 8/6 yapar ve forvetin GEN puanı
  stoperinkinden %33 değerli olur (GK/DEF 0.125, MID 0.146, FWD 0.167).
- **Rol ayrımı bilinçli olarak yok:** aynı GEN'deki Rodri ile De Bruyne
  takıma aynı şeyi katar. Kabul edilen sadeleştirme. Draft kartında yalnız GEN
  gösterilir — bir dönem `powerSplit` ile HÜC/SAV da yazılıyordu (MID 94 →
  HÜC 71 / SAV 24), kullanıcı "tek girdi GEN'se sadece o görünsün" dedi
  (18 Eylül 2026) ve kaldırıldı; kadro listesindeki "HÜC / SAV / HÜC+SAV"
  etiketi (reytingin aktığı eksen, sayı değil) ve takım düzeyindeki HÜC/SAV
  duruyor.
- **Yan etki ve kalibrasyon:** eski modelde takım hücumu savunmadan %3.6
  yüksekti (78.3 / 75.6; forvetlerin HÜC'ü stoperlerin SAV'ından yüksek
  girilmişti), tehdit oranı^3.2 ile ~%12 fazla gol demekti. Yeni modelde iki
  eksen eşit (84.6 / 84.7); gol/maç 3.66 → 3.27'ye düştü, `baseConversion`
  0.099 → 0.111 ile geri alındı. Penaltı becerisi `GEN − mevki cezası`
  (FWD 0, MID 3, DEF 26, GK 37 — eski `0.7·HÜC + 0.3·GEN` ile GEN arasındaki
  mevki ortalaması farkı), golcü seçimi `mevki ağırlığı × GEN/20` (ağırlıklar
  eski fiili oranlara göre: FWD 6, MID 2.7, DEF 0.4, GK 0.02).
- **Ölçüm — 5000 bot draft × 4 bracket (eski → yeni):** en güçlü şampiyon
  %43.2 → %45.6, en zayıf %11.4 → %10.1, oran 3.8x → 4.5x, gol/maç 3.66 →
  3.68, 0-0 %4.4 → %3.8, penaltı %26.7 → %26.0, harcama 133.5M → 132.8M.
  Penaltı gol oranı mevkiye göre FWD %73.9 · MID %72.8 · DEF %65.2 · GK
  %60.4 (eski %74.5 / %73.3 / %64.6 / %61.8). Güç biraz daha belirleyici
  oldu: 1 GEN artık 0.105 yerine 0.143 güç, draft'taki en iyi–en kötü farkı
  4.2 → 5.5 puana açıldı. İstenen yönde (bkz. aşağıdaki denge tablosu notu:
  "gücü baskın kılmak isteyen draft'ı değiştirmeli").

90 dakika döngüsü, "her dakika bağımsız yazı-tura" değil:

1. **Maç günü formu** — her takım ±%4 formla çıkar (`FORM_SPREAD`).
2. **Pozisyon üretimi** — `chanceRate` ile pozisyon doğar; kime ait olduğu
   `hücum / rakip savunma` tehdit oranıyla paylaştırılır.
3. **Pozisyon kalitesi** — gole dönme oranı da tehdit oranına bağlı, yani
   güçlü takım hem daha çok hem daha net fırsat bulur.
4. **Maç durumu** — geride kalan basar (hücum +%12, savunma −%7), 2+ farkla
   önde olan oyunu yönetir. Geri dönüşler buradan doğar.
5. **Tempo** — son 20 dakikada pozisyon üretimi artar.
6. **Uzatma** — turnuva maçı 90'da berabereyse aynı döngü 120. dakikaya kadar
   sürer (tempo 70+ kuralıyla 1.18); `MatchResult.extraTime = true`, skor
   uzatma gollerini içerir (u.s.), goller 91–120. dakikada.

**NEDEN UZATMA (17 Eylül 2026).** 90 dakikadaki beraberlik oranı ~~%26 —
gerçek futbolla (~~%25) uyumlu, düşürülmesi gereken bir şey değildi. Sorun
beraberliğin doğrudan penaltıya, yani yazı-turaya gitmesiydi: penaltıda güçlü
takım 1–4 puan farkta yalnız %51–56 kazanıyor. `baseConversion` ile bastırmak
pahalı çıktı (5000 draft taraması: 0.111 → 0.18, gol/maç 3.7 → 6.0, maçların
%71'i 5+ gollü; beraberlik yalnız %26 → %19.5 — eşit λ'lı Poisson'da eşitlik
olasılığı çok yavaş düşer). Uzatma ise güce duyarlı 30 dakika daha verir.
Ölçüm (5000 bot draft × 4 bracket, 60k maç; baseConversion 0.111 sabit):

| güç farkı | uzatmaya gider | penaltıya gider | uzatmada güçlü kazanır | penaltıda güçlü kazanır | tur geçme |
| --------- | -------------- | --------------- | ---------------------- | ----------------------- | --------- |
| 0–2p      | %28–29         | %13             | %54–60                 | %52                     | %56–61    |
| 3–4p      | %25–26         | %11–12          | %65                    | %53–54                  | %67–71    |
| 5–6p      | %22–23         | %9–10           | %72–73                 | %58–60                  | %77–81    |
| 7–8p      | %20            | %8              | %78–80                 | %62–66                  | %84–87    |

Toplam: penaltıya giden maç **%26 → %11.5**, en güçlü şampiyon %45.5 →
%47.3, en zayıf %9.6 → %8.9, normal süre gol/maç 3.68 sabit (uzatma
golleriyle 4.04). (Tablo sens 3.2 ile ölçüldü; aşağıdaki sens 2.4
kararından sonra tur geçme oranları ~4 puan düşer, penaltı payı aynı.)

**SENS 3.2 → 2.4 (17 Eylül 2026).** GEN tabanlı güç (draft farkı 4.2 → 5.5)
ve uzatma birlikte en güçlü takımın şampiyonluğunu %43.8 → %47.5'e
çıkarmıştı; kullanıcı "güç ana faktör kalsın ama biraz daha dengeli" dedi.
Tarama (5000 draft × 4 bracket, `baseConversion` her satırda gol/maç ~3.67'ye
eşlenmiş):

| sens    | en güçlü  | en zayıf  | oran | 3p  | 5p  | 6p  | 8p  |
| ------- | --------- | --------- | ---- | --- | --- | --- | --- |
| 3.2     | %47.5     | %9.3      | 5.1x | %67 | %76 | %80 | %89 |
| 2.8     | %45.4     | %10.2     | 4.5x | %66 | %73 | %79 | %84 |
| 2.5     | %43.0     | %10.7     | 4.0x | %63 | %71 | %76 | %84 |
| **2.4** | **%42.8** | **%11.6** | 3.7x | %63 | %71 | %74 | %82 |
| 2.2     | %41.6     | %12.4     | 3.3x | %62 | %70 | %72 | %78 |

(Sütunlar: güç farkına göre güçlünün turu geçme oranı.) 2.4 seçildi:
önceki kabul edilmiş dengeye (~%43, 4x) döner, `baseConversion` 0.116 ile
gol/maç 3.67. 2.2 ve altında 6p ile 8p arasındaki fark kapanıyor — büyük
yatırım küçük yatırımdan ayırt edilemez oluyor. Canlı ekranda uzatma ~4.6 sn ek süre alır
(`EXTRA_TIME_LIVE_MS`), ilerleme çubuğu altına döner, kartlarda "U.S."
etiketi görünür.

**SENS 2.4 → 3.3 (18 Eylül 2026).** Oyuncu geri bildirimi (7 puan güçlü
takımla yenilen arkadaş): "7 fark yapmak çok zor; 3–4 puan farkta güç daha
belirgin olsun, dengeyi bozmadan". İki gerçek not: (1) eğri her ayarda
düzdür, 3p→4p adımı ~5 puandır — duyarlılık eğrinin tamamını kaldırır,
"keskin eşik" hiçbir ayarla olmaz ve istenmemeli (küçük draft avantajını
değersizleştirir); (2) asıl tavan draft'tır (fark ort. ~5.3), 7'ye ulaşmak
zaten çok iyi draft demek. Tarama, **artık repoda olan**
`scripts/measureBalance.ts` ile (motoru birebir izleyen çevrimdışı bot
draft'ı + 4 bracket; taban çizgisini %41.6/%12.6, gol 3.68, fark 5.28 ile
belgeyle uyumlu üretir), gol/maç her satırda 3.67'ye kalibre:

| sens    | baseConv  | 3p      | 4p      | 5p      | 7p      | en güçlü (4 t.)  | en zayıf (4 t.) | 8 takım        |
| ------- | --------- | ------- | ------- | ------- | ------- | ---------------- | --------------- | -------------- |
| 2.4     | 0.116     | %62–65  | %66–67  | %70–72  | %76–79  | %41.6            | %12.6           | %30 / %2.5     |
| 2.8     | 0.110\*   | %64     | %69     | %74     | %81     | ~%45             | ~%10            | —              |
| 3.2     | 0.107\*   | %66     | %71     | %76     | %84     | %47.5 (eski öl.) | %9.3            | —              |
| 3.3     | 0.110     | %65     | %71     | %75     | %84     | %46.4            | %9.0            | %36 / %1.9     |
| 3.4     | 0.105\*   | %66     | %72     | %77     | %85     | ~%48             | ~%8             | —              |
| **3.5** | **0.108** | **%67** | **%72** | **%76** | **%85** | **%47.9**        | **%8.3**        | **%38 / %1.2** |
| 3.6     | 0.103\*   | %67     | %73     | %78     | %86     | ~%50             | —               | —              |

(\* rastgele kadro taramasındaki kalibrasyon; gerçek draft kadrolarında
aynı sens için baseConv ~0.004 yüksek çıkar — draft kadroları güçlendirip
birbirine yaklaştırır. 3.2–3.4 arası ölçüm gürültüsü içinde aynıdır.) Önce
3.3 seçildi, aynı gün kullanıcı **3.5**'e çıkardı (baseConv 0.108). Sonuç:
1–2 puanlık farklar yazı-turaya yakın kalır (%55/%61), 4 puan %72, 5 puan
%76, 7 puan %85; uzatma %26, penaltı %12 (değişmedi), gol/maç 3.66. 8
takımlıda en zayıfın şansı %1.2 — bilinçli kabul. `baseConversion` yalnız
gol sıklığını ölçekler (güç ayrımına dokunmaz); sens değişince gol
ortalamasını, dolayısıyla beraberlik/penaltı payını sabit tutmak için ayarlanır.

Uzatma da berabereyse (`isTournament`) seri penaltı — **KÖŞE OYUNU**
(`shared/src/simulation/penalty.ts`, 17 Eylül 2026). Atıcı ve kaleci eş
zamanlı SOL / ORTA / SAĞ seçer; vuruş iki bağımsız zara ayrılır:

- **İsabet** — yalnız atıcıya bağlı: `p_kaçırma = clamp(0.05 + 0.003·(80 −
beceri), 0.02, 0.25)`, beceri = `GEN − mevki cezası` (FWD 0, MID 3, DEF 26,
  GK 37; cezalar eski `0.7·HÜC + 0.3·GEN` becerisinin GEN'den mevki sapması).
  Atıcılar bu beceriye göre iyiden kötüye sıralanır (forvetler önce, kaleci
  en son); kadro tükenince başa dönülür.
- **Kurtarış** — yalnız kaleci DOĞRU köşeyi seçtiyse: `p_kurtarma = clamp(0.76
  - 0.012·(kaleci_GEN − 82) − 0.004·(beceri − 74), 0.35, 0.92)`.
- Farklı köşe → gol `1 − p_kaçırma`, dışarı `p_kaçırma`. Aynı köşe → gol
  `(1 − p_kaçırma)(1 − p_kurtarma)`, kurtarış, dışarı.

Üç seçenek **simetriktir** (ortanın özel gücü yok): denge stratejisi rastgele
dağıtmak, kimse formülü ezberleyerek avantaj alamaz; tek avantaj rakibin
alışkanlığını okumak. Kalecinin etkisi "her vuruşta biraz" değil "köşeyi
bildiğinde çok": GEN 90 kaleci doğru köşede FWD'ye karşı %79–82, DEF'e karşı
%92 kurtarır. Ölçüm (`scripts/measurePenalty.ts`, analitik + 200k MC):

| atıcı  | beceri | p_kaçırma | kurtarma (doğru köşe, GK 82 / 90) | gol farklı | gol aynı (GK 82 / 90) | gol rastgele (GK 82 / 90) |
| ------ | ------ | --------- | --------------------------------- | ---------- | --------------------- | ------------------------- |
| FWD 90 | 90     | %2        | %70 / %79                         | %98        | %30 / %20             | %75 / %72                 |
| FWD 84 | 84     | %4        | %72 / %82                         | %96        | %27 / %18             | %73 / %70                 |
| MID 85 | 82     | %4        | %73 / %82                         | %96        | %26 / %17             | %72 / %69                 |
| DEF 83 | 57     | %12       | %83 / %92                         | %88        | %15 / %7              | %64 / %61                 |
| GK 82  | 45     | %16       | %88 / %92                         | %84        | %10 / %7              | %60 / %59                 |

Rastgele köşelerle (bot–bot maçlar böyle oynanır) gerçek kadro dağılımında
mevki bazında gol: **FWD %72.5 · MID %71.3 · DEF %63.9 · GK %59.9**; eski tek
zarlı model aynı kadrolarda %74.3 / %73.1 / %65.2 / %61.2 verirdi — yani
~1.5 puan daha az gol, kurtarış %23.6, dışarı %6.3, ev sahibi %49.8 (adil),
seri ort. 10.4 vuruş, ani ölüme giden %27. Denge açısından ihmal edilebilir;
taban 0.74 olsa eski modelle birebir örtüşürdü, 0.76 "köşeyi bilen kaleci
gerçekten caydırıcı olsun" diye bilinçli seçildi. **Bot–bot seri anında ve
rastgele köşelerle** çözülür (`simulateShootout`); insan içeren maçta seri
CANLI oynanır (bkz. §3.3), yani `simulateMatch` `interactiveShootout: true`
ile `pendingShootout: true` döner ve kazanan belirlemez.

**BOT PENALTI ZEKÂSI** (`server/src/tournament/penaltyBot.ts`) — botlar
rastgele DEĞİL, "insan gibi" seçer: id'den türeyen sabit kişilik (favori
köşe ve bağlılık, okuma gücü, blöf payı, düşünme süresi), rakibin bu serideki
dizisini `predictNext` ile okur (dönüşüm sol-sağ-sol → sağ; seri iki kez aynı
→ yine; favori ≥%60), okuduğunun bilinçli tersini yapma payı (blöf) ve
gürültü. Kararlar seed'li (bot + maç + vuruş), gecikme kişiliğe bağlı
0.9–4.2 sn (+ seriyi bitirebilecek vuruşta baskı payı). Ölçüm (30k seri):
rastgele oynayana karşı %49.6, bot–bot %50.1 (**simetri korunur**), hep aynı
köşeye oynayana karşı %54, sol-sağ-sol sırayla oynayana karşı %57. İlk sürüm
yalnız "atıcının son köşesine yat" diyordu ve dönüşümlü oynayana karşı %32'ye
düşüyordu — okuma katmanı bu yüzden örüntü tabanlı yazıldı.

**Saf ve deterministik.** Aynı girdi + aynı seed → aynı sonuç.
`simulateFullTournament` seed'i katılımcı id'lerinden türetir: her oda kendi
sonuçlarını alır ama aynı oda + aynı kadro her zaman aynı turnuvayı üretir.
Buraya `Math.random()` KOYMAYIN — bir dönem konmuştu, `baseSeed` parametresini
işlevsiz bırakıp hataları tekrar üretilemez hale getirmişti. (Düzeltmeye
çalıştığı "her odada aynı skor" sorununun asıl sebebi maç id'lerinin sabit
olmasıydı — `semi-1`, `final-1`; simülatörün varsayılan seed'i
`matchId:homeId:awayId` olunca zaten çözüldü.)

⚠️ **DENGE — 3000 gerçek bot draft'ı, her biri 4 bracket dizilişiyle
(12.000 turnuva; koltuk şansı ortalanır).** "En güçlü takım şampiyon oldu mu?"
(rastgele olsa %25):

| ayar                                                   | en güçlü  | en zayıf | oran     | gol/maç          |
| ------------------------------------------------------ | --------- | -------- | -------- | ---------------- |
| sens 1.6 + saha av. 1.05 (eski)                        | %34.6     | %17.1    | 2.0x     | 2.77             |
| sens 2.5 + saha av. yok                                | %37.7     | %15.0    | 2.5x     | 2.92             |
| sens 2.5 + form ±%12 + baseConv 0.100                  | %39.1     | %13.2    | 3.0x     | 3.48             |
| sens 3.2 + form ±%8 + baseConv 0.104                   | %42.7     | %10.7    | 4.0x     | 3.53             |
| **sens 3.2 + form ±%4 + baseConv 0.108**               | **%46.3** | **%8.3** | **5.6x** | **3.54**         |
| sens 3.2 + form ±%4 + MID rol + baseConv 0.099         | %43.8     | %10.9    | 4.0x     | 3.66             |
| sens 3.2 + form ±%4 + GEN tabanlı güç + baseConv 0.111 | %45.6     | %10.1    | 4.5x     | 3.68             |
| + uzatma (sens 3.2; gol/maç uzatma golleri dahil)      | %47.3     | %8.9     | 5.3x     | 4.04             |
| + sens 2.4 + baseConv 0.116                            | %42.8     | %11.6    | 3.7x     | 3.67 (90 dk)     |
| + sens 3.3 + baseConv 0.110                            | %46.4     | %9.0     | 5.2x     | 3.68 (90 dk)     |
| **+ sens 3.5 + baseConv 0.108 (güncel)**               | **%47.9** | **%8.3** | **5.7x** | **3.66 (90 dk)** |

(Son beş satır 3000 gerçek draft + turnuva, 4 takımlı. 8 takımlıda güncel
ayarla en güçlü %37.8, en zayıf %1.2 — oran 32x. Ölçüm aracı:
`npx tsx packages/server/src/scripts/measureBalance.ts [draft] [sens] [baseConv]`.)

**İki kolun birlikte ayarlanması gerekir.** `strengthSensitivity` tek başına
zayıftır: yükseltmek gol sayısını da şişirir (`threat ** sens` dışbükey),
`baseConversion` ile geri dengelenince etkinin çoğu kaybolur. Gol ortalaması
3.48'e sabitlenerek ölçüldüğünde 5 puan güç farkında güçlünün turu geçme
oranı — sens 2.5 → %68.3, sens 4.0 → yalnızca %71.1.

Asıl kol **`FORM_SPREAD`**: gerçek draft'larda tipik güç farkı ~5 puan, yani
oransal olarak yalnızca ~%6.6. Form ±%12 iken güç farkının neredeyse iki katı
gürültü enjekte ediyordu. Gol sabitken 5 puan farkta güçlünün turu geçmesi:

| form | sens 2.5 | sens 3.2 |
| ---- | -------- | -------- |
| ±%12 | %68.2    | %70.0    |
| ±%8  | %70.6    | %73.4    |
| ±%4  | %72.6    | %76.8    | ← güncel |

⚠️ **±%4 alt sınırdır, daha aşağı inmeyin.** Burası zaten bilinçli kabul
edilmiş bir ödünleşme: çeşitlilik ±%8'e göre düştü (88 → 84 farklı skor,
en sık skor %9.9 → %10.8) ve penaltı sıklığı arttı (aşağıya bkz.). Daha
dar bir form aralığı aynı iki takımın her karşılaşmada birbirine benzer
maçlar üretmesine yol açar.

⚠️ **ÖDÜNLEŞME — BERABERLİK SIKLIĞI.** Form daralınca denk takımlar denk kalır,
yani **berabere bitme ihtimali artar**. Maçın 90 dakikada berabere bitme
(uzatma öncesi ölçüm; o zaman doğrudan penaltıya gidiyordu) oranı:

| güç farkı | form ±%12 | form ±%8 | form ±%4 (güncel) |
| --------- | --------- | -------- | ----------------- |
| 0         | %22.9     | %25.0    | **%28.6**         |
| 5         | %21.3     | %21.6    | **%23.4**         |
| 12        | %15.3     | %11.1    | **%8.8**          |

Yani denk maçlarda daha çok, farkın açıldığı maçlarda daha az beraberlik.
Bu bilinçli bir tercihtir: beraberlik gerçekten denk takımlar arasında
oluyor, güçlü takım haksızca sürüklenmiyor. Uzatma eklendikten sonra bu
beraberliklerin yalnız ~%45'i penaltıya kalıyor (toplam %11.5). Kullanıcı
"çok penaltı görüyorum" derse çözüm formu genişletmek de `baseConversion`ı
yükseltmek de DEĞİLDİR (ikincisi ölçüldü: gol sayısını %63 artırmak
beraberliği yalnız 6.5 puan düşürüyor) — uzatma zaten bunun için var.

- **Saha avantajı KAPATILDI** (`homeAdvantage` varsayılan 1.0). Eleme
  ağacında ev sahipliği keyfî bir koltuktur; 1.05 maç başına ~3 güç puanı
  değerindeydi — ortalama draft güç farkının (~5.2) %60'ı kadar bedava
  avantaj. Çift devreli bir format gelirse çağıran taraf açıkça 1.05 geçer.
- `baseConversion` **gol sayısı kolu**, güç ayrımına dokunmaz. Hedef maç başı
  ~3.67 gol; `strengthSensitivity` ya da `FORM_SPREAD` değişirse gol sayısı
  kayar ve bununla geri kalibre edilmelidir (güncel: 0.108, sens 3.5 için;
  kalibrasyonu gerçek draft kadrolarıyla — `measureBalance.ts` — yapın).
- **ASIL TAVAN MOTOR DEĞİL, DRAFT.** Gerçek draft'larda takımlar arası güç
  farkı ortalama yalnızca **5.25 puan** (medyan 5.0, p10 3.0, p90 8.0, max 13;
  ölçüm: 3000 gerçek bot draft'ı). Havuz tam denk (§3.1) olduğu için herkes
  benzer kalitede kadro kuruyor — motor ne kadar duyarlı olursa olsun ayırt
  edecek fark yok. Gücü daha baskın kılmak isteyen motoru değil havuz
  genişliğini / bot değerleme dağılımını değiştirmeli.
- **MOTOR KİMLİĞE BAKMAZ — doğrulandı.** `participantId` simülatörde yalnızca
  etikettir (skorer, kazanan, ev/deplasman alanları); turnuvada seed'i motor
  üretir (`actualSeed + seedCount*777`), kimlik oraya girmez. Ölçüm (50k maç,
  eşit kadro): tüm kimlik permütasyonlarında sonuç %49.97 — dört hane aynı.
  Ev sahibi koltuğu da avantaj değil (%49.97 / %50.03).

Dengeyi ayarlarken izole script ile binlerce draft+turnuva koşturun; tek
maç istatistiği yanıltır çünkü asıl soru "en güçlü takım şampiyon oluyor mu".

### 3.3 Turnuva Yörüngesi

- Format her zaman **eleme usulü turnuva ağacı**: 4 takım (yarı final) ya da
  8 takım (çeyrek final). Draft bitince `finishDraft` → `runTournament`.
- Maçlar sunucuda **sırayla (tembel)** simüle edilip yayınlanır
  (`runTournament`: `drawSeed + n·777` tohumlarıyla, `simulateFullTournament`
  ile aynı şema); beraberlikte önce uzatma, sonra penaltı. Eskiden tüm
  turnuva baştan hesaplanıyordu; canlı seri penaltı bunu kırdı — insanlı maç
  uzatma sonunda berabereyse sonraki eşleşme ancak seri bitince belli olur.
- **CANLI MAÇ EKRANI** (`server/src/tournament/runTournament.ts` +
  client `LiveMatchTicker`): bir maçın iki tarafından biri bile **insan**sa
  sunucu önce `tournament:matchLive { matchId, result }` yayınlar, istemci
  maçı dakika dakika oynatır (~14 sn; "Sonuca git" atlama butonu kullanıcı
  isteğiyle KALDIRILDI — herkes aynı anı yaşasın), sonra sunucu
  `tournament:matchResult` ile ağaca işler ve sıradaki maça geçer. **Bot–bot**
  maçlarda `matchLive` gönderilmez, sonuç anında düşer. Sunucu tempolu →
  tüm oyuncular aynı anı görür, bracket her zaman otoriter.
  **Penaltı noktaları sonucu ele vermez:** `LiveMatchTicker` baştan yalnız
  klasik 5 nokta gösterir; ani ölüm turları ancak sırası gelince eklenir
  (`revealedRound`). Eskiden tüm seri uzunluğu baştan çiziliyor, uzayıp
  uzamayacağı belli oluyordu. `tournament:matchLive` `elapsedMs` taşır (ilk
  yayında 0, yeniden bağlanana gerçek değer): istemci maçı baştan değil
  kaldığı dakikadan izler. **Süre, mutlak zaman değil** — istemci saatine
  güvenilmez (telefon saati 3 sn ileri olsa `startedAt` ile maç "anında
  bitmiş" görünürdü). Aynı ilke seri geri sayımında: `ShootoutState.remainingMs`,
  istemci sayacı alınma anı + kalan süre olarak kurar; `endsAt` yalnız bilgi.
- **CANLI SERİ PENALTI** (`server/src/tournament/shootout.ts` + client
  `LiveMatchTicker` / `PenaltyScene`, 17 Eylül 2026): insan içeren maç uzatma
  sonunda berabereyse (`MatchResult.pendingShootout`) istemci 120. dakikaya
  gelince sunucu seriyi vuruş vuruş oynatır. Her vuruşta
  `tournament:shootoutPrompt {ShootoutState}` (atıcı, kaleci, tur, `endsAt`,
  "seçti/seçmedi" bayrakları — **köşeler açıklanana kadar yalnız sunucuda**),
  taraflar `tournament:penaltyChoose {matchId, kickIndex, direction}` gönderir
  (ack'te rol; süre dolana kadar değiştirilebilir), iki taraf da seçince ya
  da `SHOOTOUT_CHOOSE_MS` (5 sn) dolunca `resolveKick` ile çözülür ve
  `tournament:shootoutKick {state, attempt}` yayınlanır, `SHOOTOUT_REVEAL_MS`
  (3.4 sn) animasyon payından sonra sıradaki vuruş; seri bitince 3 sn kazanan
  banner'ı, sonra mevcut `finalize` → `tournament:matchResult`. Aynı durum
  `RoomState.shootout` içinde de yayınlanır (yeniden bağlanma).
  - **Zaman aşımı kuralı:** seçmeyen BAĞLI insan → **orta** (dikkatsizlik
    cezası, öngörülebilir); kopuk insan ya da bot → **bot zekâsı** (aksi
    halde rakip kopan oyuncuya karşı her vuruşu ortaya atarak bedava kazanır).
    Kopan oyuncu 60 sn içinde dönmezse zaten bota dönüşür.
  - İnsan–bot maçında insan hem kendi vuruşlarının köşesini hem kalecisinin
    dalış yönünü seçer; insan–insan maçında iki taraf eş zamanlı ve gizli
    seçer. Maçta olmayan insanlar izler (seçim reddedilir: "rolün yok").
  - **İstemci:** `PenaltyScene` 2D sahne (kale, file, kollarını açmış kaleci,
    noktadaki top; atıcının gözünden — SOL/ORTA/SAĞ her iki taraf için ekran
    yönüdür), seçimde kale ağzındaki üç bölge + lobideki `format-btn`
    deseniyle üç buton + ← ↑ → / 1 2 3 klavye, draft'taki `timer-ring` geri
    sayımı, `tag` çipleriyle "seçti/seçiyor"; açılışta kaleci dalar, top
    fileye / eldivene / dışarı uçar, sonuç `ticker` şeridinde, kazanan
    `champion` bloğunun küçük hâlinde. Canlı maç kartının tamamı (skor
    `scoreline`, üst şerit crimson/gold/ready, anlatım listesi) sitenin
    editorial dilinde — eski lacivert degrade / hap rozet / Tailwind renkleri
    kaldırıldı, tek tasarım dili. Aynı sahne bot–bot / önizleme
    (`SimulationPage`) serisini de senaryolu oynatır. Noktalar yine baştan 5
    tane, ani ölüm sırası gelince eklenir.
  - **Yeniden bağlanma:** `room:rejoin` → `resendLiveMatch` (`matchLive` +
    `elapsedMs`; ticker dakikayı buradan türetir, seri sürüyorsa doğrudan
    seriye geçer). Seri bitince `room.shootout` sonuç ağaca işlenene kadar
    (`finalize`) dolu kalır — kutlama penceresinde araya giren bir `room:state`
    kazanan banner'ını silmesin. Rövanş / oda kapanışı
    `cancelTournament → cancelShootout`.
  - **Sahne animasyonu doğrulandı** (gerçek Chrome, puppeteer-core ile 45 ms
    örnekleme): açılış sınıfı düştükten 0 ms sonra kaleci (0,0), ~230 ms'de
    yolun yarısında, ~700 ms'de dalış pozisyonunda; top eş zamanlı uçar.
    Headless Chrome'un `--virtual-time-budget` modu CSS geçişlerini ara kare
    göstermeden sona atlar — animasyon kanıtı için kullanılamaz. Bekleme
    sallanması (`.pen-keeper-sway`) ile dalış geçişi (`.pen-keeper`) ayrı
    elemanlarda; aynı elemanda olsa tarayıcı geçişi atlayabilir. Açılışta iki
    tarafın köşesi sahnede etiketli çerçeveyle (üst direğin üstünde
    "VURUŞ" / "KALECİ", aynıysa tek çerçeve) ve sonuç şeridi altında `tag`
    çipleriyle gösterilir ("Kaleci · sağ · köşeyi bildi" / "ters köşe").
  - **Doğrulama:** `caffeinate -i npx tsx packages/server/src/scripts/e2eShootout.ts`
    (gerçek sunucu + Socket.io istemcileri, `FAL_FORCE_SHOOTOUT=1` ile insanlı
    her maç için beraberlik veren tohum aranır — motor değişmez): insan–bot
    (rol ack'leri, seçim değiştirme, yanlış vuruş/köşe reddi, seçmeme → orta,
    nihai döküm), insan–insan (eş zamanlı seçim ~25 ms'de çözülür, kopma →
    süre sonunda çözüm, yeniden bağlanma), 4 takım (izleyici reddi, şampiyon).
- **Lig formatı akıştan kaldırıldı** (kullanıcı isteği). `server/src/league/`,
  client `ResultsPage.tsx` ve shared `LeagueState` / `league:*` eventleri
  kod tabanında DURUYOR ama hiçbir yerden çağrılmıyor — ileride geri açmak
  isteyen olursa diye. `config.tournamentSize` artık `null` olamaz.

### 3.2.1 Maç logu — gerçek maçlarda beklenen vs gerçek (`server/src/tournament/matchLog.ts`)

Oyuncu "3–4 puan güçlüyken çok yeniliyorum, motordan şüpheliyim" dedi
(18 Eylül 2026). Motor bu bantta zaten %17 yenilgi / %38 iki gol yeme
üretiyor (bkz. yukarıdaki kol taraması) — ama ikna tartışmayla değil veriyle
olur. Her turnuva maçı sonuçlanınca (`finalize`) sunucu **yalnız
geliştiriciye görünen** bir kayıt yazar: iki takımın güç / hücum / savunması,
insan mı bot mu, motorun beklentisi (`shared/simulation/expectation.ts` →
`expectMatch`: 300 tohumla beklenen 90 dk golü ve tur geçme olasılığı, ~10 ms)
ve gerçek sonuç (skor, 90 dk golleri, uzatma/penaltı, kazanan). Konsola tek
satır (`[maç] KOD semi-1: Arda güç 84 (H85/S83) vs Bot(bot) güç 80 … beklenen
2.4–1.3 (ev tur geçer %74) · skor 2-3 · 90' · kazanan Bot`) + JSONL
(`MATCH_LOG_FILE`, varsayılan `packages/server/data/match-log.jsonl`,
gitignore'da) + **özel GitHub deposu** `ardagokmenyigit/futbol-match-log`
(`MATCH_LOG_GITHUB_TOKEN` verilmişse; Render'da dosya sistemi her uykuda
sıfırlandığı ve oyun canlıda oynandığı için tek kalıcı yer bu — ücretsiz,
aylık dosya, sıralı kuyruk, çakışmada yeniden dener; kurulum DEPLOY.md §5).
Oyunculara hiçbir şey gönderilmez.

İnceleme: `npx tsx packages/server/src/scripts/analyzeMatchLog.ts --remote`
(canlı; `gh` ile özel depodan okur) ya da `[dosya]` (yerel) —
maç listesi; güç farkı bandına göre güçlünün beklenen→gerçek tur geçme oranı,
beklenen→gerçek gol (güçlü/zayıf), zayıfın 2+ gol attığı maç payı ve "bu
sapma tesadüf mü" p-değeri; insan katılımcı başına G-B-M, beklenen vs gerçek.
**10 maçın altında bant sonuçlarına bakma** — 3 maçta 1/3 çıkması normaldir.
Plan: belli bir kullanımdan sonra bantlar beklentiden sistematik sapıyorsa
motor (sens / baskı kolları) yeniden ele alınır; sapmıyorsa şüphe kapanır.

### 3.3.1 Sunucu sağlamlığı (`server/src/harden.ts`)

Socket.io dinleyici içindeki istisnayı yakalamaz: **ack bekleyen bir event'e
ack'siz gelen tek paket (`ack is not a function`) ya da handler'da patlayan
herhangi bir hata süreci öldürüyordu** — bir istemci tüm odaları kapatabilirdi
(18 Eylül 2026'da `tournament:penaltyChoose` ile ölçüldü; `room:create`,
`auction:bid` vb. için de aynıydı). Üç katman:

1. **Paket süzgeci** (`socket.use`): ack bekleyen event'lere (`ACK_EVENTS`
   listesi — yeni ack'li event eklerken oraya da ekle) ack'siz gelen paket
   düşürülür; soket başına saniyede 40+ paket kısılır (canlı seride her seçim
   odaya `room:state` yayınlatır, spam tüm odayı sel altında bırakırdı).
2. **Dinleyici zırhı**: her `socket.on` dinleyicisi try/catch'e alınır; hata
   loglanır, ack varsa istemciye `{ ok:false }` döner.
3. **Son emniyet** (`index.ts`): `uncaughtException` / `unhandledRejection`
   loglanır, süreç düşmez (timer içinden gelen beklenmeyen hatalar için).

Kural: handler'lar payload şekline asla güvenmez (`handlePenaltyChoose`
`typeof payload === 'object'`, `Number.isInteger(kickIndex)`, köşe listede mi).
Aynı seçim yeniden gönderilirse odaya tekrar yayın yapılmaz. Doğrulama:
`npx tsx packages/server/src/scripts/e2eHardening.ts` (ack'siz paketler, null /
string / yanlış tipli payload, handler içinde istisna, bilinmeyen event, 500
paket spam, spam sonrası meşru istek — hepsinden sonra `/health` ayakta).

### 3.4 Rövanş (aynı odada yeni oyun)

Oyun bitince (`phase === 'finished'`) `RematchPanel` (client) →
`room:rematch*` eventleri → `roomStore` (server). Tek doğruluk kaynağı
`RoomState.rematch = { proposerId, acceptedIds }`; istemci yalnız render eder.

- **Herkes teklif edebilir**, host şart değil. Teklif eden baştan kabul
  sayılır. Aynı anda ikinci "teklif" gelirse kabul sayılır, çakışma yok.
- **Otomatik başlatma**: odadaki TÜM insanlar (`!isBot`) kabul edince
  `startRematch()` odayı **aynı kod, aynı ayarlar, aynı roomId** ile lobiye
  sıfırlar: kabul edenler kalır (bütçe/kadro sıfır, `isReady=false`),
  botlar (asıl botlar + bota dönüşmüş çıkanlar) atılır, `gameNumber` artar,
  `auction/tournament/rematch` null. `maybeStartRematch()` insan sayısı her
  değiştiğinde çağrılır (kabul, `room:leave`, 60 sn bot devri) — "son
  bekleyen çıktı" durumunda da tamamlanır.
- **Host kabul etmek zorunda değil.** Host çıkarsa (`room:leave` → finished
  fazında `convertToBot`) hostluk sırayla: mevcut host kaldıysa o → teklif
  eden → ilk kabul eden. Lobide de bağlı bir insana geçer.
- **Yanıt vermeyenler**: teklif eden `room:rematchStart` ile "kabul edenlerle
  başla" diyebilir; kabul etmeyen insanlar `room:kicked { reason }` alır
  (istemci oturumu siler, ana ekrana döner, mesajı `store.notice` ile
  gösterir; oda lobide olduğu için kodla geri katılabilirler).
- **Vazgeçme**: kabul eden `rematchRespond { accept:false }` ile geri
  çeker; teklif eden geri çekemez, `rematchCancel` ile daveti iptal eder
  (kimse çıkarılmaz). Teklif eden çıkarsa teklif kabul etmiş birine
  devrolur, kimse yoksa iptal. "Çık" her durumda `room:leave` + oturum
  silme → ana ekran.
- **Bağlantı kopması**: finished'ta kopan insan 60 sn beklenir (pending
  sayılır), sonra bota dönüşür → beklenmez. Bot devri timer'ı oda bu arada
  lobiye döndüyse bot EKLEMEZ, lobi kuralıyla katılımcıyı siler.
- **İstemci**: `updateRoom` faz `lobby`'ye dönünce `tournament/liveMatch/
lastWon` temizler — yoksa yeni oyunun `simulation` fazında bir an eski
  bracket görünür. Oturum (`roomId/playerId`) değişmediği için reconnect
  rövanş lobisinde de çalışır.
- **Doğrulama**: gerçek Socket.io istemcileriyle uçtan uca senaryo (aynı
  odada art arda 5 oyun: kabul/geri çek/iptal → otomatik lobi → zorla
  başlat + kick → kodla geri katılma → host reddedip çıkınca devir →
  teklif edenin çıkışında devir → lobide teklif reddi) `bidDurationSec:1,
turnDurationSec:1, tournamentSize:2` ile koşuldu; hepsi geçti.

---

## 4. Görev Dağılımı (Kişi 1 & Kişi 2)

İkiniz de full-stack çalışacağınız için görevler **dikey dilimler**
(vertical slices) halinde bölündü — yani her kişi bir özelliğin hem
sunucu hem istemci tarafını uçtan uca kendisi yazıyor. Bu, aynı dosyada
sürekli çakışmanızı önler. Tek ortak nokta `packages/shared/src/types.ts`
— burada değişiklik yapmadan önce diğer kişiye haber verin.

### 🧩 Ortak (İkiniz Birlikte — Faz 0)

- Monorepo iskeletini kurun (`packages/client`, `server`, `shared`)
- `npm workspaces` yapılandırması, TypeScript/ESLint/Prettier ayarları
- Socket.io bağlantısını kurup "merhaba dünya" mesajının client↔server
  arasında gittiğini doğrulayın
- `shared/src/types.ts` içine temel tipleri (Footballer, RoomState,
  socket event isimleri) birlikte tasarlayın

### 👤 Kişi 1 — Oda, Lobi ve Açık Artırma (Draft) Sistemi

**Sorumluluk**: Kullanıcı bir odaya girmeden şampiyonluk kutlamasına kadar
giden yolun "draft" kısmının tamamı — hem sunucu mantığı hem arayüz.

1. Oda oluşturma/katılma sistemi (`packages/server/src/rooms/`)
   - Oda kodu üretme, host ataması, "hazır" durumu takibi
   - Kapasite = turnuva boyutu (2, 4 ya da 8); alt sınır yok, tek kişi de başlatır
2. Açık artırma motoru (`packages/server/src/auction/`)
   - Round yönetimi, timer, teklif validasyonu (bölüm 3.1)
   - Futbolcu havuzundan rastgele çekme mantığı
3. Kadro kuralları validasyonu (pozisyon dağılımı, bütçe limiti)
4. İstemci tarafı:
   - Lobi ekranı (oda kodu paylaşma, katılımcı listesi, hazır butonu)
   - Draft ekranı (aktif futbolcu kartı, canlı teklif geçmişi, geri
     sayım, "teklif ver" input'u, kendi bütçe/kadro göstergesi)
5. Reconnect desteği: bir oyuncu bağlantıyı koparırsa draft'ın
   durmaması, tekrar bağlanınca kaldığı yerden devam etmesi

### 👤 Kişi 2 — Futbolcu Verisi, Simülasyon ve Lig Sistemi

**Sorumluluk**: Draft bittikten sonra ne olacağının tamamı — hem
simülasyon motoru hem sonuç arayüzü — artı başlangıç veri seti.

1. Futbolcu veri seti (`packages/server/data/players.json`)
   - 50-100 futbolcu, gerçekçi stat dağılımı (position, attack, defense,
     pace, stamina, overall, basePrice) — script ile üretilebilir
2. Maç simülasyon motoru (`packages/server/src/simulation/`)
   - Bölüm 3.2'deki algoritmayı saf fonksiyon olarak yazın, izole test edin
3. Lig/turnuva mantığı (`packages/server/src/league/`)
   - Round-robin fikstür üretimi, maçları sırayla çalıştırma, puan
     tablosu güncelleme (bölüm 3.3)
4. İstemci tarafı:
   - Maç sonuç ekranı (skor, gol dakikaları, basit "canlı anlatım" efekti)
   - Puan tablosu / lig durumu ekranı
   - Final/şampiyon kutlama ekranı
5. Genel UI polish: renk paleti, responsive düzen, boş/hata durumları

### 🤝 Ortak (İkiniz Birlikte — Son Faz)

- Uçtan uca entegrasyon testi: draft bitince simülasyon fazına doğru
  geçiş yapılıyor mu, veri kaybı var mı
- Deploy (Vercel + Railway/Fly.io)
- Gerçek internet üzerinden birlikte oynayıp bulunan hataları giderme

---

## 5. Kodlama Konvansiyonları

- Tüm socket event isimleri `namespace:action` formatında (örn.
  `auction:bid`, `room:join`, `league:matchResult`)
- Sunucu her zaman "tek doğruluk kaynağı" — istemci hiçbir zaman
  bütçe/skor hesaplamasını kendi başına yapıp göstermez, sunucudan
  gelen veriyi render eder
- Yeni bir özelliğe başlamadan önce ilgili tipi `shared/src/types.ts`
  içine ekleyin, sonra sunucu/istemci kodunu yazın
- Commit mesajları: `feat:`, `fix:`, `refactor:` önekleriyle
- Branch isimleri: `feature/*`, `fix/*` (README ile uyumlu). `main` korumalı,
  her değişiklik PR ile girer.

---

## 6. Claude Code'a Not

Bu dosyayı okuduktan sonra, hangi fazda olduğumuzu ve hangi kişinin
(Kişi 1 / Kişi 2) hangi görevi yaptığını sorarak devam et. Her seferinde
tüm projeyi baştan yazmaya çalışma — yukarıdaki fazlara ve görev
dağılımına sadık kalarak küçük, gözden geçirilebilir adımlarla ilerle.

### Durum

**Faz 0 — tamamlandı (PR #1)**

- Monorepo iskeleti: `packages/{shared,server,client}`, npm workspaces
- TypeScript + ESLint (flat config) + Prettier + CI (GitHub Actions)
- `@fal/shared`: `types.ts`, `events.ts`, `config.ts`
- Socket.io hello-world doğrulandı

**Kişi 1 — tamamlandı (PR #2, #3, #4)**

- `server/src/rooms/`: oda kodu, host, hazır, kapasite = turnuva boyutu,
  `room:rejoin` (reconnect), lobide host disconnect'te hostluk devri,
  `canStart` bağlı-oyuncu bazlı (alt sınır 1)
- `server/src/auction/`: round döngüsü, `auction:tick`, anti-snipe, teklif
  validasyonu (taban/bütçe/pozisyon), kazanan → kadro, `finishDraft` →
  `phase='simulation'` + `auction:finished`
- İstemci: HomePage, LobbyPage, DraftPage (futbolcu kartı, geri sayım, teklif
  input'u, bütçe/kadro, rakip ilerlemesi), Zustand store, reconnect
- `data/players.json`: Kişi 2'nin 504 futbolculuk veri seti (72 GK / 144 DEF /
  144 MID / 144 FWD, `overall` 78–91, `basePrice` yok)
- `shared/events.ts`: `auction:won`a `footballerName`/`winnerNickname`,
  `auction:bid`e `highestBid: Bid | null` eklendi

**Kadro / format / bot / AÇIK ARTIRMA YAPISI (Kişi 1)**

- Kadro **7 oyuncu** (GK 1, DEF 2, MID 2, FWD 2), başlangıç bütçesi **150M**.
- Açık artırma yapısının tamamı için bkz. §3.1 (tam denk havuz, 28 tur,
  zorunlu açılış + serbest teklif, taban fiyat yok, sınırlı açılış pası,
  sıra adaleti).
- Oyun formatı `config.tournamentSize`: her zaman `4` ya da `8` (eleme
  turnuvası). **Lig formatı (`null`) kaldırıldı**, `minPlayers` kaldırıldı.
  Oda kapasitesi = turnuva boyutu; tek kişi bile başlatır, eksik takımlar
  **botlarla** tamamlanır (`isBot: true`).
- Botlar (`server/src/auction/bot.ts`): ihtiyaç + rezerv + değerleme üçlüsü.
  `botOpeningBid` açılış (zorunlu, asla null), `decideBotBid` serbest evre
  (null = teklif vermez). Taban fiyat kalktığı için rezerv iki parçalı:
  sert taban (kalan slot × minBidIncrement) + stratejik pay (`RESERVE_SHARE`).
- Güvenlik ağı: bitişte `autoCompleteSquads()`. Havuz tam denk olduğu için
  normalde devreye girmez.
- **GİZLİ BÜTÇE MODU** (`config.hiddenBudgets`, oda kurulurken seçilir):
  - Açık mod (varsayılan): rakiplerin kalan bütçesi görünür. Botlar bunu
    kullanır — `rivalCeiling()` ile bu mevkiye çıkabilecek en yüksek rakip
    teklifini tahmin eder; kimse rakip değilse asgariye yakın kapar, çekişme
    varsa rakip tavanının bir tık üstüne razı olur (fazla ödemez).
  - Gizli mod: sunucu draft sırasında her sokete YALNIZ kendi bütçesini
    gönderir (`rooms/broadcast.ts` → `emitRoomState` / `redactRoomState`,
    diğerleri `HIDDEN_BUDGET = -1`, istemci `isBudgetHidden()`). Botlara
    `rivals = null` geçilir — rakip bütçesini hiç bilmezler. Draft bitince
    (`phase !== 'draft'`) bütçeler herkese açılır.

⚠️ **DENGE — 504 havuz + gerçek bot açık artırması (2000 draft, 4 bot, 150M).**
Kişi 2'nin geniş veri seti + gerçek bot değerlemesiyle:
takım gücü ort. 76.5, sd ~2.2; draft başına en iyi–en kötü takım farkı
ort. **~5.1**, p90 **~7.5**. (Naif rastgele/snake atamada fark ~2 çıkıyordu;
botlar yüksek `overall` + marjinal uyuma göre teklif verdiği için kadrolar
gerçekte daha çok farklılaşıyor.) Yani para harcamanın artık ölçülebilir
bir getirisi var. Yeni açık artırma yapısı "beklemek baskın strateji"
açığını da KAPATTI (kontrol %20.3 vs beklemek %19.8; eski pas'lı yapıda
beklemek %21 ile baskındı).

**BÜTÇE 150M — bot mantığı bütçeyle orantılı, sabit ayar GEREKMEZ.**
`bot.ts`'teki `fairShare` (= budget/slotsLeft), `reserveNeeded`,
`maxSingleShare` (`config.startingBudget × persona`) hepsi budget'a bağlı.
220M→150M ölçümü (2000 draft): eksik kadro 0/8000, ort. fiyat 29.7M→20.2M
(~%68, bütçeyle orantılı), 1M'ye giden tur %1.1→%3.5 (hâlâ önemsiz),
tur başına teklif 12.8→10.4 (canlı), kalan bütçe %5.6→%5.7 (aynı oran).
Açık artırma sönmüyor.

**Açık uçlar**

- Büyük yeniden yazımlardan (açılış-teklifli açık artırma + 504 havuz + solo)
  sonra **tam draft→turnuva mutlu yolu gerçek timer'larla uçtan uca
  koşulmadı**. `roomStore` seviyesinde solo + bot doldurma doğrulandı,
  motor seviyesinde tam tur akışı doğrulanmadı.
- `server/src/league/` + `client/pages/ResultsPage.tsx` artık ölü kod
  (bilerek bırakıldı, bkz. §3.3).
- Devir noktası: `phase === 'simulation'` + `auction:finished(roomState)`;
  kadrolar `participant.squad` içinde, bütçeler düşülmüş.
- Sonra: ortak uçtan uca entegrasyon + deploy (CLAUDE.md §4 son faz).
- Canlı seri penaltı (§3.3) v1: üç köşe simetrik, botlar kişilikli. Olası
  v2: ortanın kaleci lehine hafif asimetrisi, kişiliğe bağlı köşe eğilimi
  botlar için görünür ipucu — ikisi de dengeyi bozar, ölçmeden açmayın.
