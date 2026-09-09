import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Position } from '@fal/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RawPlayer {
  id: string;
  name: string;
  position: Position;
  attack: number;
  defense: number;
  pace?: number;
  stamina?: number;
  overall: number;
  basePrice: number;
}

export const PLAYERS: RawPlayer[] = [
  // ===================== KALECİLER (GK - 16 Oyuncu) =====================
  { id: 'p-gk-01', name: 'Thibaut Courtois', position: 'GK', attack: 18, defense: 91, pace: 50, stamina: 72, overall: 90, basePrice: 16 },
  { id: 'p-gk-02', name: 'Alisson Becker', position: 'GK', attack: 22, defense: 89, pace: 54, stamina: 74, overall: 89, basePrice: 15 },
  { id: 'p-gk-03', name: 'Ederson Moraes', position: 'GK', attack: 30, defense: 87, pace: 62, stamina: 75, overall: 88, basePrice: 14 },
  { id: 'p-gk-04', name: 'Jan Oblak', position: 'GK', attack: 15, defense: 88, pace: 48, stamina: 73, overall: 88, basePrice: 14 },
  { id: 'p-gk-05', name: 'Marc-André ter Stegen', position: 'GK', attack: 24, defense: 87, pace: 52, stamina: 72, overall: 87, basePrice: 13 },
  { id: 'p-gk-06', name: 'Gianluigi Donnarumma', position: 'GK', attack: 16, defense: 88, pace: 51, stamina: 70, overall: 87, basePrice: 13 },
  { id: 'p-gk-07', name: 'Mike Maignan', position: 'GK', attack: 20, defense: 87, pace: 55, stamina: 74, overall: 87, basePrice: 12 },
  { id: 'p-gk-08', name: 'David Raya', position: 'GK', attack: 25, defense: 84, pace: 57, stamina: 75, overall: 84, basePrice: 9 },
  { id: 'p-gk-09', name: 'Emiliano Martínez', position: 'GK', attack: 19, defense: 86, pace: 50, stamina: 76, overall: 86, basePrice: 11 },
  { id: 'p-gk-10', name: 'Manuel Neuer', position: 'GK', attack: 28, defense: 84, pace: 52, stamina: 68, overall: 85, basePrice: 9 },
  { id: 'p-gk-11', name: 'Guglielmo Vicario', position: 'GK', attack: 18, defense: 83, pace: 53, stamina: 72, overall: 83, basePrice: 7 },
  { id: 'p-gk-12', name: 'Yann Sommer', position: 'GK', attack: 21, defense: 84, pace: 50, stamina: 70, overall: 84, basePrice: 8 },
  { id: 'p-gk-13', name: 'Fernando Muslera', position: 'GK', attack: 20, defense: 81, pace: 49, stamina: 71, overall: 81, basePrice: 5 },
  { id: 'p-gk-14', name: 'Dominik Livaković', position: 'GK', attack: 16, defense: 81, pace: 52, stamina: 73, overall: 81, basePrice: 5 },
  { id: 'p-gk-15', name: 'Uğurcan Çakır', position: 'GK', attack: 17, defense: 80, pace: 50, stamina: 72, overall: 80, basePrice: 4 },
  { id: 'p-gk-16', name: 'Mert Günok', position: 'GK', attack: 19, defense: 79, pace: 48, stamina: 70, overall: 79, basePrice: 3 },

  // ===================== DEFANSLAR (DEF - 34 Oyuncu) =====================
  { id: 'p-def-01', name: 'Virgil van Dijk', position: 'DEF', attack: 60, defense: 91, pace: 78, stamina: 84, overall: 89, basePrice: 16 },
  { id: 'p-def-02', name: 'Rúben Dias', position: 'DEF', attack: 45, defense: 89, pace: 71, stamina: 86, overall: 88, basePrice: 14 },
  { id: 'p-def-03', name: 'William Saliba', position: 'DEF', attack: 48, defense: 88, pace: 82, stamina: 85, overall: 87, basePrice: 13 },
  { id: 'p-def-04', name: 'Antonio Rüdiger', position: 'DEF', attack: 52, defense: 87, pace: 84, stamina: 88, overall: 87, basePrice: 13 },
  { id: 'p-def-05', name: 'Alessandro Bastoni', position: 'DEF', attack: 58, defense: 87, pace: 74, stamina: 82, overall: 86, basePrice: 12 },
  { id: 'p-def-06', name: 'Marquinhos', position: 'DEF', attack: 54, defense: 86, pace: 77, stamina: 83, overall: 86, basePrice: 11 },
  { id: 'p-def-07', name: 'Gabriel Magalhães', position: 'DEF', attack: 56, defense: 86, pace: 75, stamina: 84, overall: 86, basePrice: 11 },
  { id: 'p-def-08', name: 'Ronald Araújo', position: 'DEF', attack: 50, defense: 86, pace: 81, stamina: 85, overall: 86, basePrice: 11 },
  { id: 'p-def-09', name: 'John Stones', position: 'DEF', attack: 64, defense: 85, pace: 72, stamina: 80, overall: 85, basePrice: 10 },
  { id: 'p-def-10', name: 'Joško Gvardiol', position: 'DEF', attack: 62, defense: 84, pace: 80, stamina: 84, overall: 85, basePrice: 10 },
  { id: 'p-def-11', name: 'Theo Hernández', position: 'DEF', attack: 78, defense: 80, pace: 93, stamina: 89, overall: 86, basePrice: 12 },
  { id: 'p-def-12', name: 'Achraf Hakimi', position: 'DEF', attack: 77, defense: 78, pace: 92, stamina: 88, overall: 85, basePrice: 11 },
  { id: 'p-def-13', name: 'Alphonso Davies', position: 'DEF', attack: 74, defense: 77, pace: 95, stamina: 86, overall: 84, basePrice: 10 },
  { id: 'p-def-14', name: 'Trent Alexander-Arnold', position: 'DEF', attack: 81, defense: 75, pace: 76, stamina: 82, overall: 85, basePrice: 11 },
  { id: 'p-def-15', name: 'Federico Dimarco', position: 'DEF', attack: 76, defense: 78, pace: 82, stamina: 85, overall: 84, basePrice: 9 },
  { id: 'p-def-16', name: 'Dani Carvajal', position: 'DEF', attack: 68, defense: 83, pace: 78, stamina: 85, overall: 85, basePrice: 10 },
  { id: 'p-def-17', name: 'Kyle Walker', position: 'DEF', attack: 63, defense: 82, pace: 88, stamina: 83, overall: 84, basePrice: 9 },
  { id: 'p-def-18', name: 'Jules Koundé', position: 'DEF', attack: 58, defense: 84, pace: 81, stamina: 84, overall: 84, basePrice: 9 },
  { id: 'p-def-19', name: 'Cristian Romero', position: 'DEF', attack: 52, defense: 84, pace: 76, stamina: 85, overall: 84, basePrice: 9 },
  { id: 'p-def-20', name: 'Kim Min-jae', position: 'DEF', attack: 48, defense: 84, pace: 79, stamina: 84, overall: 84, basePrice: 9 },
  { id: 'p-def-21', name: 'Dayot Upamecano', position: 'DEF', attack: 50, defense: 83, pace: 82, stamina: 83, overall: 83, basePrice: 8 },
  { id: 'p-def-22', name: 'Ibrahima Konaté', position: 'DEF', attack: 47, defense: 83, pace: 79, stamina: 82, overall: 83, basePrice: 8 },
  { id: 'p-def-23', name: 'Destiny Udogie', position: 'DEF', attack: 70, defense: 78, pace: 86, stamina: 86, overall: 82, basePrice: 7 },
  { id: 'p-def-24', name: 'Ferdi Kadıoğlu', position: 'DEF', attack: 74, defense: 78, pace: 84, stamina: 90, overall: 82, basePrice: 7 },
  { id: 'p-def-25', name: 'Pau Torres', position: 'DEF', attack: 56, defense: 82, pace: 73, stamina: 80, overall: 82, basePrice: 7 },
  { id: 'p-def-26', name: 'Sven Botman', position: 'DEF', attack: 45, defense: 82, pace: 70, stamina: 81, overall: 82, basePrice: 6 },
  { id: 'p-def-27', name: 'Davinson Sánchez', position: 'DEF', attack: 52, defense: 81, pace: 78, stamina: 83, overall: 81, basePrice: 6 },
  { id: 'p-def-28', name: 'Alexander Djiku', position: 'DEF', attack: 48, defense: 80, pace: 75, stamina: 82, overall: 80, basePrice: 5 },
  { id: 'p-def-29', name: 'Abdülkerim Bardakcı', position: 'DEF', attack: 58, defense: 80, pace: 68, stamina: 81, overall: 80, basePrice: 5 },
  { id: 'p-def-30', name: 'Victor Nelsson', position: 'DEF', attack: 42, defense: 80, pace: 70, stamina: 82, overall: 79, basePrice: 4 },
  { id: 'p-def-31', name: 'Çağlar Söyüncü', position: 'DEF', attack: 46, defense: 79, pace: 74, stamina: 80, overall: 79, basePrice: 4 },
  { id: 'p-def-32', name: 'Jayden Oosterwolde', position: 'DEF', attack: 65, defense: 77, pace: 88, stamina: 85, overall: 79, basePrice: 4 },
  { id: 'p-def-33', name: 'Gabriel Paulista', position: 'DEF', attack: 44, defense: 78, pace: 67, stamina: 78, overall: 78, basePrice: 3 },
  { id: 'p-def-34', name: 'Eren Elmalı', position: 'DEF', attack: 64, defense: 75, pace: 80, stamina: 82, overall: 76, basePrice: 2 },

  // ===================== ORTA SAHALAR (MID - 34 Oyuncu) =====================
  { id: 'p-mid-01', name: 'Rodri', position: 'MID', attack: 81, defense: 89, pace: 68, stamina: 92, overall: 91, basePrice: 18 },
  { id: 'p-mid-02', name: 'Kevin De Bruyne', position: 'MID', attack: 88, defense: 65, pace: 73, stamina: 84, overall: 90, basePrice: 17 },
  { id: 'p-mid-03', name: 'Jude Bellingham', position: 'MID', attack: 87, defense: 79, pace: 80, stamina: 91, overall: 90, basePrice: 17 },
  { id: 'p-mid-04', name: 'Martin Ødegaard', position: 'MID', attack: 85, defense: 68, pace: 77, stamina: 88, overall: 88, basePrice: 15 },
  { id: 'p-mid-05', name: 'Federico Valverde', position: 'MID', attack: 83, defense: 81, pace: 88, stamina: 94, overall: 88, basePrice: 15 },
  { id: 'p-mid-06', name: 'Declan Rice', position: 'MID', attack: 76, defense: 87, pace: 77, stamina: 92, overall: 87, basePrice: 14 },
  { id: 'p-mid-07', name: 'Bernardo Silva', position: 'MID', attack: 84, defense: 72, pace: 78, stamina: 93, overall: 88, basePrice: 14 },
  { id: 'p-mid-08', name: 'Florian Wirtz', position: 'MID', attack: 86, defense: 58, pace: 82, stamina: 85, overall: 88, basePrice: 15 },
  { id: 'p-mid-09', name: 'Jamal Musiala', position: 'MID', attack: 87, defense: 56, pace: 86, stamina: 84, overall: 88, basePrice: 15 },
  { id: 'p-mid-10', name: 'Nicolò Barella', position: 'MID', attack: 80, defense: 80, pace: 81, stamina: 93, overall: 87, basePrice: 13 },
  { id: 'p-mid-11', name: 'Bruno Fernandes', position: 'MID', attack: 86, defense: 67, pace: 75, stamina: 94, overall: 87, basePrice: 13 },
  { id: 'p-mid-12', name: 'Frenkie de Jong', position: 'MID', attack: 80, defense: 78, pace: 82, stamina: 88, overall: 87, basePrice: 13 },
  { id: 'p-mid-13', name: 'Eduardo Camavinga', position: 'MID', attack: 77, defense: 82, pace: 82, stamina: 88, overall: 86, basePrice: 12 },
  { id: 'p-mid-14', name: 'Aurélien Tchouaméni', position: 'MID', attack: 75, defense: 84, pace: 76, stamina: 87, overall: 86, basePrice: 12 },
  { id: 'p-mid-15', name: 'Joshua Kimmich', position: 'MID', attack: 78, defense: 82, pace: 70, stamina: 89, overall: 86, basePrice: 12 },
  { id: 'p-mid-16', name: 'Alexis Mac Allister', position: 'MID', attack: 81, defense: 78, pace: 75, stamina: 88, overall: 86, basePrice: 12 },
  { id: 'p-mid-17', name: 'Hakan Çalhanoğlu', position: 'MID', attack: 84, defense: 74, pace: 72, stamina: 86, overall: 86, basePrice: 12 },
  { id: 'p-mid-18', name: 'Cole Palmer', position: 'MID', attack: 86, defense: 55, pace: 81, stamina: 84, overall: 86, basePrice: 12 },
  { id: 'p-mid-19', name: 'Pedri', position: 'MID', attack: 81, defense: 69, pace: 79, stamina: 83, overall: 86, basePrice: 12 },
  { id: 'p-mid-20', name: 'Gavi', position: 'MID', attack: 76, defense: 76, pace: 79, stamina: 90, overall: 84, basePrice: 10 },
  { id: 'p-mid-21', name: 'İlkay Gündoğan', position: 'MID', attack: 82, defense: 72, pace: 70, stamina: 82, overall: 85, basePrice: 10 },
  { id: 'p-mid-22', name: 'Luka Modrić', position: 'MID', attack: 81, defense: 68, pace: 68, stamina: 78, overall: 85, basePrice: 9 },
  { id: 'p-mid-23', name: 'Dominik Szoboszlai', position: 'MID', attack: 82, defense: 67, pace: 84, stamina: 88, overall: 84, basePrice: 10 },
  { id: 'p-mid-24', name: 'Vitinha', position: 'MID', attack: 80, defense: 74, pace: 79, stamina: 87, overall: 85, basePrice: 10 },
  { id: 'p-mid-25', name: 'Lucas Torreira', position: 'MID', attack: 70, defense: 83, pace: 76, stamina: 91, overall: 83, basePrice: 8 },
  { id: 'p-mid-26', name: 'Fred', position: 'MID', attack: 76, defense: 79, pace: 80, stamina: 89, overall: 82, basePrice: 7 },
  { id: 'p-mid-27', name: 'Sebastian Szymański', position: 'MID', attack: 80, defense: 64, pace: 81, stamina: 88, overall: 82, basePrice: 7 },
  { id: 'p-mid-28', name: 'Gabriel Sara', position: 'MID', attack: 81, defense: 71, pace: 76, stamina: 86, overall: 82, basePrice: 7 },
  { id: 'p-mid-29', name: 'Gedson Fernandes', position: 'MID', attack: 74, defense: 77, pace: 85, stamina: 90, overall: 82, basePrice: 7 },
  { id: 'p-mid-30', name: 'İsmail Yüksek', position: 'MID', attack: 68, defense: 81, pace: 78, stamina: 91, overall: 80, basePrice: 5 },
  { id: 'p-mid-31', name: 'Warren Zaïre-Emery', position: 'MID', attack: 75, defense: 76, pace: 81, stamina: 86, overall: 81, basePrice: 6 },
  { id: 'p-mid-32', name: 'Douglas Luiz', position: 'MID', attack: 79, defense: 77, pace: 74, stamina: 85, overall: 82, basePrice: 7 },
  { id: 'p-mid-33', name: 'Okay Yokuşlu', position: 'MID', attack: 66, defense: 79, pace: 65, stamina: 82, overall: 78, basePrice: 3 },
  { id: 'p-mid-34', name: 'Salih Uçan', position: 'MID', attack: 73, defense: 68, pace: 68, stamina: 79, overall: 76, basePrice: 2 },

  // ===================== FORVETLER (FWD - 24 Oyuncu) =====================
  { id: 'p-fwd-01', name: 'Kylian Mbappé', position: 'FWD', attack: 94, defense: 36, pace: 97, stamina: 88, overall: 92, basePrice: 21 },
  { id: 'p-fwd-02', name: 'Erling Haaland', position: 'FWD', attack: 94, defense: 42, pace: 89, stamina: 86, overall: 91, basePrice: 20 },
  { id: 'p-fwd-03', name: 'Vinícius Júnior', position: 'FWD', attack: 91, defense: 32, pace: 96, stamina: 86, overall: 90, basePrice: 18 },
  { id: 'p-fwd-04', name: 'Harry Kane', position: 'FWD', attack: 92, defense: 45, pace: 68, stamina: 83, overall: 90, basePrice: 17 },
  { id: 'p-fwd-05', name: 'Mohamed Salah', position: 'FWD', attack: 90, defense: 44, pace: 88, stamina: 86, overall: 89, basePrice: 16 },
  { id: 'p-fwd-06', name: 'Bukayo Saka', position: 'FWD', attack: 87, defense: 55, pace: 86, stamina: 88, overall: 88, basePrice: 15 },
  { id: 'p-fwd-07', name: 'Lautaro Martínez', position: 'FWD', attack: 89, defense: 48, pace: 82, stamina: 86, overall: 88, basePrice: 15 },
  { id: 'p-fwd-08', name: 'Victor Osimhen', position: 'FWD', attack: 89, defense: 40, pace: 90, stamina: 84, overall: 88, basePrice: 15 },
  { id: 'p-fwd-09', name: 'Robert Lewandowski', position: 'FWD', attack: 90, defense: 38, pace: 72, stamina: 79, overall: 88, basePrice: 14 },
  { id: 'p-fwd-10', name: 'Phil Foden', position: 'FWD', attack: 88, defense: 52, pace: 85, stamina: 84, overall: 88, basePrice: 15 },
  { id: 'p-fwd-11', name: 'Rodrygo', position: 'FWD', attack: 86, defense: 42, pace: 89, stamina: 83, overall: 86, basePrice: 13 },
  { id: 'p-fwd-12', name: 'Son Heung-min', position: 'FWD', attack: 88, defense: 40, pace: 86, stamina: 84, overall: 87, basePrice: 13 },
  { id: 'p-fwd-13', name: 'Rafael Leão', position: 'FWD', attack: 86, defense: 30, pace: 93, stamina: 80, overall: 86, basePrice: 12 },
  { id: 'p-fwd-14', name: 'Khvicha Kvaratskhelia', position: 'FWD', attack: 85, defense: 40, pace: 85, stamina: 82, overall: 85, basePrice: 11 },
  { id: 'p-fwd-15', name: 'Antoine Griezmann', position: 'FWD', attack: 86, defense: 62, pace: 78, stamina: 86, overall: 87, basePrice: 13 },
  { id: 'p-fwd-16', name: 'Julián Álvarez', position: 'FWD', attack: 85, defense: 50, pace: 84, stamina: 88, overall: 85, basePrice: 11 },
  { id: 'p-fwd-17', name: 'Alexander Isak', position: 'FWD', attack: 85, defense: 34, pace: 89, stamina: 80, overall: 85, basePrice: 11 },
  { id: 'p-fwd-18', name: 'Mauro Icardi', position: 'FWD', attack: 84, defense: 34, pace: 75, stamina: 78, overall: 83, basePrice: 8 },
  { id: 'p-fwd-19', name: 'Edin Džeko', position: 'FWD', attack: 82, defense: 38, pace: 64, stamina: 74, overall: 82, basePrice: 6 },
  { id: 'p-fwd-20', name: 'Ciro Immobile', position: 'FWD', attack: 83, defense: 35, pace: 77, stamina: 76, overall: 82, basePrice: 6 },
  { id: 'p-fwd-21', name: 'Barış Alper Yılmaz', position: 'FWD', attack: 81, defense: 58, pace: 90, stamina: 92, overall: 82, basePrice: 7 },
  { id: 'p-fwd-22', name: 'Kenan Yıldız', position: 'FWD', attack: 80, defense: 38, pace: 84, stamina: 82, overall: 81, basePrice: 6 },
  { id: 'p-fwd-23', name: 'Semih Kılıçsoy', position: 'FWD', attack: 79, defense: 36, pace: 82, stamina: 80, overall: 79, basePrice: 5 },
  { id: 'p-fwd-24', name: 'Youssef En-Nesyri', position: 'FWD', attack: 80, defense: 36, pace: 81, stamina: 82, overall: 80, basePrice: 5 }
];

export function generateAndSave() {
  const targetPath = path.resolve(__dirname, '../../data/players.json');
  const payload = {
    _comment: `Football Auction League oyuncu veri seti (${PLAYERS.length} oyuncu: 16 GK, 34 DEF, 34 MID, 24 FWD).`,
    players: PLAYERS
  };

  fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`[players.json] Başarıyla üretildi: ${targetPath}`);
  console.log(`Toplam Oyuncu: ${PLAYERS.length}`);
  
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of PLAYERS) {
    counts[p.position]++;
  }
  console.log(`Mevki Dağılımı:`, counts);
}

// Doğrudan çalıştırıldığında kaydet
generateAndSave();
