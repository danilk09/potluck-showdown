import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert, Button, Form, InputGroup, Spinner } from 'react-bootstrap';
import { authErrorMessage, useAuth } from '../hooks/AuthContext';
import { friendlyError, joinPotluck, lookupInvite } from '../data/api';
import { normalizeInviteCode } from '../lib/inviteCode';
import { formatInfo } from '../lib/formats';
import { formatTime, formatWhen } from '../lib/dates';
import { PHASE_LABEL, phaseOf } from '../lib/phase';
import { androidAppUrl, isNative } from '../lib/platform';
import { AuthorLine } from '../components/Avatar';
import { Loading, PageHeader } from '../components/ui';

/** Shown to signed-out visitors (usually opening an invite link in a browser). */
function InviteGate({ code }) {
  const { signInGuest } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const next = encodeURIComponent(code ? `/join/${code}` : '/join');

  const joinAsGuest = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInGuest(name.trim());
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="hero-card mb-3">
        <span className="chip mb-2">You’re invited</span>
        <h2 className="fw-800 mb-1">Join the potluck showdown</h2>
        <div>{code ? <>Invite code <span className="invite-code">{code}</span></> : 'Enter your invite code after you continue.'}</div>
      </div>

      <div className="card-soft p-3 mb-3">
        <h3 className="h6 fw-bold mb-1">Continue in your browser</h3>
        <p className="small text-muted">No download needed. Join as a guest to claim a dish, browse recipes, and vote.</p>
        {error && <Alert variant="danger" className="py-2">{error}</Alert>}
        <Form onSubmit={joinAsGuest}>
          <Form.Label htmlFor="guest-name">Your name</Form.Label>
          <InputGroup>
            <Form.Control id="guest-name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="How others will see you" />
            <Button type="submit" disabled={busy || !name.trim()}>{busy ? <Spinner size="sm" /> : 'Continue'}</Button>
          </InputGroup>
        </Form>
        <div className="small text-muted mt-2">Guest passes live in this browser. Save an account from your profile any time to keep them.</div>
      </div>

      <div className="d-grid gap-2">
        <Button as={Link} to={`/signin?next=${next}`} variant="outline-primary">I have an account</Button>
        {!isNative && /Android/i.test(navigator.userAgent) && (
          <Button href={androidAppUrl()} variant="dark"><i className="bi bi-android2 me-2" />Get the Android app instead</Button>
        )}
      </div>
    </>
  );
}

