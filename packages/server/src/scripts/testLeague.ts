import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Footballer } from '@fal/shared';
import { simulateFullLeague } from '../league/leagueEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Oyuncu verisini yükle
const playersRaw = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../data/players.json'), 'utf-8')
);
const allPlayers: Footballer[] = playersRaw.players;

// 4 örnek takım oluştur
const teams = [
  {
    id: 'user-1',
    nickname: 'Kerem FK',
    squad: allPlayers.slice(0, 15) // GK, DEF, MID ağırlıklı
  },
  {
    id: 'user-2',
    nickname: 'Arda United',
    squad: allPlayers.slice(15, 30)
  },
  {
    id: 'user-3',
    nickname: 'Boğaziçi FC',
    squad: allPlayers.slice(30, 45)
  },
  {
    id: 'user-4',
    nickname: 'Anadolu Yıldızları',
    squad: allPlayers.slice(45, 60)
  }
];

console.log('=== LİG VE FİKSTÜR SİMÜLASYON TESTİ ===\n');

const leagueState = simulateFullLeague(teams, 2026);

console.log(`[1] Üretilen Fikstür (${leagueState.fixtures.length} Maç):`);
leagueState.fixtures.forEach((f, i) => {
  const home = teams.find((t) => t.id === f.homeId)?.nickname;
  const away = teams.find((t) => t.id === f.awayId)?.nickname;
  const res = leagueState.results[i];
  if (!res) return;

  console.log(`  Maç ${i + 1}: ${home} ${res.scoreHome} - ${res.scoreAway} ${away}`);
  if (res.events.length > 0) {
    const eventSummary = res.events
      .map((e) => `${e.minute}' (${teams.find((t) => t.id === e.teamId)?.nickname})`)
      .join(', ');
    console.log(`         Goller: ${eventSummary}`);
  }
});

console.log('\n[2] Sezon Sonu Puan Tablosu:');
console.log('----------------------------------------------------------------------');
console.log(
  'Sıra | Takım             | O  | G  | B  | M  | AG | YG | AV  | Puan'
);
console.log('----------------------------------------------------------------------');

leagueState.standings.forEach((row, idx) => {
  const rank = String(idx + 1).padEnd(4);
  const name = row.nickname.padEnd(17);
  const o = String(row.played).padStart(2);
  const g = String(row.won).padStart(2);
  const b = String(row.drawn).padStart(2);
  const m = String(row.lost).padStart(2);
  const ag = String(row.goalsFor).padStart(2);
  const yg = String(row.goalsAgainst).padStart(2);
  const av = (row.goalDifference > 0 ? `+${row.goalDifference}` : `${row.goalDifference}`).padStart(3);
  const p = String(row.points).padStart(4);

  console.log(`${rank} | ${name} | ${o} | ${g} | ${b} | ${m} | ${ag} | ${yg} | ${av} | ${p}`);
});
console.log('----------------------------------------------------------------------');

const champion = teams.find((t) => t.id === leagueState.championId);
console.log(`\n🏆 ŞAMPİYON: ${champion?.nickname} (ID: ${champion?.id})`);
