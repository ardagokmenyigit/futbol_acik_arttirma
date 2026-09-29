import { create } from 'zustand';
import { DEFAULT_LANG, LANGS, type Lang } from '@fal/shared';
import { en } from './en.js';
import { tr, type Dict } from './tr.js';

export type { Dict };

/**
 * ARAYÜZ DİLİ — seçim tarayıcıda hatırlanır (`fal:lang`). Varsayılan her
 * zaman Türkçe: tarayıcı diline göre otomatik İngilizce AÇILMAZ — Google
 * sayfayı JS sonrası DOM'dan (en-US tarayıcıyla) indeksliyor; otomatik
 * İngilizce, Türkçe aramalar için yapılan SEO içeriğini gizlerdi.
 */
const KEY = 'fal:lang';

const DICTS: Record<Lang, Dict> = { tr, en };

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGS.includes(saved as Lang)) return saved as Lang;
  } catch {
    /* storage kapalı */
  }
  return DEFAULT_LANG;
}

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLangStore = create<LangState>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* storage kapalı — yalnız bu oturum */
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

document.documentElement.lang = useLangStore.getState().lang;

/** Bileşenlerde: güncel dilin sözlüğü (dil değişince yeniden çizer). */
export function useT(): Dict {
  return DICTS[useLangStore((s) => s.lang)];
}

export function useLang(): Lang {
  return useLangStore((s) => s.lang);
}

/** Bileşen dışı kod için anlık dil / sözlük. */
export function currentLang(): Lang {
  return useLangStore.getState().lang;
}

export function getT(): Dict {
  return DICTS[currentLang()];
}