function Preview({ potluck, onJoin, busy }) {
  const { user } = useAuth();
  const fmt = formatInfo(potluck.format);
  const phase = phaseOf(potluck);
  const isMember = potluck.memberIds.includes(user.uid);
  const full = potluck.maxGuests && potluck.memberIds.length >= potluck.maxGuests;
  const totalWeight = potluck.scoring.reduce((s, c) => s + c.weight, 0) || 1;

  return (
    <>
      <div className="card-soft overflow-hidden mb-3">
        <div className="hero-card rounded-0">
          <span className="chip mb-2">{fmt.emoji} {fmt.label}</span>
          <h2 className="fw-800 mb-1">{potluck.title}</h2>
          <div className="fw-semibold" style={{ color: '#ffe08a' }}>{potluck.theme || fmt.blurb}</div>
        </div>
        <div className="p-3 d-grid gap-3">
          <div className="d-flex justify-content-between gap-2">
            <AuthorLine uid={potluck.hostId} sub="Host" />
            <div className="text-end small">
              <div className="fw-bold">{formatWhen(potluck.startsAt)}</div>
              <div className="text-muted text-truncate">{potluck.location}</div>
            </div>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <span className="chip chip-green">{potluck.memberIds.length} attending</span>
            <span className="chip chip-peach">{potluck.dishCategories.length} dish categories</span>
            {potluck.formatDetail && <span className="chip chip-plain">{potluck.formatDetail}</span>}
          </div>
          <div className="row g-2">
            {potluck.scoring.map((c) => (
              <div className="col-6" key={c.id}>
                <div className="border rounded-3 p-2 h-100">
                  <div className="d-flex justify-content-between"><span className="fw-semibold small">{c.name}</span><span className="text-primary fw-800">{Math.round((c.weight / totalWeight) * 100)}%</span></div>
                  <div className="small text-muted text-truncate">{c.description}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="tile-lilac p-2 px-3 d-flex justify-content-between small">
            <span>{potluck.votingOpensAt ? `Voting opens at ${formatTime(potluck.votingOpensAt)}` : 'Host opens voting at the event'}</span>
            <span className="fw-bold text-success">{PHASE_LABEL[phase].toUpperCase()}</span>
          </div>
        </div>
      </div>
      {isMember ? (
        <Button as={Link} to={`/potlucks/${potluck.id}`} size="lg" className="w-100">You’re in! Open event</Button>
      ) : phase === 'closed' ? (
        <Alert variant="secondary">This showdown has already ended.</Alert>
      ) : full ? (
        <Alert variant="warning">This potluck is full.</Alert>
      ) : (
        <>
          <div className="tile-mint p-2 px-3 small mb-2">🥗 Join now, then claim the dish you want to bring.</div>
          <Button size="lg" className="w-100" onClick={onJoin} disabled={busy}>{busy ? 'Joining…' : 'Join Challenge'}</Button>
        </>
      )}
    </>
  );
}

export default function Join() {
  const { code: codeParam } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState(normalizeInviteCode(codeParam ?? ''));
  const [potluck, setPotluck] = useState(null);
  const [status, setStatus] = useState(codeParam ? 'looking' : 'idle'); // idle | looking | found | missing
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const lookup = useCallback(async (c) => {
    try {
      const p = await lookupInvite(c);
      setPotluck(p);
      setStatus(p ? 'found' : 'missing');
    } catch (err) {
      setError(friendlyError(err));
      setStatus('idle');
    }
  }, []);

  useEffect(() => {
    // Fetching from Firestore; state is only set after the await inside lookup().
    // oxlint-disable-next-line react/set-state-in-effect
    if (user && codeParam) lookup(codeParam);
  }, [user, codeParam, lookup]);

  const join = async () => {
    setBusy(true);
    try {
      await joinPotluck(potluck.id);
      navigate(`/potlucks/${potluck.id}`, { replace: true });
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="page">
      <PageHeader title="Join Potluck" backTo={user ? '/' : '/welcome'} />
      {!user ? <InviteGate code={normalizeInviteCode(codeParam ?? '')} /> : (
        <>
          <h2 className="fw-800 mb-1">Join the Potluck Competition</h2>
          <p className="text-muted">Enter your invite code to preview the food competition before you join.</p>
          <Form onSubmit={(e) => { e.preventDefault(); setStatus('looking'); setError(''); lookup(code); }} className="mb-3">
            <Form.Label htmlFor="code">Invite code</Form.Label>
            <InputGroup>
              <Form.Control
                id="code"
                className="invite-code"
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="HARVEST-7K2Q"
                value={code}
                onChange={(e) => { setCode(normalizeInviteCode(e.target.value)); setStatus('idle'); }}
                isValid={status === 'found'}
                isInvalid={status === 'missing'}
              />
              <Button type="submit" disabled={code.length < 4 || status === 'looking'}>{status === 'looking' ? <Spinner size="sm" /> : 'Find'}</Button>
            </InputGroup>
            {status === 'missing' && <div className="small text-danger mt-1">No potluck uses that code. Check the spelling with your host.</div>}
          </Form>
          {error && <Alert variant="danger">{error}</Alert>}
          {status === 'found' && potluck && <Preview potluck={potluck} onJoin={join} busy={busy} />}
        </>
      )}
    </div>
  );
}
