# Veri Seti

## `players.json` ELLE BAKIMLIDIR — ÜRETİLMEZ

504 futbolcu (72 GK, 144 DEF, 119 MID, 169 FWD). Bu dosya tek doğru kaynaktır
ve **hiçbir script tarafından üretilmez.**

Bir dönem üç ayrı script bu dosyanın üstüne yazıyordu (`generatePlayers.ts`,
`importFromFC26.ts`, `importKaggleData.ts`). Üçü de bayatlamıştı: 108 oyuncu
(16/34/34/24 dağılımı) ve artık kullanılmayan `basePrice` alanıyla dosyayı
yeniden yazıyorlardı. Üçü de dosya seviyesinde kendini çağırıyordu, yani
çalıştırılmaları yeterliydi — `generatePlayers.ts` için dış bir girdi bile
gerekmiyordu. Hepsi silindi (git geçmişinde duruyorlar).

**Yeni bir üretici script yazmayın.** Veri düzeltmesi gerekiyorsa JSON'u
doğrudan düzenleyin ve PR açın.

## Sahiplik

Bu dosya **Kişi 2 (@keshhhh06)** sorumluluğundadır. Değiştiren PR'da kendisini
etiketlemelidir (bkz. `CLAUDE.md` §4).

## Mevki sınıflandırması

Oyunun güç modelinde MID mevkisinde savunma, hücum kadar sayılır
(`ATTACK_WEIGHT.MID` = `DEFENSE_WEIGHT.MID` = 0.6). Bu yüzden **savunması 70'in
altındaki oyuncular MID olarak etiketlenmemelidir** — kanatlar ve ofansif orta
sahalar FWD'dir.

Kural bir kez ihlal edilmişti: Salah, Yamal, Raphinha gibi kanatlar MID
etiketliydi ve savunmaları 25–58 arasındaydı. Sonuç olarak GEN reytingi orta
sahada gerçek katkıyı ölçmüyordu (sıra korelasyonu yalnızca 0.509) ve veri
setindeki en yüksek reytingli orta saha, katkıya göre 144 oyuncu içinde 129.
sıradaydı. 25 oyuncu FWD'ye taşınarak düzeltildi (korelasyon 0.866).

Eşik keyfî değil: orta sahaların savunma dağılımında 70'te doğal bir kırılma
var (65–69 aralığında 7 oyuncu, 70–74 aralığında 20, 75–79 aralığında 52).

## Kaynak

EA SPORTS FC 26 veri tabanından derlenmiştir.
