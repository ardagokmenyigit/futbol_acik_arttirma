# rooms/ — Oda & Lobi yönetimi (Kişi 1)

Sorumluluk (CLAUDE.md §4, Kişi 1):

- Oda oluşturma / katılma, oda kodu üretimi
- Host ataması, "hazır" durumu takibi
- 2–6 kişi sınırı kontrolü
- `Map<roomId, RoomState>` in-memory store
- Reconnect (`room:rejoin`) desteği

Socket eventleri: `room:create`, `room:join`, `room:rejoin`, `room:leave`,
`room:setReady`, `room:start` → bkz. `@fal/shared` `events.ts`.
