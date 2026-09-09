# auction/ — Açık Artırma (Draft) motoru (Kişi 1)

Sorumluluk (CLAUDE.md §3.1, §4, Kişi 1):

- Round yönetimi, futbolcu havuzundan rastgele çekme
- Timer + `auction:tick` yayını (her saniye kalan süre)
- Teklif validasyonu: en yüksek tekliften büyük mü, bütçe yeter mi,
  pozisyonda yer var mı
- Süre bitince kazananı belirleme, bütçe düşme, kadroya ekleme
- Havuz bitene / tüm kadrolar dolana kadar döngü

Socket eventleri: `auction:bid` (in), `auction:started` / `auction:tick` /
`auction:bid` / `auction:won` / `auction:finished` (out).
