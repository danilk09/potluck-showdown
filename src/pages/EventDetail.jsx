import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { Button, Dropdown } from 'react-bootstrap';
import { useAuth } from '../hooks/AuthContext';
import { useDishes, useMyRatings, useNow, usePotluck } from '../hooks/useFirestore';
import { useProfiles } from '../hooks/useProfiles';
import { deletePotluck, friendlyError, leavePotluck, openVoting, publishResults, removeGuest } from '../data/api';
import { formatInfo } from '../lib/formats';
import { PHASE_CHIP, PHASE_LABEL, phaseOf } from '../lib/phase';
import { formatDuration, formatWhen } from '../lib/dates';
import { toMillis } from '../lib/scoring';
import Avatar, { AvatarStack } from '../components/Avatar';
import InviteSheet from '../components/InviteSheet';
import { EmptyState, Loading, PageHeader, useConfirm, useToast } from '../components/ui';

const CAT_STYLES = [
  ['🍝', '#ffe6dc'], ['🥗', '#e2f5ea'], ['🥙', '#eee8fd'], ['🍪', '#e3f0fb'], ['🍲', '#fff1cc'], ['🧁', '#fde4ef'],
];

function PhasePanel({ potluck, phase, isHost, dishes, ratedCount, now, onAction, busy }) {
  const closes = toMillis(potluck.votingClosesAt);
  const opens = toMillis(potluck.votingOpensAt);
  const toRate = dishes.length - ratedCount;
  const content = {
    open: {
      title: 'Claiming dishes',
      text: opens ? `Voting opens ${formatWhen(potluck.votingOpensAt)}.` : 'The host opens voting during the event.',
      host: <Button size="sm" onClick={() => onAction('open')} disabled={busy || dishes.length < 2}>Open voting now</Button>,
      hostHint: dishes.length < 2 ? 'Voting can open once at least 2 dishes are in.' : 'Opening voting locks dish edits.',
    },
    voting: {
      title: 'Voting is open',
      text: `${toRate > 0 ? `${toRate} dish${toRate === 1 ? '' : 'es'} left for you to rate` : 'You’ve rated every dish you can'}${closes ? ` · closes in ${formatDuration(closes - now)}` : ''}.`,
      action: <Button as={Link} to={`/feed/${potluck.id}`} size="sm" variant="warning">Rate dishes</Button>,
      host: <Button size="sm" variant="outline-dark" onClick={() => onAction('publish')} disabled={busy}>Close voting &amp; publish</Button>,
    },
    tallying: {
      title: 'Voting has closed',
      text: isHost ? 'Publish the results to crown the winners.' : 'Waiting for the host to publish the results.',
      host: <Button size="sm" onClick={() => onAction('publish')} disabled={busy}>Publish results</Button>,
    },
    closed: {
      title: 'Results are in 🏆',
      text: 'See who took home the top spots.',
      action: <Button as={Link} to={`/potlucks/${potluck.id}/results`} size="sm">See results</Button>,
    },
  }[phase];

  return (
    <div className={`p-3 mb-3 ${phase === 'voting' ? 'tile-gold' : phase === 'closed' ? 'tile-lilac' : 'card-soft'}`}>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <div className="flex-grow-1">
          <div className="fw-bold">{content.title}</div>
          <div className="small text-muted">{content.text}</div>
        </div>
        {content.action}
      </div>
      {isHost && content.host && (
        <div className="d-flex align-items-center gap-2 flex-wrap border-top mt-2 pt-2">
          <span className="small fw-semibold flex-grow-1"><i className="bi bi-person-badge me-1" />Host controls{content.hostHint && <span className="d-block fw-normal text-muted">{content.hostHint}</span>}</span>
          {content.host}
        </div>
      )}
    </div>
  );
}

