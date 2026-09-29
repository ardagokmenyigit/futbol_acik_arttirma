/**
 * SUNUCU MESAJ ÇEVİRİSİ KONTROLÜ — kullanıcıya giden her Türkçe sunucu
 * mesajının `i18n.ts` tablosunda İngilizcesi var mı?
 *
 * Kaynak kodu tarar: `error: '…'`, `RoomError('…')`, `reason: '…'`,
 * `message: '…'` kalıplarındaki metinler (şablonlarda `${…}` örnek değerle
 * doldurulur) `hasTranslation` ile sınanır. Eksik varsa listeler ve 1 ile
 * çıkar.
 *
 * Kullanım: npx tsx packages/server/src/scripts/checkServerI18n.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { hasTranslation, localize } from '../i18n.js';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = [/players\.json/, /GitHub/, /maç logu/];

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'scripts') yield* files(p);
    } else if (p.endsWith('.ts')) yield p;
  }
}

const re = /(?:error: |RoomError\(|reason: |message: )(['`])((?:(?!\1).)+)\1/g;
const sample = (tpl: string) =>
  tpl.replace(/\$\{([^}]+)\}/g, (_m, expr: string) =>
    /position/.test(expr) ? 'DEF' : /code/.test(expr) ? 'ABC123' : '4',
  );

const missing: string[] = [];
let checked = 0;
for (const f of files(ROOT)) {
  if (f.endsWith('i18n.ts')) continue;
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(re)) {
    const msg = m[1] === '`' ? sample(m[2]!) : m[2]!;
    if (SKIP.some((s) => s.test(msg))) continue;
    if (!/[a-zçğıöşü]/i.test(msg)) continue;
    checked++;
    if (!hasTranslation(msg)) missing.push(`${f.replace(ROOT, '')}: ${msg}`);
  }
}
console.log(`${checked} mesaj tarandı · örnek: "${localize('Oda dolu (en fazla 8 kişi)', 'en')}"`);
if (missing.length) {
  console.log(`EKSİK ÇEVİRİ (${missing.length}):\n  ` + missing.join('\n  '));
  process.exit(1);
}
console.log('tüm sunucu mesajlarının İngilizcesi var');
