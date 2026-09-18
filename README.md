# futbol_acik_arttirma

# ⚽ Açık Artırma Ligi (Football Auction League)

**🎮 Hemen oyna:** <https://futbol-acik-arttirma.vercel.app/> — kurulum yok,
tarayıcıdan açılır; tek kişi bile oynayabilir (eksik takımlar botlarla dolar).

Gerçek zamanlı, çok oyunculu bir web oyunu: oyuncular başlangıç bütçeleriyle
her turda rastgele gelen futbolcuları **açık artırmayla** satın alır, en iyi
kadroyu kurar ve turnuva sonunda takımlar simüle edilen maçlarla yarışır.

## 🎮 Oyun Akışı

1. **Lobi** — host oda kurar, 1-8 oyuncu katılır
2. **Draft (Açık Artırma)** — her round'da rastgele bir futbolcu ortaya çıkar,
   oyuncular süreli teklif verir, en yüksek teklif kazanır
3. **Kadro Kuralları** — pozisyon dağılımı (GK/DEF/MID/FWD) ve bütçe limiti
   zorunludur
4. **Simülasyon** — round-robin lig formatında, takımlar arasında
   dakika-dakika maç simülasyonu çalışır
5. **Sonuç** — puan tablosu ve şampiyon ilan edilir

## 🛠️ Teknoloji Yığını

| Katman         | Teknoloji                                      |
| -------------- | ---------------------------------------------- |
| Frontend       | React + TypeScript + Vite                      |
| Backend        | Node.js + TypeScript + Socket.io + Express     |
| Paylaşılan kod | TypeScript tipleri (`packages/shared`)         |
| Deployment     | Vercel (client) / Railway veya Fly.io (server) |

## 📁 Proje Yapısı

```
.
├── packages/
│   ├── client/          # React frontend
│   ├── server/          # Socket.io game server
│   └── shared/          # Ortak TypeScript tipleri, sabitler
├── .github/
│   └── workflows/       # CI (lint, build)
├── package.json         # workspace root
└── README.md
```

## 🚀 Kurulum

```bash
# Depoyu klonla
git clone https://github.com/<kullanici-adi>/<repo-adi>.git
cd <repo-adi>

# Bağımlılıkları kur (workspace, hepsini tek seferde kurar)
npm install

# Geliştirme ortamını başlat (client + server aynı anda)
npm run dev
```

## 🗺️ Yol Haritası

- [x] Altyapı ve oda sistemi
- [x] Futbolcu veri seti (504 futbolcu)
- [x] Açık artırma (draft) motoru — zorunlu açılış, anti-snipe, açılış pası
- [x] Kadro kuralları ve validasyon
- [x] Maç simülasyon algoritması (deterministik, uzatma + seri penaltı)
- [x] Eleme turnuvası (2 / 4 / 8 takım) ve rövanş
- [x] UI/UX ve canlı maç anlatımı
- [x] Canlı seri penaltı — köşe oyunu: atıcı ve kaleci eş zamanlı sol/orta/sağ
      seçer, 2D sahnede dalış/vuruş animasyonu, botlar rakibin alışkanlığını okur
- [x] Deploy (Vercel + Render) — canlı: <https://futbol-acik-arttirma.vercel.app/>

## 👥 Katkı (Contributing)

- `main` branch korumalı, her değişiklik PR ile girer
- Branch isimlendirme: `feature/*`, `fix/*`
- PR'lar karşılıklı review edilir

## 📄 Lisans

Bu proje kişisel/eğitim amaçlı geliştirilmektedir.
