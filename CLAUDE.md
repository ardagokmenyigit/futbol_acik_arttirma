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
   artırmasıdır (zorunlu açılış + serbest teklif, taban fiyat yok, pas yok).
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

**TEK KAYNAK: `packages/shared/src/simulation/simulator.ts`.**
`server/src/simulation/simulator.ts` ve `random.ts` yalnızca yeniden dışa
aktarır (`teamStats.ts` ile aynı desen). Motor bir dönem iki ayrı kopya
halindeydi ve sabitleri sessizce ayrışmıştı (`chanceRate` 0.3 vs 0.078,
`baseConversion` 0.088 vs 0.21) — aynı seed iki farklı skor, maç başına
2.73'e karşı 1.60 gol üretiyordu. **Motoru değiştiren yalnızca shared'daki
kopyayı değiştirir.**

Takım gücü `calculateTeamStats()` ile mevkisel ağırlıklı hesaplanır
(`ATTACK_WEIGHT` / `DEFENSE_WEIGHT`, bkz. `shared/src/types.ts`).

90 dakika döngüsü, "her dakika bağımsız yazı-tura" değil:

1. **Maç günü formu** — her takım ±%8 formla çıkar (`FORM_SPREAD`).
2. **Pozisyon üretimi** — `chanceRate` ile pozisyon doğar; kime ait olduğu
   `hücum / rakip savunma` tehdit oranıyla paylaştırılır.
3. **Pozisyon kalitesi** — gole dönme oranı da tehdit oranına bağlı, yani
   güçlü takım hem daha çok hem daha net fırsat bulur.
4. **Maç durumu** — geride kalan basar (hücum +%12, savunma −%7), 2+ farkla
   önde olan oyunu yönetir. Geri dönüşler buradan doğar.
5. **Tempo** — son 20 dakikada pozisyon üretimi artar.

Beraberlikte (`isTournament`) seri penaltı: atıcılar hücuma göre sıralanır,
başarı oranı atıcının hücumu ile rakip kalecinin savunmasından türer.

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

| ayar                                     | en güçlü  | en zayıf  | oran     | gol/maç  |
| ---------------------------------------- | --------- | --------- | -------- | -------- |
| sens 1.6 + saha av. 1.05 (eski)          | %34.6     | %17.1     | 2.0x     | 2.77     |
| sens 2.5 + saha av. yok                  | %37.7     | %15.0     | 2.5x     | 2.92     |
| sens 2.5 + form ±%12 + baseConv 0.100    | %39.1     | %13.2     | 3.0x     | 3.48     |
| **sens 3.2 + form ±%8 + baseConv 0.104** | **%42.9** | **%11.1** | **3.9x** | **3.53** |

(Son iki satır 3000 gerçek draft + turnuva, 4 takımlı. 8 takımlıda güncel
ayarla en güçlü %33.2, en zayıf %2.1 — oran 15.8x.)

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
| ±%4  | %72.6    | %76.8    |

±%4'ten sonrası tekdüzeleştiriyor (farklı skor sayısı 78 → 71), o yüzden
±%8'de durduk.

⚠️ **ÖDÜNLEŞME:** form daralınca eşit takımlar eşit kalır, yani **berabere
bitme ihtimali artar**. Penaltıya gitme oranı güç farkı 0'da %22.9 → %25.0
yükseldi, buna karşılık farkın açıldığı maçlarda düştü (fark 12'de
%15.3 → %11.1). Gerçekçi fark olan 5 puanda pratikte değişmedi (%21.3 → %21.6).

- **Saha avantajı KAPATILDI** (`homeAdvantage` varsayılan 1.0). Eleme
  ağacında ev sahipliği keyfî bir koltuktur; 1.05 maç başına ~3 güç puanı
  değerindeydi — ortalama draft güç farkının (~5.2) %60'ı kadar bedava
  avantaj. Çift devreli bir format gelirse çağıran taraf açıkça 1.05 geçer.
- `baseConversion` **gol sayısı kolu**, güç ayrımına dokunmaz. Hedef maç başı
  ~3.48 gol; `strengthSensitivity` ya da `FORM_SPREAD` değişirse gol sayısı
  kayar ve bununla geri kalibre edilmelidir (güncel çift için 0.104).
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
- Maçlar sunucuda önceden simüle edilir (`simulateFullTournament`), sonuçlar
  tur tur yayınlanır; beraberlikte penaltı.
- **CANLI MAÇ EKRANI** (`server/src/tournament/runTournament.ts` +
  client `LiveMatchTicker`): bir maçın iki tarafından biri bile **insan**sa
  sunucu önce `tournament:matchLive { matchId, result }` yayınlar, istemci
  maçı dakika dakika oynatır (~14 sn, atlanabilir), sonra sunucu
  `tournament:matchResult` ile ağaca işler ve sıradaki maça geçer. **Bot–bot**
  maçlarda `matchLive` gönderilmez, sonuç anında düşer. Sunucu tempolu →
  tüm oyuncular aynı anı görür, bracket her zaman otoriter.
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