export default function EventDetail() {
  const { pid } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const now = useNow(15_000);
  const [confirmEl, confirm] = useConfirm();
  const [busy, setBusy] = useState(false);
  const { data: potluck, loading } = usePotluck(pid);
  const isMember = Boolean(potluck?.memberIds.includes(user.uid));
  const { data: dishes } = useDishes(pid, isMember);
  const { ratings } = useMyRatings(pid, isMember);
  const lookup = useProfiles([...(potluck?.memberIds ?? []), ...dishes.map((d) => d.authorId)]);

  if (loading) return <Loading />;
  if (!potluck) return <div className="page"><PageHeader title="Event details" /><EmptyState title="This potluck doesn’t exist anymore" emoji="🫙" /></div>;
  if (!isMember) return <Navigate to={`/join/${potluck.inviteCode}`} replace />;

  const isHost = potluck.hostId === user.uid;
  const phase = phaseOf(potluck, now);
  const fmt = formatInfo(potluck.format);
  const myDish = dishes.find((d) => d.authorId === user.uid);
  const needed = potluck.dishCategories.reduce((s, c) => s + c.needed, 0);
  const claimed = potluck.dishCategories.reduce((s, c) => s + Math.min(c.needed, dishes.filter((d) => d.categoryId === c.id).length), 0);
  const othersDishes = dishes.filter((d) => d.authorId !== user.uid);
  const ratedCount = othersDishes.filter((d) => ratings.has(d.id)).length;

  const run = async (fn, success) => {
    setBusy(true);
    try {
      await fn();
      if (success) toast(success);
      return true;
    } catch (err) {
      toast(friendlyError(err), 'danger');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onAction = async (kind) => {
    if (kind === 'open') {
      if (await confirm({ title: 'Open voting now?', body: 'Guests can start rating dishes, and dishes can no longer be added or edited.', confirmLabel: 'Open voting' })) {
        run(() => openVoting(potluck), 'Voting is open!');
      }
    } else if (kind === 'publish') {
      if (await confirm({ title: 'Publish the results?', body: 'Voting closes for everyone and the leaderboard becomes final.', confirmLabel: 'Publish results' })) {
        if (await run(() => publishResults(potluck))) navigate(`/potlucks/${pid}/results`);
      }
    }
  };

  const onDelete = async () => {
    if (await confirm({ title: 'Delete this potluck?', body: 'All dishes and recipes in it will be removed for everyone.', confirmLabel: 'Delete', danger: true })) {
      if (await run(() => deletePotluck(potluck), 'Potluck deleted')) navigate('/events', { replace: true });
    }
  };

  const onLeave = async () => {
    if (await confirm({ title: 'Leave this potluck?', body: myDish ? 'Your dish will be removed too.' : undefined, confirmLabel: 'Leave', danger: true })) {
      if (await run(() => leavePotluck(pid), 'You left the potluck')) navigate('/', { replace: true });
    }
  };

  const onRemoveGuest = async (uid) => {
    const name = lookup(uid)?.displayName ?? 'this guest';
    if (await confirm({ title: `Remove ${name}?`, body: 'They will lose access to this potluck and its recipes.', confirmLabel: 'Remove', danger: true })) {
      run(() => removeGuest(pid, uid), `${name} was removed`);
    }
  };

  const cta = (() => {
    if (phase === 'open') {
      return myDish
        ? <Button as={Link} to={`/potlucks/${pid}/dish`} size="lg" variant="outline-primary" className="w-100 bg-white"><i className="bi bi-pencil me-2" />Edit your dish</Button>
        : <Button as={Link} to={`/potlucks/${pid}/dish`} size="lg" className="w-100 shadow"><i className="bi bi-plus-lg me-2" />Submit Dish</Button>;
    }
    if (phase === 'voting') return <Button as={Link} to={`/feed/${pid}`} size="lg" className="w-100 shadow"><i className="bi bi-star me-2" />Rate dishes</Button>;
    if (phase === 'closed') return <Button as={Link} to={`/potlucks/${pid}/results`} size="lg" className="w-100 shadow"><i className="bi bi-trophy me-2" />See results</Button>;
    return null;
  })();

  return (
    <div className="page">
      {confirmEl}
      <InviteSheet potluck={potluck} show={params.has('invite')} justCreated={params.get('invite') === 'new'} onHide={() => setParams({}, { replace: true })} />
      <PageHeader
        title="Event details"
        backTo="/events"
        actions={(
          <Dropdown align="end">
            <Dropdown.Toggle variant="link" className="text-primary fs-4 p-1 no-caret" aria-label="More options"><i className="bi bi-three-dots" /></Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Item onClick={() => setParams({ invite: '1' })}><i className="bi bi-share me-2" />Invite people</Dropdown.Item>
              <Dropdown.Item as={Link} to={`/feed/${pid}`}><i className="bi bi-image me-2" />Open food feed</Dropdown.Item>
              {isHost && phase !== 'closed' && <Dropdown.Item as={Link} to={`/potlucks/${pid}/edit`}><i className="bi bi-pencil me-2" />Edit details</Dropdown.Item>}
              {isHost && phase !== 'closed' && <Dropdown.Item className="text-danger" onClick={onDelete}><i className="bi bi-trash3 me-2" />Delete potluck</Dropdown.Item>}
              {!isHost && phase === 'open' && <Dropdown.Item className="text-danger" onClick={onLeave}><i className="bi bi-box-arrow-left me-2" />Leave potluck</Dropdown.Item>}
            </Dropdown.Menu>
          </Dropdown>
        )}
      />

      <div className="hero-card mb-3">
        <div className="d-flex gap-2 flex-wrap mb-2">
          <span className="chip">{fmt.emoji} {fmt.label}</span>
          <span className={`chip ${PHASE_CHIP[phase]}`}>{PHASE_LABEL[phase]}</span>
        </div>
        {potluck.theme && <div className="hero-sub">{potluck.theme}</div>}
        <h2 className="fw-800 mb-1">{potluck.title}</h2>
        <div className="fw-semibold">{formatWhen(potluck.startsAt)}</div>
        {potluck.location && <div><i className="bi bi-geo-alt me-1" />{potluck.location}</div>}
        <div className="d-flex align-items-center justify-content-between mt-3">
          <AvatarStack uids={potluck.memberIds} max={4} />
          <button type="button" className="btn btn-sm btn-light fw-bold" onClick={() => setParams({ invite: '1' })}>
            <i className="bi bi-person-plus me-1" />{potluck.memberIds.length} attending
          </button>
        </div>
      </div>

      <PhasePanel potluck={potluck} phase={phase} isHost={isHost} dishes={othersDishes} ratedCount={ratedCount} now={now} onAction={onAction} busy={busy} />

      {(potluck.formatDetail || potluck.description) && (
        <div className="card-soft p-3 mb-3">
          {potluck.formatDetail && <div className="mb-1"><strong>{fmt.detailLabel}:</strong> {potluck.formatDetail}</div>}
          {potluck.description && <div className="text-muted">{potluck.description}</div>}
        </div>
      )}

      <h3 className="h5 fw-bold mb-0">{potluck.format === 'courses' ? 'Course brackets' : 'Dish lineup'}</h3>
      <div className="small text-muted mb-2">{claimed} of {needed} dishes claimed{needed > claimed ? ` · ${needed - claimed} still needed` : ' · all set!'}</div>
      <div className="d-grid gap-2 mb-4">
        {potluck.dishCategories.map((cat, i) => {
          const inCat = dishes.filter((d) => d.categoryId === cat.id);
          const missing = cat.needed - inCat.length;
          const [emoji, bg] = CAT_STYLES[i % CAT_STYLES.length];
          return (
            <div key={cat.id} className={`category-row ${missing > 0 && phase === 'open' ? 'needs' : ''}`}>
              <span className="cat-icon" style={{ background: bg }} aria-hidden>{emoji}</span>
              <div className="flex-grow-1 min-w-0">
                <div className="fw-bold">{cat.name}</div>
                {inCat.length > 0 && (
                  <div className="small text-muted text-truncate">
                    {inCat.map((d, j) => (
                      <span key={d.id}>
                        {j > 0 && ', '}
                        <Link to={`/potlucks/${pid}/dishes/${d.id}`} className="text-muted">{lookup(d.authorId)?.displayName?.split(' ')[0] ?? '…'} · {d.name}</Link>
                      </span>
                    ))}
                  </div>
                )}
                {missing > 0 && <div className="small text-danger">Still needs {missing} contribution{missing === 1 ? '' : 's'}</div>}
              </div>
              <span className="small text-muted text-nowrap">{inCat.length} claimed</span>
            </div>
          );
        })}
      </div>

      <h3 className="h5 fw-bold mb-2">Guests ({potluck.memberIds.length})</h3>
      <div className="card-soft p-2 mb-4">
        {potluck.memberIds.map((uid) => (
          <div key={uid} className="d-flex align-items-center gap-2 p-2">
            <Avatar uid={uid} profile={lookup(uid)} size={36} />
            <span className="flex-grow-1 text-truncate">
              {lookup(uid)?.displayName ?? '…'}
              {uid === potluck.hostId && <span className="chip chip-peach ms-2">Host</span>}
              {uid === user.uid && <span className="text-muted small ms-1">(you)</span>}
            </span>
            {dishes.some((d) => d.authorId === uid) && <i className="bi bi-check-circle-fill text-success" title="Dish submitted" />}
            {isHost && uid !== user.uid && phase !== 'closed' && (
              <Button variant="link" size="sm" className="text-muted p-1" aria-label="Remove guest" onClick={() => onRemoveGuest(uid)}><i className="bi bi-x-lg" /></Button>
            )}
          </div>
        ))}
      </div>

      {cta && <div className="sticky-cta">{cta}</div>}
    </div>
  );
}
