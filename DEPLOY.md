# Ücretsiz Deploy — Render (server) + Vercel (client)

Oyunun iki farklı kişinin makinesinden aynı odaya bağlanabilmesi için sunucunun
**tek bir yerde herkese açık** çalışması gerekir. Aşağıdaki iki servis de ücretsiz
ve kredi kartı istemez.

| Katman             | Servis                          | Not                                                                                   |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------------------- |
| Socket.io sunucusu | **Render.com** free web service | WebSocket destekli. 15 dk trafik olmazsa uyur; sonraki ilk istek ~50 sn (cold start). |
| React client       | **Vercel** free                 | Vite preset.                                                                          |

> Oda/tur durumu sunucuda **bellekte** tutulur (tek doğruluk kaynağı). Sunucu
> yeniden başlarsa veya uykuya dalıp kalkarsa açık odalar sıfırlanır — bir oyun
> oturumu boyunca (sunucu ayakken) reconnect ve tur geçmişi sorunsuz çalışır.
> Kalıcı depolama istersek sonradan Upstash Redis (ücretsiz) eklenebilir.

---

## 1. Sunucuyu Render'a kur

1. <https://render.com> → GitHub ile giriş yap.
2. **New +** → **Blueprint** → `ardagokmenyigit/futbol_acik_arttirma` reposunu seç.
   Render kökteki `render.yaml`'ı okur ve **fal-server** servisini hazırlar.
3. `CLIENT_ORIGIN` sorulunca şimdilik `*` yaz (Vercel adresini birazdan gireceğiz).
4. **Apply** → ilk build ~2-3 dk. Bitince servis adresi:
   `https://fal-server.onrender.com` (isim farklı olabilir — kendi adresini not al).
5. Doğrula: tarayıcıda `https://<render-adresin>/health` → `{"ok":true,...}` dönmeli.

Blueprint çalışmazsa manuel: **New +** → **Web Service** → repo → ayarlar:

- Runtime: **Node**, Plan: **Free**, Region: Frankfurt
- Build Command: `npm ci && npm run build -w @fal/shared && npm run build -w @fal/server`
- Start Command: `node packages/server/dist/index.js`
- Health Check Path: `/health`
- Environment: `NODE_VERSION=20`, `CLIENT_ORIGIN=*`

---

## 2. Client'ı Vercel'e kur

1. <https://vercel.com> → GitHub ile giriş → **Add New… → Project** → aynı repo.
2. Ayarlar:
   - **Framework Preset:** Vite
   - **Root Directory:** `packages/client`
   - **Build Command:** `npm run build -w @fal/shared && npm run build -w @fal/client`
   - **Install Command:** `npm ci` (repo kökünde çalışır — workspaces için gerekli)
   - **Output Directory:** `dist`
3. **Environment Variables** →
   `VITE_SERVER_URL = https://<render-adresin>` (1. adımdaki adres, sonda `/` yok).
4. **Deploy** → bitince client adresi: `https://<proje>.vercel.app`.

> Vercel "Root Directory = packages/client" ile install'ı repo kökünde çalıştıramazsa:
> Root Directory'yi boş bırak, Build Command'i
> `npm run build -w @fal/shared && npm run build -w @fal/client`,
> Output Directory'yi `packages/client/dist` yap.

---

## 3. Sunucuya gerçek client adresini ver

1. Render → **fal-server** → **Environment** → `CLIENT_ORIGIN` değerini
   `https://<proje>.vercel.app` yap (birden fazla adres virgülle:
   `https://a.vercel.app,http://localhost:5173`).
2. **Save Changes** → servis otomatik yeniden başlar.

---

## 4. Test

1. `https://<proje>.vercel.app` aç → "Sunucuya bağlı" yeşil olmalı
   (cold start ise ilk ~50 sn "Bağlanıyor…" kalabilir, sekmeyi yenile).
2. Bir kişi oda kurar, kodu paylaşır; diğerleri katılır; herkes "Hazırım" → host "Başlat".
3. Açık artırma + lig + şampiyon akışını birlikte oynayın.

---

## Yerelde prod sunucusuna bağlanmak (opsiyonel)

`packages/client/.env.local`:

```
VITE_SERVER_URL=https://<render-adresin>
```

Sonra `npm run dev -w @fal/client` — yerel arayüz, canlı sunucu.
