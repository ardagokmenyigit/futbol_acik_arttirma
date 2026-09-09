import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Footballer, Position } from '@fal/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function mapPositions(posStr: string): Position | null {
  const tokens = posStr
    .replace(/"/g, '')
    .split(',')
    .map((s) => s.trim().toUpperCase());
  
  const primary = tokens[0] ?? '';
  if (primary === 'GK') return 'GK';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(primary)) return 'DEF';
  if (['CM', 'CDM', 'CAM', 'LM', 'RM'].includes(primary)) return 'MID';
  if (['ST', 'CF', 'RW', 'LW', 'RF', 'LF'].includes(primary)) return 'FWD';

  for (const pos of tokens) {
    if (pos === 'GK') return 'GK';
    if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(pos)) return 'DEF';
    if (['CM', 'CDM', 'CAM', 'LM', 'RM'].includes(pos)) return 'MID';
    if (['ST', 'CF', 'RW', 'LW', 'RF', 'LF'].includes(pos)) return 'FWD';
  }
  return null;
}

export function importFC26Data() {
  const csvPath = path.resolve(__dirname, '../../data/fc26_players.csv');
  const targetJsonPath = path.resolve(__dirname, '../../data/players.json');

  if (!fs.existsSync(csvPath)) {
    console.error(`Hata: ${csvPath} bulunamadı!`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = fileContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const headerLine = lines[0];
  if (!headerLine) return;

  const headers = parseCsvLine(headerLine);
  const col = (name: string) => headers.indexOf(name);

  const idxShortName = col('short_name');
  const idxLongName = col('long_name');
  const idxPositions = col('player_positions');
  const idxOverall = col('overall');
  const idxPace = col('pace');
  const idxShooting = col('shooting');
  const idxPassing = col('passing');
  const idxDefending = col('defending');
  const idxStamina = col('power_stamina');
  const idxGkReflexes = col('goalkeeping_reflexes');
  const idxGkDiving = col('goalkeeping_diving');

  const candidates: {
    name: string;
    position: Position;
    attack: number;
    defense: number;
    pace: number;
    stamina: number;
    overall: number;
  }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const cols = parseCsvLine(line);
    const posStr = cols[idxPositions] ?? '';
    const position = mapPositions(posStr);
    if (!position) continue;

    const overall = parseInt(cols[idxOverall] ?? '0', 10);
    if (isNaN(overall) || overall < 78) continue; // Sadece en üst düzey elit oyuncular

    const shortName = cols[idxShortName] ?? '';
    const longName = cols[idxLongName] ?? '';
    const name = shortName.length > 0 ? shortName : longName;

    const pace = parseInt(cols[idxPace] ?? '65', 10) || 65;
    const shooting = parseInt(cols[idxShooting] ?? '55', 10) || 55;
    const passing = parseInt(cols[idxPassing] ?? '55', 10) || 55;
    const defending = parseInt(cols[idxDefending] ?? '55', 10) || 55;
    const stamina = parseInt(cols[idxStamina] ?? '75', 10) || 75;
    const gkReflexes = parseInt(cols[idxGkReflexes] ?? '80', 10) || 80;
    const gkDiving = parseInt(cols[idxGkDiving] ?? '80', 10) || 80;

    let attack = 50;
    let defense = 50;

    if (position === 'GK') {
      attack = Math.round(passing * 0.35 + 10);
      defense = Math.round((gkReflexes + gkDiving) / 2);
    } else if (position === 'DEF') {
      attack = Math.round(shooting * 0.25 + passing * 0.45);
      defense = defending;
    } else if (position === 'MID') {
      attack = Math.round(shooting * 0.5 + passing * 0.5);
      defense = Math.round(defending * 0.7 + stamina * 0.3);
    } else {
      // FWD
      attack = Math.round(shooting * 0.75 + passing * 0.25);
      defense = Math.round(defending * 0.4);
    }

    candidates.push({
      name,
      position,
      attack: Math.max(15, Math.min(99, attack)),
      defense: Math.max(15, Math.min(99, defense)),
      pace: Math.max(30, Math.min(99, pace)),
      stamina: Math.max(40, Math.min(99, stamina)),
      overall
    });
  }

  // 108 adet en kaliteli EA SPORTS FC 26 oyuncusu: 16 GK, 34 DEF, 34 MID, 24 FWD
  const gks = candidates.filter((p) => p.position === 'GK').sort((a, b) => b.overall - a.overall).slice(0, 16);
  const defs = candidates.filter((p) => p.position === 'DEF').sort((a, b) => b.overall - a.overall).slice(0, 34);
  const mids = candidates.filter((p) => p.position === 'MID').sort((a, b) => b.overall - a.overall).slice(0, 34);
  const fwds = candidates.filter((p) => p.position === 'FWD').sort((a, b) => b.overall - a.overall).slice(0, 24);

  const selected = [...gks, ...defs, ...mids, ...fwds];

  const finalPlayers: Footballer[] = selected.map((p, index) => ({
    id: `fc26-${p.position.toLowerCase()}-${String(index + 1).padStart(3, '0')}`,
    ...p
  }));

  const output = {
    _comment: `EA SPORTS FC 26 Veri Tabanından derlenmiş en iyi ${finalPlayers.length} elit futbolcu (16 GK, 34 DEF, 34 MID, 24 FWD). Taban fiyat kaldırılmıştır (tam açık artırma).`,
    players: finalPlayers
  };

  fs.writeFileSync(targetJsonPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`[FC 26 İçe Aktarma] Taban fiyatsız veri başarıyla oluşturuldu!`);
  console.log(`Hedef Dosya: ${targetJsonPath}`);
  console.log(`Toplam Aktarılan Elit Oyuncu: ${finalPlayers.length}`);
  console.log(`Mevki Dağılımı: GK: ${gks.length}, DEF: ${defs.length}, MID: ${mids.length}, FWD: ${fwds.length}`);
}

importFC26Data();
