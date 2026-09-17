# Veri Seti

## `players.json` ELLE BAKIMLIDIR — ÜRETİLMEZ

648 futbolcu (82 GK, 150 DEF, 217 MID, 199 FWD). Bu dosya tek doğru kaynaktır
ve **hiçbir script tarafından üretilmez.**

Oyuncu başına alanlar: `id`, `name`, `position`, `overall`. **HÜC/SAV alanı
yoktur** — takım gücü yalnız GEN ve mevkiden hesaplanır (`CLAUDE.md` §3.2,
`POSITION_POWER_WEIGHT`). Eski `attack`/`defense` alanları 17 Eylül 2026'da
kaldırıldı: elle kalibre edilen bu sayılar her veri güncellemesinde GEN–güç
sırasını bozuyordu (son güncellemede 321 ihlal). Yeni oyuncu eklerken yalnız
GEN'i doğru girmek yeterlidir; fazladan alanlar ayrıştırıcı tarafından yok
sayılır ama eklemeyin.

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

Mevki, GEN'in hangi eksene aktığını belirler: GK ve DEF tamamen savunmaya,
FWD tamamen hücuma, MID 1.5 hücum / 0.5 savunma. Bu yüzden **kanatlar ve
ofansif orta sahalar FWD, tam saha / defansif orta sahalar MID** olarak
etiketlenmelidir — bir kanadı MID yapmak onun GEN'inin dörtte birini savunmaya
yazar. (Eski modelde bu kural "savunması 70'in altındaki oyuncu MID olmasın"
diye SAV alanı üzerinden ifade ediliyordu; alan kalkınca kural mevki
tanımının kendisi oldu.)

## Kaynak

EA SPORTS FC 26 veri tabanından derlenmiştir.
