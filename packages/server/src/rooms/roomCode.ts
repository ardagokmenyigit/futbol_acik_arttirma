import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@fal/shared';

/** Alfabeden rastgele bir oda kodu üretir (benzersizlik kontrolü çağırana ait). */
export function generateRoomCode(length = ROOM_CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * `isTaken` false dönene kadar yeni kod üretir. Alan çok dolmadıkça
 * ilk denemede biter; teorik sonsuz döngüye karşı üst sınır var.
 */
export function generateUniqueRoomCode(isTaken: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = generateRoomCode();
    if (!isTaken(code)) return code;
  }
  throw new Error('Benzersiz oda kodu üretilemedi');
}
