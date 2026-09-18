import type { FC } from 'react';
import { PENALTY_DIRECTIONS, type PenaltyDirection, type PenaltyOutcome } from '@fal/shared';

/**
 * 2D PENALTI SAHNESİ — arkadan bakış (atıcının gözünden): kale, file, kollarını
 * açmış kaleci, beyaz noktadaki top. Sol/orta/sağ HER İKİ TARAF İÇİN DE EKRAN
 * YÖNÜDÜR (sunucu da köşeleri bu çerçevede karşılaştırır), yani "SOL" atıcı
 * için sol direk, kaleci için sol dalış — aynı şey.
 *
 * Üç evre:
 *  - bekleme / seçim: kaleci ortada dikilir, top noktada; seçilebilirse kale
 *    ağzındaki üç bölge tıklanır (seçilen altın çerçeveyle vurgulanır).
 *  - açılış (`outcome` dolu): kaleci `keeperDirection`e dalar, top
 *    `shotDirection`e uçar — gol: fileye; kurtarış: kalecinin eldivenine;
 *    dışarı: direk dışına / üstten aut. CSS geçişleriyle (~0.5 sn).
 *
 * Yalnız görsel; hiçbir karar burada verilmez (CLAUDE.md §5).
 */
export interface PenaltySceneProps {
  /** Açıklanan vuruş — null ise seçim/bekleme evresi. */
  reveal: {
    shotDirection: PenaltyDirection;
    keeperDirection: PenaltyDirection;
    outcome: PenaltyOutcome;
  } | null;
  /** Bölgeler tıklanabilir mi (sıradaki vuruşta rolün var). */
  selectable?: boolean;
  /** Kendi seçimin (vurgulanır). */
  selected?: PenaltyDirection | null;
  onSelect?: (direction: PenaltyDirection) => void;
  /** Bölge etiketi: atıcı "vur", kaleci "uzan". */
  role?: 'shooter' | 'keeper' | 'spectator';
}

const LABEL: Record<PenaltyDirection, string> = { left: 'SOL', center: 'ORTA', right: 'SAĞ' };

/** Kale ağzındaki bölgeler (viewBox koordinatları). */
const ZONES: Record<PenaltyDirection, { x: number; w: number }> = {
  left: { x: 76, w: 82 },
  center: { x: 158, w: 84 },
  right: { x: 242, w: 82 },
};

/** Topun varış noktası — noktaya (200,250) göre kayma. */
function ballTarget(dir: PenaltyDirection, outcome: PenaltyOutcome): { x: number; y: number } {
  if (outcome === 'goal') {
    return dir === 'left'
      ? { x: -92, y: -160 }
      : dir === 'right'
        ? { x: 92, y: -160 }
        : { x: 0, y: -172 };
  }
  if (outcome === 'saved') {
    return dir === 'left'
      ? { x: -66, y: -136 }
      : dir === 'right'
        ? { x: 66, y: -136 }
        : { x: 0, y: -118 };
  }
  // dışarı: direk dışı ya da üstten
  return dir === 'left'
    ? { x: -152, y: -186 }
    : dir === 'right'
      ? { x: 152, y: -186 }
      : { x: 0, y: -238 };
}

function keeperTransform(dir: PenaltyDirection | null): string {
  if (dir === 'left') return 'translate(-74px, -30px) rotate(-64deg)';
  if (dir === 'right') return 'translate(74px, -30px) rotate(64deg)';
  if (dir === 'center') return 'translate(0px, -16px)';
  return 'translate(0px, 0px)';
}

