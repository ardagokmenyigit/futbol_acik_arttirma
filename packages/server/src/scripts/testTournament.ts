import { fillWithBotTeams, simulateFullTournament } from '../tournament/tournamentEngine.js';

console.log('=== TURNUVA SİSTEMİ TESTİ (4 ve 8 Takım) ===\n');

// 1. Test: Sadece 2 kullanıcı var, 4 takımlı turnuva istendi (2 bot tamamlanmalı)
console.log('[1] 4 Takımlı Turnuva Testi (2 Gerçek Kullanıcı + 2 Bot):');
const userTeams = [
  { id: 'user-1', nickname: 'Kerem FK', squad: [] },
  { id: 'user-2', nickname: 'Arda United', squad: [] },
];

const filled4 = fillWithBotTeams(userTeams, 4);
console.log(
  'Katılımcılar:',
  filled4.map((t) => `${t.nickname} (${t.isBot ? 'Bot' : 'Gerçek'})`),
);

const t4 = simulateFullTournament(filled4, 4, 100);
console.log(`\nOynanan Maç Sayısı: ${t4.results.length}`);
t4.results.forEach((r, idx) => {
  const home = filled4.find((t) => t.id === r.homeId)?.nickname ?? r.homeId;
  const away = filled4.find((t) => t.id === r.awayId)?.nickname ?? r.awayId;
  const pen = r.penaltiesHome !== undefined ? ` (Pen: ${r.penaltiesHome}-${r.penaltiesAway})` : '';
  const winner = filled4.find((t) => t.id === r.winnerId)?.nickname;
  console.log(
    `  Maç ${idx + 1}: ${home} ${r.scoreHome} - ${r.scoreAway} ${away}${pen} -> Tur Atlayan: ${winner}`,
  );
});

const champ4 = filled4.find((t) => t.id === t4.state.championId);
console.log(`🏆 4 Takımlı Turnuva Şampiyonu: ${champ4?.nickname}\n`);

// 2. Test: 3 gerçek kullanıcı var, 8 takımlı turnuva istendi (5 bot tamamlanmalı)
console.log('---------------------------------------------------------');
console.log('[2] 8 Takımlı Turnuva Testi (3 Gerçek Kullanıcı + 5 Bot):');
const userTeams8 = [
  { id: 'user-1', nickname: 'Kerem FK', squad: [] },
  { id: 'user-2', nickname: 'Arda United', squad: [] },
  { id: 'user-3', nickname: 'Boğaziçi FC', squad: [] },
];

const filled8 = fillWithBotTeams(userTeams8, 8);
console.log(
  'Katılımcılar:',
  filled8.map((t) => `${t.nickname} (${t.isBot ? 'Bot' : 'Gerçek'})`),
);

const t8 = simulateFullTournament(filled8, 8, 200);
console.log(`\nOynanan Maç Sayısı: ${t8.results.length} (4 Çeyrek Final + 2 Yarı Final + 1 Final)`);
t8.results.forEach((r, idx) => {
  const home = filled8.find((t) => t.id === r.homeId)?.nickname ?? r.homeId;
  const away = filled8.find((t) => t.id === r.awayId)?.nickname ?? r.awayId;
  const pen = r.penaltiesHome !== undefined ? ` (Pen: ${r.penaltiesHome}-${r.penaltiesAway})` : '';
  const winner = filled8.find((t) => t.id === r.winnerId)?.nickname;
  console.log(
    `  Maç ${idx + 1}: ${home} ${r.scoreHome} - ${r.scoreAway} ${away}${pen} -> Tur Atlayan: ${winner}`,
  );
});

const champ8 = filled8.find((t) => t.id === t8.state.championId);
console.log(`🏆 8 Takımlı Turnuva Şampiyonu: ${champ8?.nickname}\n`);
