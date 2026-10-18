import type { MatchReason, MatchResult } from '@fal/shared';
import { useFormatPower, useT, type Dict } from '../i18n/index.js';

interface Props {
  result: MatchResult;
  nameOf: (id: string | null) => string;
  /** Kart başlığının yanında maçın turu ("Yarı Final"). */
  roundTitle?: string;
  showHint?: boolean;
}

/**
 * MAÇ RAPORU — "neden bu sonuç?" Sunucunun `result.explanation`ı (bkz.
 * shared/simulation/explain.ts) ve `result.stats`ten metin üretir; burada
 * hiçbir şey hesaplanmaz. Güçlü takım kaybettiğinde oyuncu sonucu "oyun
 * rastgele" diye değil, futbolun bir sebebi olarak okusun diye.
 */
export function MatchReport({ result, nameOf, roundTitle, showHint }: Props) {
  const t = useT();
  const fp = useFormatPower();
  const ex = result.explanation;
  const stats = result.stats;
  if (!ex || !stats) return null;

  const fav = nameOf(ex.favoriteId);
  const gap = fp(ex.powerGap);
  const verdict =
    ex.verdict === 'even'
      ? t.report.even(gap)
      : ex.verdict === 'upset'
        ? t.report.upset(fav, gap)
        : t.report.expected(fav, gap);

  const pen =
    result.penaltiesHome != null
      ? ` (${t.tournament.penalties(result.penaltiesHome, result.penaltiesAway ?? 0)})`
      : '';

  return (
    <div className={`panel match-report${ex.verdict === 'upset' ? ' upset' : ''}`}>
      <div className="section-label">
        {t.report.title}
        {roundTitle ? ` · ${roundTitle}` : ''}
      </div>
      <div className="mr-score">
        <span>{nameOf(result.homeId)}</span>
        <strong>
          {result.scoreHome}–{result.scoreAway}
        </strong>
        <span>{nameOf(result.awayId)}</span>
      </div>
      {pen && <div className="mr-pen">{pen.trim()}</div>}

      <p className="mr-verdict">{verdict}</p>
      <ul className="mr-reasons">
        {ex.reasons
          .map((r) => reasonText(t, r, nameOf(r.teamId), fp))
          .filter(Boolean)
          .map((text, i) => (
            <li key={i}>{text}</li>
          ))}
      </ul>

      <table className="mr-stats">
        <tbody>
          <tr>
            <td>{stats.home.chances}</td>
            <th>{t.report.chances}</th>
            <td>{stats.away.chances}</td>
          </tr>
          <tr>
            <td>{fp(stats.home.xg)}</td>
            <th>{t.report.xg}</th>
            <td>{fp(stats.away.xg)}</td>
          </tr>
          <tr>
            <td>{t.report.pct(formPct(stats.home.form))}</td>
            <th>{t.report.form}</th>
            <td>{t.report.pct(formPct(stats.away.form))}</td>
          </tr>
        </tbody>
      </table>
      {showHint && <p className="footnote mr-hint">{t.report.hint}</p>}
    </div>
  );
}

const formPct = (form: number) => Math.round((form - 1) * 100);

function reasonText(t: Dict, r: MatchReason, s: string, fp: (v: number) => string): string {
  const n = (v: number | undefined) => fp(v ?? 0);
  switch (r.code) {
    case 'penalties':
      return t.report.penalties(s);
    case 'extraTime':
      return t.report.extraTime(s);
    case 'wasteful':
      return t.report.wasteful(s, n(r.xg), r.goals ?? 0);
    case 'clinical':
      return t.report.clinical(s, n(r.xg), r.goals ?? 0);
    case 'dominated':
      return t.report.dominated(s, r.chances ?? 0, r.oppChances ?? 0);
    case 'form':
      return t.report.formFavoured(s, t.report.pct(r.form ?? 0), t.report.pct(r.oppForm ?? 0));
    case 'comeback':
      return t.report.comeback(s);
    case 'earlyGoal':
      return t.report.earlyGoal(s, r.minute ?? 0);
    case 'openedUp':
      return t.report.openedUp(s, r.goals ?? 0);
    case 'lateWinner':
      return t.report.lateWinner(s, r.minute ?? 0);
    case 'powerShowed':
      return t.report.powerShowed(s, n(r.xg), n(r.oppXg));
    case 'tight':
      return t.report.tight(r.chances ?? 0, r.oppChances ?? 0);
    default:
      // Sunucuya yeni bir kod eklenip istemci güncellenmediyse satır atlanır.
      return '';
  }
}
