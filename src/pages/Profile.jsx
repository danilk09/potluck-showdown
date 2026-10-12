import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Alert, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { authErrorMessage, useAuth } from '../hooks/AuthContext';
import { useMyPotlucks } from '../hooks/useFirestore';
import { friendlyError, updateMyProfile } from '../data/api';
import { FRAMES, FRAME_ORDER, earnedFrames, winCount } from '../lib/frames';
import { compressImage } from '../lib/images';
import { formatDate } from '../lib/dates';
import { toMillis } from '../lib/scoring';
import { androidAppUrl, isNative } from '../lib/platform';
import { usingEmulators } from '../firebase';
import Avatar from '../components/Avatar';
import { PageHeader, useConfirm, useToast } from '../components/ui';

function UpgradeGuest() {
  const { upgradeGuest } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    setBusy(true);
    setError('');
    try {
      await upgradeGuest(email.trim(), password);
      toast('Account saved! You can now sign in anywhere.');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
    return undefined;
  };
  return (
    <div className="tile-gold p-3 mb-3">
      <div className="fw-bold">You’re using a guest pass</div>
      <p className="small mb-2">It only lives in this browser. Save it as an account to keep your potlucks and recipes, sign in on the Android app, and host your own showdowns.</p>
      {error && <Alert variant="danger" className="py-2">{error}</Alert>}
      <Form onSubmit={submit} className="d-grid gap-2">
        <Form.Control type="email" autoComplete="email" placeholder="Email" aria-label="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Form.Control type="password" autoComplete="new-password" placeholder="Password (8+ characters)" aria-label="Password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save my account'}</Button>
      </Form>
    </div>
  );
}

