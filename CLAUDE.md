# Proje: Açık Artırma Ligi (Football Auction League)

Bu dosya, projeyi Claude Code'a tanıtmak ve iki geliştirici arasındaki görev
dağılımını netleştirmek için hazırlanmıştır. Her oturumda bu dosyayı referans
al, kodlama konvansiyonlarına ve mimariye sadık kal.

---

## 1. Oyun Nedir?

2-6 kişilik, gerçek zamanlı, tarayıcı tabanlı çok oyunculu bir web oyunu.
Oyuncular sahte bir futbolcu piyasasında **açık artırmayla** kadro kurar,
kadrolar tamamlanınca sistem **maçları simüle eder** ve bir lig/turnuva
sonunda kazananı belirler.

### 1.1 Oyun Akışı (Uçtan Uca)

1. **Lobi**: Bir kullanıcı oda kurar (host), diğerleri oda koduyla katılır.
   2-6 kişi katılabilir. Herkes "hazır" işaretleyince host oyunu başlatır.
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

- Sunucu, havuzdan sırayla rastgele **bir** futbolcu çeker ve
  `player:up_for_auction` event'i ile tüm istemcilere yayınlar.
- Sunucu bir timer başlatır (örn. 20 saniye), her saniye `auction:tick`
  event'iyle kalan süreyi yayınlar.
- İstemciler `auction:bid` event'iyle teklif gönderir (`{ amount }`).
  Sunucu, teklifi şu kontrollerden geçirir:
  - Teklif, mevcut en yüksek tekliften büyük mü?
  - Oyuncunun bütçesi bu teklifi karşılıyor mu?
  - Oyuncunun kadrosunda bu pozisyon için hâlâ yer var mı?
- Süre bitince en yüksek teklifi veren kazanır, `auction:won` event'i
  yayınlanır, kazananın bütçesi düşülür, futbolcu kadrosuna eklenir.
- Round biter, bir sonraki futbolcuya geçilir.

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

### 3.3 Lig/Turnuva Yörüngesi

- N takım için round-robin fikstür: her takım diğer her takımla bir kez
  oynar (N=4 için 6 maç, vb.)
- Maçlar sırayla simüle edilir, sonuçlar puan tablosuna işlenir.
- Puan tablosu: Galibiyet 3, Beraberlik 1, Mağlubiyet 0. Averaj
  (gol farkı) eşitlik durumunda sıralamayı belirler.

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
   - 2-6 kişi sınırı kontrolü
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

- `server/src/rooms/`: oda kodu, host, hazır, 2–6 kişi, `room:rejoin` (reconnect),
  lobide host disconnect'te hostluk devri, `canStart` bağlı-oyuncu bazlı
- `server/src/auction/`: round döngüsü, `auction:tick`, anti-snipe, teklif
  validasyonu (taban/bütçe/pozisyon), kazanan → kadro, `finishDraft` →
  `phase='simulation'` + `auction:finished`
- İstemci: HomePage, LobbyPage, DraftPage (futbolcu kartı, geri sayım, teklif
  input'u, bütçe/kadro, rakip ilerlemesi), Zustand store, reconnect
- `data/players.json`: 22 **kurgusal** futbolcu (placeholder) — Kişi 2 değiştirecek
- `shared/events.ts`: `auction:won`a `footballerName`/`winnerNickname`,
  `auction:bid`e `highestBid: Bid | null` eklendi

**Kadro / format / bot (Kişi 1)**

- Kadro **7 oyuncu** (GK 1, DEF 2, MID 2, FWD 2), başlangıç bütçesi **140M**
  - Havuz taban fiyatları 12–25M → en ucuz dolum ~96M, medyan ~105M.
  - ⚠️ `startingBudget` en ucuz dolumun altına inerse kadrolar **asla dolmaz**
    ve draft havuz bitene kadar sürer. (Eski 15 kişilik kadro + 100M bu yüzden
    bozuktu — simülasyon fazına hiç geçilmiyordu.)
- Oyun formatı `config.tournamentSize`: `null` = lig (round-robin),
  `4 | 8` = eleme usulü turnuva ağacı. Host lobiden seçer (`room:setFormat`).
- Turnuva formatında eksik takımlar **botlarla** tamamlanır (`isBot: true`).
  Botlar açık artırmaya katılır: ihtiyaç + rezerv + değerleme üçlüsüne bakar
  (`server/src/auction/bot.ts`), kadrosunu yarım bırakacak teklif vermez.
- Draft güvenlikleri: tur tavanı (`squadSize × oyuncu × 2`) ve bitişte
  `autoCompleteSquads()` — pasif/AFK oyuncu draft'ı sonsuza sürükleyemez,
  simülasyona herkes tam kadro girer.

**Sıradaki — Kişi 2**

- `data/players.json` gerçek veri seti · `server/src/simulation/` · `server/src/league/`
- Devir noktası: `phase === 'simulation'` + `auction:finished(roomState)`;
  kadrolar `participant.squad` içinde, bütçeler düşülmüş
- Sonra: ortak uçtan uca entegrasyon + deploy (CLAUDE.md §4 son faz)
