import {
  calculateTeamPower,
  calculateTeamStats,
  type Participant,
  type Position,
  type RoomState,
} from '@fal/shared';
import { PositionBadge } from './PositionBadge.js';
import { useT } from '../i18n/index.js';
import { roleLabel } from '../i18n/labels.js';
import { useRoomStore } from '../store.js';

interface Props {
  room: RoomState;
  isPreSimulation?: boolean;
  onStartImmediately?: () => void;
}

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];

/** Kadro inceleme süresi — sunucudaki otomatik başlatma ile aynı. */
const REVIEW_SEC = 15;

export function SquadsOverview({ room, isPreSimulation = false, onStartImmediately }: Props) {
  const t = useT();
  const youId = useRoomStore((s) => s.youId);
  const isHost = room.hostId === youId;

  return (
    <div className="stack" style={{ marginBottom: 20 }}>
      {isPreSimulation && (
        <div className="panel gold">
          <div className="round-label" style={{ color: 'var(--chalk-faint)' }}>
            {t.squads.auctionDone}
          </div>
          <h2 style={{ fontSize: 24, margin: '6px 0 10px' }}>{t.squads.reviewTitle}</h2>
          <p style={{ margin: '0 0 14px', fontSize: 14.5, color: 'var(--chalk)' }}>
            {t.squads.reviewText}
          </p>
          {isHost ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {onStartImmediately && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onStartImmediately}
                  style={{ padding: '8px 18px', fontSize: 14 }}
                >
                  {t.squads.startNow}
                </button>
              )}
              <span className="footnote" style={{ margin: 0 }}>
                {t.squads.orWait(REVIEW_SEC)}
              </span>
            </div>
          ) : (
            <p className="footnote" style={{ margin: 0 }}>
              {t.squads.hostWillStart(REVIEW_SEC)}
            </p>
          )}
        </div>
      )}

      <div className="panel">
        <div className="section-label">{t.squads.teamSquads(room.participants.length)}</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 16,
            marginTop: 12,
          }}
        >
          {room.participants.map((p) => (
            <TeamSquadCard
              key={p.id}
              participant={p}
              isYou={p.id === youId}
              isHost={p.id === room.hostId}
              squadSize={room.config.squadSize}
              squadConfig={room.config.squad}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface TeamSquadCardProps {
  participant: Participant;
  isYou: boolean;
  isHost: boolean;
  squadSize: number;
  squadConfig?: Record<Position, number>;
}

function TeamSquadCard({ participant, isYou, isHost, squadSize, squadConfig }: TeamSquadCardProps) {
  const t = useT();
  const squad = participant.squad;
  const count = squad.length;

  const genAvg = count > 0 ? Math.round(squad.reduce((s, x) => s + x.overall, 0) / count) : 0;
  const teamStats = calculateTeamStats(squad);
  const teamPower = calculateTeamPower(squad);

  return (
    <div
      style={{
        background: 'var(--panel-raised)',
        border: isYou ? '1px solid var(--gold)' : '1px solid var(--hairline)',
        borderRadius: 6,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Takım Başlığı */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--hairline)',
          paddingBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className={`dot ${participant.connected ? '' : 'off'}`} />
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--chalk)' }}>
            {participant.nickname}
          </span>
          {isYou && <span className="tag host">{t.common.youCap}</span>}
          {isHost && !isYou && <span className="tag host">{t.common.founder}</span>}
          {participant.isBot && <span className="tag bot">{t.common.bot}</span>}
        </div>
        <span className="mono" style={{ fontSize: 13, color: 'var(--chalk-faint)' }}>
          {t.squads.playersOf(count, squadSize)}
        </span>
      </div>

      {/* Ortalama Güç Özeti */}
      {count > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            fontSize: 12,
            fontFamily: 'var(--font-cond)',
            color: 'var(--chalk-dim)',
            padding: '5px 10px',
            background: 'var(--turf)',
            borderRadius: 4,
          }}
        >
          {/* Maçı belirleyen sayı GÜÇ'tür; GEN yalnızca bilgi amaçlı. */}
          <span title={t.squads.powerTitle}>
            {t.common.powerCaps}:{' '}
            <strong style={{ color: 'var(--gold-bright)', fontSize: 15 }}>{teamPower}</strong>
          </span>
          <span>·</span>
          <span>
            {t.common.att}: <strong style={{ color: 'var(--chalk)' }}>{teamStats.attack}</strong>
          </span>
          <span>·</span>
          <span>
            {t.common.def}: <strong style={{ color: 'var(--chalk)' }}>{teamStats.defense}</strong>
          </span>
          <span style={{ color: 'var(--chalk-faint)', opacity: 0.7 }} title={t.squads.avgTitle}>
            {t.squads.avg(genAvg)}
          </span>
        </div>
      )}

      {/* Mevkilere Göre Gruplanmış Kadro Listesi */}
      {count === 0 ? (
        <p className="footnote" style={{ margin: '4px 0' }}>
          {t.squads.noPlayers}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {POSITIONS.map((pos) => {
            const posPlayers = squad.filter((pl) => pl.position === pos);
            const quota = squadConfig?.[pos];

            return (
              <div key={pos} className={`position-group-block pos-block-${pos.toLowerCase()}`}>
                <div className="position-group-header">
                  <PositionBadge position={pos} size="sm" />
                  <span className="position-group-count">
                    {t.common.playersCount(posPlayers.length, quota)}
                  </span>
                </div>

                {posPlayers.length === 0 ? (
                  <div className="squad-empty-slot">{t.squads.noPlayersAtPos}</div>
                ) : (
                  <div className="squad-player-list" style={{ marginTop: 2, gap: 5 }}>
                    {posPlayers.map((pl) => (
                      <div
                        key={pl.id}
                        className="squad-player-item"
                        style={{ padding: '6px 10px', fontSize: 13.5 }}
                      >
                        <div className="squad-player-info" style={{ gap: 8 }}>
                          <span className="squad-player-name" style={{ fontSize: 13.5 }}>
                            {pl.name}
                          </span>
                        </div>
                        <div className="squad-player-stats" style={{ gap: 6, fontSize: 11.5 }}>
                          <span className="stat-tag gen">
                            {t.common.ovr} {pl.overall}
                          </span>
                          <span className="sep">|</span>
                          <span className="stat-tag">{roleLabel(pl.position, t)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
