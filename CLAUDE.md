# Proje: Açık Artırma Ligi (Football Auction League)

Bu dosya, projeyi Claude Code'a tanıtmak ve iki geliştirici arasındaki görev
dağılımını netleştirmek için hazırlanmıştır. Her oturumda bu dosyayı referans
al, kodlama konvansiyonlarına ve mimariye sadık kal.

---

## 1. Oyun Nedir?

1-8 kişilik, gerçek zamanlı, tarayıcı tabanlı çok oyunculu bir web oyunu.
Oyuncular sahte bir futbolcu piyasasında **açık artırmayla** kadro kurar,
kadrolar tamamlanınca sistem **maçları simüle eder** ve bir **eleme
turnuvası** (4 ya da 8 takım) sonunda kazananı belirler. Tek kişi de
oynayabilir — eksik takımlar botlarla tamamlanır. (Lig formatı kaldırıldı.)

### 1.1 Oyun Akışı (Uçtan Uca)

1. **Lobi**: Bir kullanıcı oda kurar (host), diğerleri oda koduyla katılır.
   Host turnuva boyutunu (4 ya da 8 takım) seçer. Odaya o sayıya kadar insan
   girebilir; 1 kişi bile yeter. Bağlı herkes "hazır" işaretleyince host
   başlatır, eksik takımlar botlarla dolar.
2. **Draft (Açık Artırma) Fazı**: Sunucu, önceden hazırlanmış futbolcu
   havuzundan sırayla rastgele bir futbolcu seçer ve tüm oyunculara aynı anda
   gösterir. Her round için 15-30 saniyelik bir teklif süresi vardır. Oyuncular
   bütçelerinin izin verdiği ölçüde teklif verir. Süre bitiminde en yüksek
   teklifi veren futbolcuyu alır, bütçesinden düşülür, kadrosuna eklenir.
   Bu döngü, havuz bitene veya tüm oyuncuların kadroları dolana kadar sürer.
3. **Kadro Kuralları**: Her takım şu dağılıma uymak zorundadır (örnek, ayarlanabilir):
   - 2 Kaleci (GK)
   - 5 Defans (DEF)
   - 5 Orta Saha (MID)
   - 3 Forvet (FWD)
   - Toplam 15 oyuncu, başlangıç bütçesi örn. 100M (para birimi kurgusal, "M")
     Bir oyuncu kural dışı bir pozisyonu doldurursa veya bütçeyi aşarsa teklif
     reddedilir.
4. **Simülasyon Fazı**: Tüm kadrolar tamamlandığında, sistem takımlar arası
   round-robin (herkes herkesle bir kez oynar) fikstür oluşturur. Her maç,
   dakika dakika olay bazlı simülasyonla otomatik oynanır (bkz. Bölüm 3).
5. **Sonuç**: Puan tablosu (galibiyet=3, beraberlik=1, mağlubiyet=0 puan),
   maç sonuçları ve gol dakikaları gösterilir. En çok puanı alan şampiyon olur.

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
   dolarsa sunucu onun adına `minBidIncrement` ile açar. **Pas hakkı yoktur.**
   Bu sayede her turda mutlaka gerçek bir teklif olur; "kimse teklif vermedi,
   bedavaya gitti" durumu ortadan kalkar.
2. **`bidding` — serbest teklif.** Pozisyona girebilen herkes teklif verebilir,
   istemeyen vermez, fikri değişirse geri girer. Süre `bidDurationSec`;
   son saniye teklifi mümkün olduğu için **anti-snipe (5sn) devrede.**
   Süre bitiminde en yüksek teklif kazanır (`auction:won`).

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

- Her takımın toplam `attack` ve `defense` değerleri, kadrodaki
  oyuncuların ilgili statlarının toplamı/ortalamasından hesaplanır.
- 90 sanal dakika için döngü çalıştırılır. Her dakika için gol olasılığı:
  ```
  golOlasiligi = baseRate * (takımA.attack / takımB.defense) * randomFaktör
  ```
  `baseRate` ve `randomFaktör` dengeyi sağlamak için ayarlanabilir sabitlerdir.
- Gol olursa, o dakika ve hangi takımın attığı bir `events[]` dizisine
  kaydedilir.
- Simülasyon bitince `{ scoreA, scoreB, events }` döndürülür.
- **Önemli**: Bu fonksiyon saf (pure) ve deterministik test edilebilir
  olmalı — girdi (iki takımın statları) + bir seed verilince aynı
  dağılım davranışını üretmeli. Dengeyi ayarlamak için önce izole
  script ile yüzlerce simülasyon çalıştırıp gol ortalamalarını kontrol edin.

### 3.3 Turnuva Yörüngesi

- Format her zaman **eleme usulü turnuva ağacı**: 4 takım (yarı final) ya da
  8 takım (çeyrek final). Draft bitince `finishDraft` → `runTournament`.
- Maçlar tur tur "canlı" simüle edilir; beraberlikte penaltı.
- **Lig formatı akıştan kaldırıldı** (kullanıcı isteği). `server/src/league/`,
  client `ResultsPage.tsx` ve shared `LeagueState` / `league:*` eventleri
  kod tabanında DURUYOR ama hiçbir yerden çağrılmıyor — ileride geri açmak
  isteyen olursa diye. `config.tournamentSize` artık `null` olamaz.

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
   - Kapasite = turnuva boyutu (4 ya da 8); alt sınır yok, tek kişi de başlatır
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
- `data/players.json`: 22 **kurgusal** futbolcu (placeholder) — Kişi 2 değiştirecek
- `shared/events.ts`: `auction:won`a `footballerName`/`winnerNickname`,
  `auction:bid`e `highestBid: Bid | null` eklendi

**Kadro / format / bot / AÇIK ARTIRMA YAPISI (Kişi 1)**

- Kadro **7 oyuncu** (GK 1, DEF 2, MID 2, FWD 2), başlangıç bütçesi **220M**.
- Açık artırma yapısının tamamı için bkz. §3.1 (tam denk havuz, 28 tur,
  zorunlu açılış + serbest teklif, taban fiyat yok, pas yok, sıra adaleti).
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

⚠️ **BİLİNEN DENGE SORUNU — HAVUZA BAĞLI (ölçüldü, birçok kez).**
Futbolcu havuzu çok dar (overall 83–91) olduğu için takım gücü farkları
oluşmuyor: her takım ~76.5'e yığılıyor, turnuvada favori ~%30 şampiyon oluyor
(şans %25). Denenen ve İŞE YARAMAYAN çözümler: havuzu ×2/×3/×4 gerdirme
(iyiler sadece pahalanıyor, botlar yeniden eşitliyor), kıtlık (36 futbolcu),
çekişmesiz alımın adil pay ödemesi. Yeni yapı "beklemek baskın strateji"
açığını KAPATTI (kontrol %20.3 vs beklemek %19.8; eski pas'lı yapıda beklemek
%21 ile baskındı) ama para harcamanın GETİRİSİ hâlâ yok — çünkü hangi
futbolcuyu aldığın takım gücünü değiştirmiyor.
Kişi 2'nin havuz çalışması bu yüzden kritik.

**Sıradaki — Kişi 2**

- `data/players.json` gerçek veri seti · `server/src/simulation/` · `server/src/league/`
- Devir noktası: `phase === 'simulation'` + `auction:finished(roomState)`;
  kadrolar `participant.squad` içinde, bütçeler düşülmüş
- Sonra: ortak uçtan uca entegrasyon + deploy (CLAUDE.md §4 son faz)
