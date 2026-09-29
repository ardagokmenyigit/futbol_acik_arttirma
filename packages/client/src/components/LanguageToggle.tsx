import { LANGS } from '@fal/shared';
import { useLang, useLangStore, useT } from '../i18n/index.js';

/** Sağ üstteki TR / EN düğmesi. */
export function LanguageToggle() {
  const lang = useLang();
  const setLang = useLangStore((s) => s.setLang);
  const t = useT();
  return (
    <div className="lang-toggle" role="group" aria-label={t.lang.label}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          className={`lang-btn${lang === l ? ' active' : ''}`}
          aria-pressed={lang === l}
          title={lang === l ? undefined : t.lang.switchTo}
          onClick={() => setLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