function DeleteAccountModal({ show, onHide }) {
  const { deleteAccount, isGuest } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await deleteAccount(password);
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Modal show={show} onHide={onHide} centered>
      <Form onSubmit={submit}>
        <Modal.Header closeButton className="border-0"><Modal.Title className="h5 fw-bold">Delete your account?</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="text-muted">Your profile and sign-in are permanently deleted. Dishes you shared stay in past potlucks as “Former guest.”</p>
          {error && <Alert variant="danger" className="py-2">{error}</Alert>}
          {!isGuest && <Form.Control type="password" autoComplete="current-password" placeholder="Confirm your password" aria-label="Password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Modal.Body>
        <Modal.Footer className="border-0">
          <Button variant="light" onClick={onHide}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={busy}>{busy ? 'Deleting…' : 'Delete account'}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

export default function Profile() {
  const { user, profile, isGuest, signOut } = useAuth();
  const toast = useToast();
  const [confirmEl, confirm] = useConfirm();
  const { data: potlucks } = useMyPotlucks();
  const [name, setName] = useState(null);
  const [busy, setBusy] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  const earned = useMemo(() => earnedFrames(user.uid, potlucks), [user.uid, potlucks]);
  // Most recent potluck backing each tier (rules verify the claim).
  const bestByTier = useMemo(() => {
    const map = {};
    for (const f of [...earned].sort((a, b) => toMillis(b.potluck.startsAt) - toMillis(a.potluck.startsAt))) {
      map[f.tier] ??= f;
    }
    return map;
  }, [earned]);
  const trophies = earned.filter((f) => f.tier !== 'host');
  const attended = potlucks.filter((p) => p.status === 'closed').length;

  const run = async (key, fn, success) => {
    setBusy(key);
    try {
      await fn();
      if (success) toast(success);
    } catch (err) {
      toast(friendlyError(err), 'danger');
    } finally {
      setBusy('');
    }
  };

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    run('photo', async () => {
      const photoURL = await compressImage(file, { maxDim: 256, maxChars: 100_000, crop: true });
      await updateMyProfile({ photoURL });
    }, 'Profile photo updated');
  };

  const saveName = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    run('name', () => updateMyProfile({ displayName: trimmed.slice(0, 40) }), 'Name updated').then(() => setName(null));
  };

  const chooseFrame = (tier) => {
    const frame = tier ? { tier, potluckId: bestByTier[tier].potluckId } : null;
    run(`frame-${tier}`, () => updateMyProfile({ frame }), tier ? `${FRAMES[tier].label} frame equipped` : 'Frame removed');
  };

  const onSignOut = async () => {
    if (!isGuest || await confirm({ title: 'Sign out of your guest pass?', body: 'Guest passes can’t be recovered after signing out. Save an account first to keep your potlucks.', confirmLabel: 'Sign out anyway', danger: true })) {
      signOut();
    }
  };

  return (
    <div className="page">
      {confirmEl}
      <DeleteAccountModal show={showDelete} onHide={() => setShowDelete(false)} />
      <PageHeader title="Profile" back={false} />

      <div className="card-soft p-4 text-center mb-3">
        <div className="d-inline-block position-relative mb-2">
          <Avatar uid={user.uid} profile={profile} size={112} />
          <label className="btn btn-primary btn-sm rounded-circle position-absolute top-0 end-0 shadow" style={{ width: 36, height: 36, padding: 0, lineHeight: '36px' }} aria-label="Change photo">
            {busy === 'photo' ? <Spinner size="sm" /> : <i className="bi bi-camera" />}
            <input type="file" accept="image/*" className="d-none" onChange={pickPhoto} />
          </label>
        </div>
        {name === null ? (
          <h2 className="fw-800 mb-0">
            {profile?.displayName ?? '…'}
            <Button variant="link" className="p-1 ms-1 align-baseline" aria-label="Edit name" onClick={() => setName(profile?.displayName ?? '')}><i className="bi bi-pencil fs-6" /></Button>
          </h2>
        ) : (
          <Form onSubmit={saveName} className="d-flex gap-2 justify-content-center mx-auto" style={{ maxWidth: 320 }}>
            <Form.Control autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
            <Button type="submit" disabled={busy === 'name'}>Save</Button>
          </Form>
        )}
        <div className="text-muted small">{isGuest ? 'Guest' : user.email}</div>
        {profile?.frame && <div className="mt-2"><span className="chip chip-gold">{FRAMES[profile.frame.tier]?.medal} {FRAMES[profile.frame.tier]?.label}</span></div>}
        <Row className="mt-3 g-2">
          {[
            ['Showdowns', attended],
            ['Wins', winCount(user.uid, potlucks)],
            ['Podiums', trophies.length],
          ].map(([label, value]) => (
            <Col key={label}><div className="tile-peach py-2"><div className="fs-4 fw-800">{value}</div><div className="small text-muted">{label}</div></div></Col>
          ))}
        </Row>
      </div>

      {isGuest && <UpgradeGuest />}

      <h3 className="h5 fw-800 mb-1">Profile frame</h3>
      <p className="small text-muted">Profiles are private, but everyone sees your picture in feeds and guest lists. Win a showdown to unlock a frame and show it off.</p>
      <Row xs={2} sm={3} className="g-2 mb-4">
        <Col>
          <button type="button" onClick={() => chooseFrame(null)} disabled={Boolean(busy)} className={`card-soft w-100 h-100 p-3 text-center ${!profile?.frame ? 'border-primary border-2' : ''}`}>
            <Avatar uid={user.uid} profile={{ ...profile, frame: null }} size={56} />
            <div className="fw-bold small mt-2">No frame</div>
          </button>
        </Col>
        {FRAME_ORDER.map((tier) => {
          const unlocked = Boolean(bestByTier[tier]);
          const active = profile?.frame?.tier === tier;
          return (
            <Col key={tier}>
              <button
                type="button"
                onClick={() => unlocked && chooseFrame(tier)}
                disabled={!unlocked || Boolean(busy)}
                aria-pressed={active}
                className={`card-soft w-100 h-100 p-3 text-center ${active ? 'border-primary border-2' : ''}`}
                style={{ opacity: unlocked ? 1 : 0.55 }}
              >
                <Avatar uid={user.uid} profile={{ ...profile, frame: { tier } }} size={56} />
                <div className="fw-bold small mt-2">{FRAMES[tier].label} {!unlocked && <i className="bi bi-lock-fill" />}</div>
                <div className="small text-muted">{unlocked ? (active ? 'Equipped' : 'Tap to equip') : FRAMES[tier].desc}</div>
              </button>
            </Col>
          );
        })}
      </Row>

      {trophies.length > 0 && (
        <>
          <h3 className="h5 fw-800 mb-2">Trophy case</h3>
          <div className="card-soft p-2 mb-4">
            {trophies.map((t) => (
              <Link key={`${t.potluckId}-${t.tier}`} to={`/potlucks/${t.potluckId}/results`} className="d-flex align-items-center gap-3 p-2 text-body">
                <span className="fs-3" aria-hidden>{FRAMES[t.tier].medal}</span>
                <span className="flex-grow-1 min-w-0">
                  <span className="fw-bold d-block text-truncate">{t.potluck.title}</span>
                  <span className="small text-muted">{FRAMES[t.tier].label} · {formatDate(t.potluck.startsAt)}</span>
                </span>
                <i className="bi bi-chevron-right text-muted" />
              </Link>
            ))}
          </div>
        </>
      )}

      <h3 className="h5 fw-800 mb-2">Account</h3>
      <div className="card-soft mb-3">
        {!isNative && (
          <a href={androidAppUrl()} className="d-flex align-items-center gap-3 p-3 border-bottom text-body">
            <i className="bi bi-android2 fs-5 text-success" /><span className="flex-grow-1">Get the Android app</span><i className="bi bi-download text-muted" />
          </a>
        )}
        <button type="button" onClick={onSignOut} className="btn w-100 text-start d-flex align-items-center gap-3 p-3 border-bottom rounded-0">
          <i className="bi bi-box-arrow-right fs-5" /><span className="flex-grow-1">Sign out</span>
        </button>
        <button type="button" onClick={() => setShowDelete(true)} className="btn w-100 text-start d-flex align-items-center gap-3 p-3 text-danger rounded-0">
          <i className="bi bi-person-x fs-5" /><span className="flex-grow-1">Delete account</span>
        </button>
      </div>
      <p className="small text-muted text-center">
        Passwords are stored and verified by Firebase Authentication. Potluck Showdown never sees them.
        {usingEmulators && <><br />Connected to local Firebase emulators.</>}
      </p>
    </div>
  );
}
