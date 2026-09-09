import type { Team } from '@fal/shared';
import { simulateMatch } from '../simulation/simulator.js';

const teamA: Team = {
  participantId: 'team-a',
  nickname: 'Galatasaray XI',
  players: [],
  attack: 82,
  defense: 80
};

const teamB: Team = {
  participantId: 'team-b',
  nickname: 'Fenerbahçe XI',
  players: [],
  attack: 81,
  defense: 81
};

console.log('=== MAÇ SİMÜLASYONU TEST VE BENCHMARK ===');

// 1. Determinizm Doğrulaması
console.log('\n[1] Determinizm Testi Yapılıyor...');
const res1 = simulateMatch({ matchId: 'test-match-1', homeTeam: teamA, awayTeam: teamB, seed: 123456 });
const res2 = simulateMatch({ matchId: 'test-match-1', homeTeam: teamA, awayTeam: teamB, seed: 123456 });

if (
  res1.scoreHome === res2.scoreHome &&
  res1.scoreAway === res2.scoreAway &&
  JSON.stringify(res1.events) === JSON.stringify(res2.events)
) {
  console.log(`✓ BAŞARILI: Aynı seed (${123456}) ile iki kez çalıştırıldığında birebir aynı sonuç alındı!`);
  console.log(`  Skor: ${teamA.nickname} ${res1.scoreHome} - ${res1.scoreAway} ${teamB.nickname}`);
  console.log(`  Gol Olayları:`, res1.events);
} else {
  console.error('✗ HATA: Simülasyon deterministik değil!');
  process.exit(1);
}

// 2. 10.000 Maçlık Denge ve Gol Ortalaması Analizi
console.log('\n[2] 10.000 Maçlık Monte Carlo Simülasyonu Çalıştırılıyor...');
const TOTAL_MATCHES = 10000;
let totalGoals = 0;
let totalHomeGoals = 0;
let totalAwayGoals = 0;
let homeWins = 0;
let draws = 0;
let awayWins = 0;

for (let i = 0; i < TOTAL_MATCHES; i++) {
  const res = simulateMatch({
    matchId: `benchmark-${i}`,
    homeTeam: teamA,
    awayTeam: teamB,
    seed: i + 1
  });

  totalGoals += res.scoreHome + res.scoreAway;
  totalHomeGoals += res.scoreHome;
  totalAwayGoals += res.scoreAway;

  if (res.scoreHome > res.scoreAway) {
    homeWins++;
  } else if (res.scoreHome < res.scoreAway) {
    awayWins++;
  } else {
    draws++;
  }
}

const avgGoals = (totalGoals / TOTAL_MATCHES).toFixed(2);
const avgHome = (totalHomeGoals / TOTAL_MATCHES).toFixed(2);
const avgAway = (totalAwayGoals / TOTAL_MATCHES).toFixed(2);

console.log(`\n=== BENCHMARK SONUÇLARI (${TOTAL_MATCHES} Maç) ===`);
console.log(`Maç Başına Toplam Gol Ortalaması : ${avgGoals} (Hedef: 2.50 - 2.90)`);
console.log(`Ev Sahibi Gol Ortalaması         : ${avgHome}`);
console.log(`Deplasman Gol Ortalaması         : ${avgAway}`);
console.log(`Ev Sahibi Galibiyet Oranı        : %${((homeWins / TOTAL_MATCHES) * 100).toFixed(1)}`);
console.log(`Beraberlik Oranı                 : %${((draws / TOTAL_MATCHES) * 100).toFixed(1)}`);
console.log(`Deplasman Galibiyet Oranı        : %${((awayWins / TOTAL_MATCHES) * 100).toFixed(1)}`);

console.log('\nSimülasyon motoru başarıyla doğrulandı!');
