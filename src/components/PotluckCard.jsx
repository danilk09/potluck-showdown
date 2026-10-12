import { Link } from 'react-router';
import { AvatarStack } from './Avatar';
import { FsImage } from './ui';
import { PHASE_CHIP, PHASE_LABEL, phaseOf } from '../lib/phase';
import { formatInfo } from '../lib/formats';
import { formatWhen } from '../lib/dates';
import { useAuth } from '../hooks/AuthContext';

export default function PotluckCard({ potluck, now }) {
  const { user } = useAuth();
  const phase = phaseOf(potluck, now);
  const fmt = formatInfo(potluck.format);
  const spots = potluck.maxGuests ? potluck.maxGuests - potluck.memberIds.length : null;
  return (
    <Link to={`/potlucks/${potluck.id}`} className="card-soft potluck-card">
      <div className="cover">
        <FsImage src={potluck.coverImage} alt="" fallback={fmt.emoji} />
      </div>
      <div className="min-w-0 flex-grow-1">
        <div className="d-flex flex-wrap gap-1">
          <span className={`chip ${PHASE_CHIP[phase]}`}>{PHASE_LABEL[phase]}</span>
          {potluck.hostId === user?.uid && <span className="chip chip-peach">Hosting</span>}
        </div>
        <h3 className="text-truncate">{potluck.title}</h3>
        <div className="theme text-truncate">{potluck.theme || fmt.label}</div>
        <div className="meta">
          {formatWhen(potluck.startsAt)}
          {spots != null && ` · ${spots > 0 ? `${spots} spot${spots === 1 ? '' : 's'} left` : 'Full'}`}
        </div>
        <div className="mt-2 d-flex align-items-center gap-2">
          <AvatarStack uids={potluck.memberIds} />
          <span className="small text-muted">{potluck.memberIds.length} going</span>
        </div>
      </div>
    </Link>
  );
}
