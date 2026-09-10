/**
 * Maç simülasyon motoru — TEK KAYNAK `@fal/shared`'dadır.
 *
 * Motor eskiden burada ve `shared/src/simulation/simulator.ts` içinde İKİ AYRI
 * KOPYA olarak duruyordu ve sabitleri birbirinden ayrışmıştı (chanceRate
 * 0.3 vs 0.078, baseConversion 0.088 vs 0.21). Sonuç: aynı girdi + aynı seed
 * iki farklı skor üretiyordu; maç başına gol 2.73'e karşı 1.60'tı. Sunucu
 * gerçek maçları bir motorla oynatırken istemcinin turnuva önizleme ekranı
 * bambaşka bir oyun gösteriyordu.
 *
 * Bu dosya artık yalnızca yeniden dışa aktarır — `simulation/teamStats.ts`
 * ile aynı desen. Motoru değiştirmek isteyen `@fal/shared` içindeki tek
 * kopyayı değiştirir, iki taraf birden güncellenir.
 */
export { simulateMatch, type SimulateMatchOptions } from '@fal/shared';
