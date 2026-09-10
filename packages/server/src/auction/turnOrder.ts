/**
 * ============================================================================
 *  DENGELİ AÇILIŞ SIRASI
 * ----------------------------------------------------------------------------
 *  Draft `squadSize × katılımcı` kadar TUR sürer (4 oyuncu × 7 kadro = 28).
 *  Her tur, önceden seçilmiş draft havuzundan bir futbolcunun açık artırmasıdır.
 *
 *  Sıra yalnızca **AÇILIŞ TEKLİFİNİ** kimin vereceğini belirler. Açılıştan
 *  sonra teklif serbesttir (pas hakkı yoktur — istemeyen teklif vermez).
 *  Sıradaki katılımcı pozisyona giremiyorsa (kadrosu dolu) açılış, o turun
 *  sırasındaki ilk uygun katılımcıya geçer.
 *
 *  ADALET
 *  Her katılımcının tüm turlardaki sıra numaralarının TOPLAMI eşit olmalı.
 *  Tur sayısı `squadSize × n` olduğu için r HER ZAMAN n'in katıdır; bu yüzden
 *  **döngüsel kaydırma** (tur t'de sıra t kadar döner) her katılımcıya her
 *  sırayı tam `squadSize` kez verir:
 *
 *      toplam = squadSize · n(n+1)/2   → her katılımcı için AYNI (fark 0)
 *      açılış sayısı = squadSize        → herkes eşit sayıda açar
 *
 *  Yani 2–8 oyuncunun hepsinde TAM ADALET sağlanır. (Eski 7 turluk yapıda
 *  çift oyuncu sayılarında bu matematiksel olarak imkansızdı.)
 *
 *  `rounds` n'in katı değilse (ayar değişirse) döngüsel dağıtım tek başına
 *  yetmez; bu durumda plato hareketlerine izin veren deterministik bir onarım
 *  araması devreye girer ve teorik optimuma iner.
 *
 *  Tamamen deterministiktir: aynı katılımcı listesi + aynı tur sayısı → aynı
 *  sıralar. Sunucu tek doğruluk kaynağıdır, istemci sadece gösterir.
 * ============================================================================
 */

export interface TurnOrderPlan {
  /** `orders[tur][sıra-1] = participantId`. `orders[tur][0]` açılışı yapar. */
  orders: string[][];
  /** participantId → tüm turlardaki sıra numaralarının toplamı. */
  sums: Record<string, number>;
  /** participantId → kaç turda açılış teklifini verdiği (sıra 1). */
  openCounts: Record<string, number>;
  /** En yüksek ve en düşük toplam arasındaki fark. */
  spread: number;
  /** Bu (n, r) için ulaşılabilecek en küçük fark. `spread` buna eşittir. */
  minSpread: number;
  /** Fark 0 mı — yani tam adalet sağlandı mı? */
  perfectlyFair: boolean;
}

/** Bu katılımcı ve tur sayısı için ulaşılabilecek en küçük toplam farkı. */
function theoreticalMinSpread(n: number, rounds: number): number {
  if (rounds <= 1) return Math.max(0, n - 1);
  return (rounds * (n + 1)) % 2 === 0 ? 0 : 1;
}

/** Onarım aramasının üst sınırı (yalnızca r, n'in katı değilse çalışır). */
const MAX_REPAIR_STEPS = 4000;

/**
 * `rounds` tur boyunca `participantIds` için dengeli açılış sıraları üretir.
 * Toplamlar arasındaki fark her zaman teorik minimumdadır; `rounds` n'in katı
 * olduğunda (normal durum) fark 0'dır.
 */
export function buildTurnOrders(participantIds: string[], rounds: number): TurnOrderPlan {
  const n = participantIds.length;
  if (n === 0 || rounds <= 0) {
    return { orders: [], sums: {}, openCounts: {}, spread: 0, minSpread: 0, perfectlyFair: true };
  }

  // Döngüsel kaydırma: tur t'de sıra t kadar döner.
  const orders: string[][] = [];
  for (let t = 0; t < rounds; t++) {
    const order: string[] = [];
    for (let i = 0; i < n; i++) order.push(participantIds[(i + t) % n]!);
    orders.push(order);
  }

  const minSpread = theoreticalMinSpread(n, rounds);

  const calcSums = (): Record<string, number> => {
    const s: Record<string, number> = {};
    for (const id of participantIds) s[id] = 0;
    for (const order of orders) {
      order.forEach((id, i) => {
        s[id] = (s[id] ?? 0) + (i + 1);
      });
    }
    return s;
  };

  // r, n'in katıysa döngüsel dağıtım zaten mükemmeldir; değilse onar.
  if (rounds % n !== 0) {
    const ideal = (rounds * (n + 1)) / 2;
    const cost = (s: Record<string, number>): number =>
      participantIds.reduce((acc, id) => acc + ((s[id] ?? 0) - ideal) ** 2, 0);
    const stateKey = (): string => orders.map((o) => o.join(',')).join('|');
    const seen = new Set<string>([stateKey()]);
    let current = cost(calcSums());

    for (let step = 0; step < MAX_REPAIR_STEPS; step++) {
      const sums = calcSums();
      const values = participantIds.map((id) => sums[id] ?? 0);
      if (Math.max(...values) - Math.min(...values) <= minSpread) break;

      let best: { t: number; a: number; b: number; key: string } | null = null;
      let bestCost = Infinity;
      for (let t = 0; t < rounds; t++) {
        const order = orders[t];
        if (!order) continue;
        for (let a = 0; a < n; a++) {
          for (let b = a + 1; b < n; b++) {
            [order[a], order[b]] = [order[b]!, order[a]!];
            const key = stateKey();
            if (!seen.has(key)) {
              const c = cost(calcSums());
              if (c < bestCost) {
                bestCost = c;
                best = { t, a, b, key };
              }
            }
            [order[a], order[b]] = [order[b]!, order[a]!];
          }
        }
      }
      if (!best || bestCost > current) break;
      const order = orders[best.t]!;
      [order[best.a], order[best.b]] = [order[best.b]!, order[best.a]!];
      seen.add(best.key);
      current = bestCost;
    }
  }

  const sums = calcSums();
  const openCounts: Record<string, number> = {};
  for (const id of participantIds) openCounts[id] = 0;
  for (const order of orders) {
    const first = order[0];
    if (first) openCounts[first] = (openCounts[first] ?? 0) + 1;
  }

  const values = participantIds.map((id) => sums[id] ?? 0);
  const spread = Math.max(...values) - Math.min(...values);
  return { orders, sums, openCounts, spread, minSpread, perfectlyFair: spread === 0 };
}
