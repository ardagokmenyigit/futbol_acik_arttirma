import type { Position } from '@fal/shared';

interface Props {
  position: Position;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const POSITION_CONFIG = {
  GK: {
    label: 'Kaleci',
    short: 'GK',
    className: 'pos-gk',
  },
  DEF: {
    label: 'Defans',
    short: 'DEF',
    className: 'pos-def',
  },
  MID: {
    label: 'Orta Saha',
    short: 'MID',
    className: 'pos-mid',
  },
  FWD: {
    label: 'Forvet',
    short: 'FWD',
    className: 'pos-fwd',
  },
};

function PositionIcon({ position, size }: { position: Position; size: number }) {
  if (position === 'GK') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18" />
        <path d="M3 15h18" />
        <path d="M8 4v16" />
        <path d="M13 4v16" />
        <path d="M18 4v16" />
      </svg>
    );
  }
  if (position === 'DEF') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    );
  }
  if (position === 'MID') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <circle cx="12" cy="12" r="3.5" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function PositionBadge({ position, size = 'md', showLabel = false }: Props) {
  const conf = POSITION_CONFIG[position];
  const iconSize = size === 'sm' ? 10 : size === 'lg' ? 14 : 12;

  return (
    <span
      className={`position-chip ${conf.className} size-${size}`}
      title={`${conf.label} (${position})`}
    >
      <PositionIcon position={position} size={iconSize} />
      <span>{showLabel ? `${conf.short} · ${conf.label}` : conf.short}</span>
    </span>
  );
}
