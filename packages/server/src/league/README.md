# league/ — Fikstür & puan tablosu (Kişi 2)

Sorumluluk (CLAUDE.md §3.3, §4, Kişi 2):

- N takım için round-robin fikstür üretimi
- Maçları sırayla simüle etme, sonuçları puan tablosuna işleme
- Puanlama: G=3, B=1, M=0; eşitlikte averaj (gol farkı)
- Şampiyon belirleme

Socket eventleri: `league:fixtures`, `league:matchResult`, `league:finished`.
