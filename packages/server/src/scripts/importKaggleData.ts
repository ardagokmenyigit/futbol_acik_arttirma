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

function mapPosition(pos: string): Position | null {
  const p = pos.toUpperCase().trim();
  if (p === 'GK') return 'GK';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p)) return 'DEF';
  if (['CM', 'CDM', 'CAM', 'LM', 'RM'].includes(p)) return 'MID';
  if (['ST', 'CF', 'RW', 'LW', 'RF', 'LF'].includes(p)) return 'FWD';
  return null;
}

function calculateBasePrice(overall: number): number {
  if (overall >= 91) return 20;
  if (overall >= 89) return 17;
  if (overall >= 87) return 14;
  if (overall >= 85) return 11;
  if (overall >= 83) return 8;
  if (overall >= 81) return 6;
  if (overall >= 79) return 4;
  if (overall >= 76) return 3;
  return 2;
}

export function importKaggleData() {
  const csvPath = path.resolve(__dirname, '../../data/kaggle_fifa23.csv');
  const targetJsonPath = path.resolve(__dirname, '../../data/players.json');

  if (!fs.existsSync(csvPath)) {
    console.error(`Hata: ${csvPath} bulunamadı!`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = fileContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const headerLine = lines[0];
  if (!headerLine) {
    console.error('CSV boş görünüyor!');
    return;
  }

  const headers = parseCsvLine(headerLine);
  const colIndex = (colName: string) => headers.indexOf(colName);

  const idxName = colIndex('Full Name');
  const idxKnownAs = colIndex('Known As');
  const idxOverall = colIndex('Overall');
  const idxBestPos = colIndex('Best Position');
  const idxShooting = colIndex('Shooting Total');
  const idxPassing = colIndex('Passing Total');
  const _idxDribbling = colIndex('Dribbling Total');
  const idxDefending = colIndex('Defending Total');
  const idxGkReflex = colIndex('Goalkeeper Reflexes');
  const idxGkDiv = colIndex('Goalkeeper Diving');

  const rawCandidates: {
    name: string;
    position: Position;
    attack: number;
    defense: number;
    overall: number;
    basePrice: number;
  }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const cols = parseCsvLine(line);
    const rawPos = cols[idxBestPos] ?? '';
    const position = mapPosition(rawPos);
    if (!position) continue;

    const overall = parseInt(cols[idxOverall] ?? '0', 10);
    if (isNaN(overall) || overall < 76) continue; // Sadece elit ve kaliteli havuz

    const knownAs = cols[idxKnownAs] ?? '';
    const fullName = cols[idxName] ?? '';
    const name = knownAs.length > 0 && knownAs !== '-' ? knownAs : fullName;

    const shooting = parseInt(cols[idxShooting] ?? '50', 10) || 50;
    const passing = parseInt(cols[idxPassing] ?? '50', 10) || 50;
    const defending = parseInt(cols[idxDefending] ?? '50', 10) || 50;
    const gkReflex = parseInt(cols[idxGkReflex] ?? '75', 10) || 75;
    const gkDiv = parseInt(cols[idxGkDiv] ?? '75', 10) || 75;

    let attack = 50;
    let defense = 50;

    if (position === 'GK') {
      attack = Math.round(passing * 0.3 + 10);
      defense = Math.round((gkReflex + gkDiv) / 2);
    } else if (position === 'DEF') {
      attack = Math.round(shooting * 0.3 + passing * 0.4);
      defense = defending;
    } else if (position === 'MID') {
      attack = Math.round(shooting * 0.5 + passing * 0.5);
      defense = defending;
    } else {
      // FWD
      attack = Math.round(shooting * 0.7 + passing * 0.3);
      defense = Math.round(defending * 0.4);
    }

    const basePrice = calculateBasePrice(overall);

    rawCandidates.push({
      name,
      position,
      attack: Math.max(15, Math.min(99, attack)),
      defense: Math.max(15, Math.min(99, defense)),
      overall,
      basePrice,
    });
  }

  // Mevkilerine göre sıralayıp en iyi kontenjanı al:
  // GK: 20, DEF: 45, MID: 45, FWD: 35 (Toplam 145 elit oyuncu)
  const gks = rawCandidates
    .filter((p) => p.position === 'GK')
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 20);
  const defs = rawCandidates
    .filter((p) => p.position === 'DEF')
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 45);
  const mids = rawCandidates
    .filter((p) => p.position === 'MID')
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 45);
  const fwds = rawCandidates
    .filter((p) => p.position === 'FWD')
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 35);

  const selected = [...gks, ...defs, ...mids, ...fwds];

  const finalPlayers: Footballer[] = selected.map((p, index) => ({
    id: `kgl-${p.position.toLowerCase()}-${String(index + 1).padStart(3, '0')}`,
    ...p,
  }));

  const output = {
    _comment: `Kaggle Official FIFA 23 Dataset'ten derlenmiş ${finalPlayers.length} adet futbolcu havuzu (20 GK, 45 DEF, 45 MID, 35 FWD).`,
    players: finalPlayers,
  };

  fs.writeFileSync(targetJsonPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`[Kaggle İçe Aktarma] Başarıyla tamamlandı!`);
  console.log(`Hedef Dosya: ${targetJsonPath}`);
  console.log(`Toplam Aktarılan Oyuncu: ${finalPlayers.length}`);
  console.log(
    `Mevki Dağılımı: GK: ${gks.length}, DEF: ${defs.length}, MID: ${mids.length}, FWD: ${fwds.length}`,
  );
}

importKaggleData();
