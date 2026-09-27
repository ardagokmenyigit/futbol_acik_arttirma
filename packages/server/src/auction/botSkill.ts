import type { BotDifficulty, RoomConfig, TournamentSize } from '@fal/shared';

/**
 * BOT ZORLUĞU — botun "hata" kolları (`RoomConfig.botDifficulty`).
 *
 *  - `freeLevelQuantile`: bot, mevkide "nasılsa bedavaya kalacak" seviyeyi
 *    sıradanların bu yüzdeliği sayar (`estimatePool`). Zor bot medyanı sayar
 *    ve yalnız ortalamanın üstüne para verir; düştükçe bot sıradan
 *    futbolcuya para basar, yıldıza az kalır.
 *  - `noise`: aynı (bot, futbolcu) çiftinin değerlemesindeki kişisel sapma
 *    (±). Büyüdükçe bot bazen ucuza bırakır, bazen fazla öder.
 *  - `earlyOverpay`: draft başında fazla öder, sonda parası azalır.
 *  - `usesPasses`: pas hakkını kullanır mı (pas demeyen bot −1.5 güç).
 *  - `underbid`: erken bırakma — bazı futbolculara %0–(underbid×100) daha
 *    az değer biçer, insan ucuza kapar.
 *
 * TAKIM SAYISINA GÖRE AYRI: aynı kol 2 takımda (tek bot) neredeyse etkisiz,
 * 8 takımda (yedi bot birden hata yapar) çok güçlü. Hedef, her boyutta
 * "en iyi basit insan planının" (sezgisel / yalnız yıldız, `measureBotIQ.ts`)
 * adil paya oranı: zor ~0.85–1.1x, normal ~1.1–1.25x, kolay ~1.3–1.6x.
 * Ölçüm: CLAUDE.md → BOT ZORLUĞU.
 */
export interface BotSkill {
  freeLevelQuantile: number;
  noise: number;
  /** Draft başında fazla ödeme: tavan × (1 + earlyOverpay × kalan draft oranı). */
  earlyOverpay: number;
  usesPasses: boolean;
  underbid: number;
}

const HARD: BotSkill = {
  freeLevelQuantile: 0.5,
  noise: 0.07,
  earlyOverpay: 0,
  usesPasses: true,
  underbid: 0,
};

export const BOT_SKILL: Record<BotDifficulty, Record<TournamentSize, BotSkill>> = {
  easy: {
    2: {
      freeLevelQuantile: 0.2,
      noise: 0.15,
      earlyOverpay: 0.15,
      usesPasses: false,
      underbid: 0.5,
    },
    4: { freeLevelQuantile: 0.2, noise: 0.15, earlyOverpay: 0.15, usesPasses: false, underbid: 0 },
    8: { freeLevelQuantile: 0.25, noise: 0.15, earlyOverpay: 0.1, usesPasses: true, underbid: 0 },
  },
  normal: {
    2: { freeLevelQuantile: 0.2, noise: 0.15, earlyOverpay: 0.15, usesPasses: true, underbid: 0.3 },
    4: { freeLevelQuantile: 0.2, noise: 0.15, earlyOverpay: 0.15, usesPasses: true, underbid: 0 },
    8: { freeLevelQuantile: 0.4, noise: 0.1, earlyOverpay: 0, usesPasses: true, underbid: 0 },
  },
  hard: { 2: HARD, 4: HARD, 8: HARD },
};

export function botSkill(config: Pick<RoomConfig, 'botDifficulty' | 'tournamentSize'>): BotSkill {
  const bySize = BOT_SKILL[config.botDifficulty] ?? BOT_SKILL.normal;
  return bySize[config.tournamentSize] ?? bySize[4];
}
