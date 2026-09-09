import type { Participant, Position, RoomState } from '@fal/shared';
import { PositionBadge } from './PositionBadge.js';
import { useRoomStore } from '../store.js';

interface Props {
  room: RoomState;
  isPreSimulation?: boolean;
  onStartImmediately?: () => void;
}

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];

export function SquadsOverview({ room, isPreSimulation = false, onStartImmediately }: Props) {
  const youId = useRoomStore((s) => s.youId);
  const isHost = room.hostId === youId;

  return (
    <div className="stack" style={{ marginBottom: 20 }}>
      {isPreSimulation && (
        <div className="panel gold">
          <div className="round-label" style={{ color: 'var(--chalk-faint)' }}>
            Açık Artırma Tamamlandı
          </div>
          <h2 style={{ fontSize: 24, margin: '6px 0 10px' }}>Kadroları İnceleme Aşaması</h2>
          <p style={{ margin: '0 0 14px', fontSize: 14.5, color: 'var(--chalk)' }}>
            Tüm takımlar kadrolarını kurdu! Simülasyon başlamadan önce rakip kadroları
            inceleyebilirsiniz.
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
                  ⚽ Maçları Hemen Başlat
                </button>
              )}
              <span className="footnote" style={{ margin: 0 }}>
                (veya 15 saniyelik sürenin dolmasını bekleyin)
              </span>
            </div>
          ) : (
            <p className="footnote" style={{ margin: 0 }}>
              Oda kurucusu maçları başlatabilir ya da 15 saniye içinde simülasyon otomatik başlar…
            </p>
          )}
        </div>
      )}

      <div className="panel">
        <div className="section-label">Takım Kadroları ({room.participants.length} Takım)</div>
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
  const squad = participant.squad;
  const count = squad.length;

  const genAvg = count > 0 ? Math.round(squad.reduce((s, x) => s + x.overall, 0) / count) : 0;
  const attAvg = count > 0 ? Math.round(squad.reduce((s, x) => s + x.attack, 0) / count) : 0;
  const defAvg = count > 0 ? Math.round(squad.reduce((s, x) => s + x.defense, 0) / count) : 0;

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
          {isYou && <span className="tag host">Sen</span>}
          {isHost && !isYou && <span className="tag host">Kurucu</span>}
          {participant.isBot && <span className="tag bot">bot</span>}
        </div>
        <span className="mono" style={{ fontSize: 13, color: 'var(--chalk-faint)' }}>
          {count}/{squadSize} oyuncu
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
          <span>
            GEN Ort: <strong style={{ color: 'var(--gold-bright)' }}>{genAvg}</strong>
          </span>
          <span>·</span>
          <span>
            HÜC: <strong style={{ color: 'var(--chalk)' }}>{attAvg}</strong>
          </span>
          <span>·</span>
          <span>
            DEF: <strong style={{ color: 'var(--chalk)' }}>{defAvg}</strong>
          </span>
        </div>
      )}

      {/* Mevkilere Göre Gruplanmış Kadro Listesi */}
      {count === 0 ? (
        <p className="footnote" style={{ margin: '4px 0' }}>
          Bu takımda henüz oyuncu yok.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {POSITIONS.map((pos) => {
            const posPlayers = squad.filter((pl) => pl.position === pos);
            const quota = squadConfig?.[pos];

            return (
              <div key={pos} className={`position-group-block pos-block-${pos.toLowerCase()}`}>
                <div className="position-group-header">
                  <PositionBadge position={pos} size="sm" showLabel />
                  <span className="position-group-count">
                    {posPlayers.length}
                    {quota !== undefined ? `/${quota} Oyuncu` : ' Oyuncu'}
                  </span>
                </div>

                {posPlayers.length === 0 ? (
                  <div className="squad-empty-slot">Bu mevkide oyuncu yok</div>
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
                          <span className="stat-tag gen">GEN {pl.overall}</span>
                          <span className="sep">|</span>
                          <span className="stat-tag">HÜC {pl.attack}</span>
                          <span className="sep">|</span>
                          <span className="stat-tag">DEF {pl.defense}</span>
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
