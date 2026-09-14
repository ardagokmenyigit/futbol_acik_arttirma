import {
  ATTACK_WEIGHT,
  DEFAULT_ROOM_CONFIG,
  DEFENSE_WEIGHT,
  positionWeights,
  type Footballer,
  type Position,
} from '@fal/shared';
import { loadFootballers } from '../auction/pool.js';

/**
 * VERİ SETİ SÖZLEŞMESİ DOĞRULAMASI (bkz. shared/types.ts calculateTeamStats).
 *
 * Aynı mevkideki iki oyuncudan GEN'i yüksek olanın tam kadroya güç katkısı
 * her zaman daha yüksek olmalı. Katkı, kadrodan bağımsızdır (payda mevki
 * sabiti): `aw·att/Σaw/2 + dw·def/Σdw/2`.
 *
 * Çalıştır: npx tsx packages/server/src/scripts/checkPowerMonotonic.ts
 * Ağırlık ya da veri seti değişince sıfır ihlal görmeden birleştirmeyin.
 */

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
const squad = DEFAULT_ROOM_CONFIG.squad;
const attackTotal = POSITIONS.reduce((s, p) => s + ATTACK_WEIGHT[p] * squad[p], 0);
const defenseTotal = POSITIONS.reduce((s, p) => s + DEFENSE_WEIGHT[p] * squad[p], 0);

export function powerContribution(f: Footballer): number {
  const { attack, defense } = positionWeights(f);
  return (attack * f.attack) / attackTotal / 2 + (defense * f.defense) / defenseTotal / 2;
}

const players = loadFootballers();
let violations = 0;

for (const pos of POSITIONS) {
  const sorted = players.filter((f) => f.position === pos).sort((a, b) => a.overall - b.overall);
  let below: Footballer | null = null;
  let belowMax = -Infinity;
  let groupOvr: number | null = null;
  let groupMax = -Infinity;
  let groupBest: Footballer | null = null;

  for (const f of sorted) {
    if (f.overall !== groupOvr) {
      if (groupMax > belowMax) {
        belowMax = groupMax;
        below = groupBest;
      }
      groupOvr = f.overall;
      groupMax = -Infinity;
      groupBest = null;
    }
    const c = powerContribution(f);
    if (below && c <= belowMax) {
      violations++;
      console.log(
        `İHLAL ${pos}: ${f.name} (GEN ${f.overall}, katkı ${c.toFixed(3)}) ≤ ` +
          `${below.name} (GEN ${below.overall}, katkı ${belowMax.toFixed(3)})`,
      );
    }
    if (c > groupMax) {
      groupMax = c;
      groupBest = f;
    }
  }
  console.log(`${pos}: ${sorted.length} oyuncu kontrol edildi`);
}

if (violations > 0) {
  console.error(`\n${violations} ihlal — veri seti sözleşmeyi karşılamıyor.`);
  process.exit(1);
}
console.log('\nTAMAM — her mevkide GEN sırası = güç sırası.');
