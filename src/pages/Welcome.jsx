import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Alert, Button, Container } from 'react-bootstrap';
import { emulatorHost, emulatorsReachable, usingEmulators } from '../firebase';

/** Explains the most common testing mistake: the local Firebase emulators aren't running. */
function EmulatorNotice() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    if (!usingEmulators) return undefined;
    let alive = true;
    const check = () => emulatorsReachable().then((ok) => alive && setDown(!ok));
    check();
    const t = setInterval(check, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!down) return null;
  return (
    <Alert variant="warning" className="small">
      <strong>Can’t reach the local Firebase emulators</strong> at {emulatorHost}. On your computer, run{' '}
      <code>npm run emulators</code> in the project folder, then try again.
    </Alert>
  );
}

export function AuthShell({ children }) {
  return (
    <div className="auth-hero min-vh-100" style={{ paddingTop: 'calc(var(--sa-top) + 1.5rem)', paddingBottom: 'calc(var(--sa-bottom) + 1.5rem)' }}>
      <Container className="page" style={{ maxWidth: 460 }}>
        <EmulatorNotice />
        {children}
      </Container>
    </div>
  );
}

export default function Welcome() {
  const { search } = useLocation();
  return (
    <AuthShell>
      <div className="d-flex flex-column" style={{ minHeight: 'calc(100dvh - 3rem - var(--sa-top) - var(--sa-bottom))' }}>
        <div className="fw-800 fs-5">🍲 Potluck Showdown</div>
        <div className="flex-grow-1 d-flex flex-column justify-content-center py-4">
          <div className="d-flex gap-2 mb-3" style={{ fontSize: '2.6rem' }} aria-hidden>🥗🍜🧁🏆</div>
          <h1 className="fw-800 mb-3">Make your potluck more fun.</h1>
          <p className="text-muted fs-5">
            Host a cook-off, claim a dish, and compete for the tastiest and healthiest plate.
            Every recipe stays in your recipe bank after the party.
          </p>
          <ul className="list-unstyled d-grid gap-2 my-3">
            <li><i className="bi bi-trophy text-primary me-2" />Rate dishes anonymously and crown a winner</li>
            <li><i className="bi bi-journal-bookmark text-primary me-2" />Keep recipes from every potluck you attend</li>
            <li><i className="bi bi-patch-check text-primary me-2" />Earn a winner’s frame for your profile picture</li>
          </ul>
        </div>
        <div className="d-grid gap-2">
          <Button as={Link} to={`/signup${search}`} size="lg">Create an account</Button>
          <Button as={Link} to={`/signin${search}`} size="lg" variant="outline-primary">Sign in</Button>
          <Link to="/join" className="text-center mt-2 fw-semibold">Got an invite code? Join as a guest</Link>
          {usingEmulators && <div className="text-center small text-muted mt-2">Running on local Firebase emulators</div>}
        </div>
      </div>
    </AuthShell>
  );
}