export const PenaltyScene: FC<PenaltySceneProps> = ({
  reveal,
  selectable = false,
  selected = null,
  onSelect,
  role = 'spectator',
}) => {
  const target = reveal ? ballTarget(reveal.shotDirection, reveal.outcome) : { x: 0, y: 0 };
  const ballStyle = {
    transform: reveal
      ? `translate(${target.x}px, ${target.y}px) scale(0.72)`
      : 'translate(0px, 0px) scale(1)',
  };
  const keeperStyle = { transform: keeperTransform(reveal?.keeperDirection ?? null) };
  const outcomeClass = reveal ? `is-${reveal.outcome}` : selectable ? 'is-select' : 'is-idle';

  return (
    <div className={`pen-scene ${outcomeClass}`}>
      <svg viewBox="0 0 400 300" role="img" aria-label="Penaltı sahnesi" className="pen-svg">
        <defs>
          <pattern id="pen-net" width="9" height="9" patternUnits="userSpaceOnUse">
            <path d="M0 0H9M0 0V9" stroke="rgba(242,239,230,0.42)" strokeWidth="0.8" />
          </pattern>
          <linearGradient id="pen-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#14382a" />
            <stop offset="1" stopColor="#1d5238" />
          </linearGradient>
          <radialGradient id="pen-vignette" cx="0.5" cy="0.6" r="0.75">
            <stop offset="0.6" stopColor="rgba(0,0,0,0)" />
            <stop offset="1" stopColor="rgba(0,0,0,0.38)" />
          </radialGradient>
        </defs>

        {/* çim: yatay biçim şeritleri */}
        <rect x="0" y="0" width="400" height="300" fill="url(#pen-sky)" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect
            key={i}
            x="0"
            y={i * 50}
            width="400"
            height="50"
            fill={i % 2 === 0 ? '#2b6a44' : '#26603e'}
            opacity={i === 0 ? 0.55 : 1}
          />
        ))}
        {/* ceza sahası çizgileri (tebeşir) */}
        <rect x="0" y="0" width="400" height="300" fill="url(#pen-vignette)" />
        <line x1="0" y1="172" x2="400" y2="172" stroke="rgba(242,239,230,0.55)" strokeWidth="2" />
        <path
          d="M40 172 V214 H360 V172"
          fill="none"
          stroke="rgba(242,239,230,0.35)"
          strokeWidth="1.6"
        />

        {/* kale: file + direkler */}
        <g className="pen-net-group">
          <rect x="76" y="50" width="248" height="122" fill="rgba(5,20,14,0.42)" />
          <rect x="94" y="68" width="212" height="104" fill="rgba(0,0,0,0.16)" />
          <line x1="76" y1="50" x2="94" y2="68" stroke="rgba(242,239,230,0.35)" strokeWidth="1" />
          <line x1="324" y1="50" x2="306" y2="68" stroke="rgba(242,239,230,0.35)" strokeWidth="1" />
          <rect x="76" y="50" width="248" height="122" fill="url(#pen-net)" />
        </g>
        <rect x="70" y="44" width="6" height="128" rx="2" fill="#f2efe6" />
        <rect x="324" y="44" width="6" height="128" rx="2" fill="#f2efe6" />
        <rect x="70" y="44" width="260" height="6" rx="2" fill="#f2efe6" />

        {/* seçim bölgeleri (kale ağzı) */}
        {(selectable || selected) &&
          !reveal &&
          PENALTY_DIRECTIONS.map((dir) => {
            const z = ZONES[dir];
            const isSel = selected === dir;
            return (
              <g
                key={dir}
                className={`pen-zone${isSel ? ' selected' : ''}${selectable ? ' selectable' : ''}`}
                onClick={selectable ? () => onSelect?.(dir) : undefined}
                role={selectable ? 'button' : undefined}
                aria-label={`${LABEL[dir]} ${role === 'keeper' ? 'tarafa uzan' : 'köşeye vur'}`}
              >
                <rect x={z.x + 3} y="54" width={z.w - 6} height="114" rx="8" />
                <text x={z.x + z.w / 2} y="68" textAnchor="middle" className="pen-zone-label">
                  {LABEL[dir]}
                </text>
                {isSel && (
                  <text x={z.x + z.w / 2} y="150" textAnchor="middle" className="pen-zone-mark">
                    {role === 'keeper' ? '🧤' : '🎯'}
                  </text>
                )}
              </g>
            );
          })}

        {/* kaleci — ayaklar kale çizgisinde, kollar açık */}
        <g className="pen-keeper" style={keeperStyle}>
          <g transform="translate(200 172)">
            <ellipse cx="0" cy="2" rx="22" ry="4" fill="rgba(0,0,0,0.28)" />
            {/* bacaklar + çoraplar + krampon */}
            <rect x="-12" y="-24" width="9" height="18" rx="3" fill="#e6c39c" />
            <rect x="3" y="-24" width="9" height="18" rx="3" fill="#e6c39c" />
            <rect x="-13" y="-12" width="11" height="10" rx="2" fill="#b98338" />
            <rect x="2" y="-12" width="11" height="10" rx="2" fill="#b98338" />
            <rect x="-15" y="-4" width="13" height="5" rx="2" fill="#1b1f22" />
            <rect x="2" y="-4" width="13" height="5" rx="2" fill="#1b1f22" />
            {/* şort */}
            <rect x="-14" y="-38" width="28" height="16" rx="3" fill="#1b1f22" />
            {/* gövde (forma) */}
            <rect x="-15" y="-70" width="30" height="34" rx="6" fill="#c9974a" />
            <rect x="-6" y="-70" width="12" height="5" rx="2" fill="#8a5f2a" />
            {/* kollar açık */}
            <path d="M-15 -62 L-44 -52" stroke="#c9974a" strokeWidth="9" strokeLinecap="round" />
            <path d="M15 -62 L44 -52" stroke="#c9974a" strokeWidth="9" strokeLinecap="round" />
            <path d="M-30 -57 L-44 -52" stroke="#e6c39c" strokeWidth="8" strokeLinecap="round" />
            <path d="M30 -57 L44 -52" stroke="#e6c39c" strokeWidth="8" strokeLinecap="round" />
            {/* eldivenler */}
            <circle cx="-48" cy="-51" r="7" fill="#6b4a2b" stroke="#3a2a17" strokeWidth="1" />
            <circle cx="48" cy="-51" r="7" fill="#6b4a2b" stroke="#3a2a17" strokeWidth="1" />
            {/* baş */}
            <circle cx="0" cy="-82" r="11" fill="#e6c39c" />
            <path d="M-11 -84 a11 11 0 0 1 22 0 v-2 a11 8 0 0 0 -22 0z" fill="#2a2523" />
            <circle cx="-4" cy="-82" r="1.3" fill="#2a2523" />
            <circle cx="4" cy="-82" r="1.3" fill="#2a2523" />
            <path d="M-3 -77 q3 2 6 0" stroke="#2a2523" strokeWidth="1" fill="none" />
          </g>
        </g>

        {/* top — beyaz noktada */}
        <ellipse cx="200" cy="262" rx="18" ry="5" fill="rgba(242,239,230,0.55)" />
        <g className="pen-ball" style={ballStyle}>
          <g transform="translate(200 250)">
            <ellipse cx="0" cy="12" rx="12" ry="3.5" fill="rgba(0,0,0,0.3)" />
            <circle cx="0" cy="0" r="12" fill="#f5f2ea" stroke="#22262a" strokeWidth="1" />
            <polygon points="0,-5 4.5,-1.5 3,4 -3,4 -4.5,-1.5" fill="#22262a" />
            <path d="M0 -5 L0 -11" stroke="#22262a" strokeWidth="1.2" />
            <path d="M4.5 -1.5 L10 -3.5" stroke="#22262a" strokeWidth="1.2" />
            <path d="M-4.5 -1.5 L-10 -3.5" stroke="#22262a" strokeWidth="1.2" />
            <path d="M3 4 L7 8.5" stroke="#22262a" strokeWidth="1.2" />
            <path d="M-3 4 L-7 8.5" stroke="#22262a" strokeWidth="1.2" />
            <circle cx="9" cy="-6" r="2.3" fill="#22262a" />
            <circle cx="-9" cy="-6" r="2.3" fill="#22262a" />
            <circle cx="0" cy="10.5" r="2.3" fill="#22262a" />
          </g>
        </g>
      </svg>

      {reveal && (
        <div className={`pen-scene-badge is-${reveal.outcome}`}>
          {reveal.outcome === 'goal'
            ? 'GOL!'
            : reveal.outcome === 'saved'
              ? 'KURTARDI!'
              : 'DIŞARI!'}
        </div>
      )}
    </div>
  );
};
