import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Alert, Button, Form } from 'react-bootstrap';
import { authErrorMessage, useAuth } from '../hooks/AuthContext';
import { AuthShell } from './Welcome';
import { PageHeader } from '../components/ui';

function useNextSearch() {
  return useLocation().search;
}

export function SignIn() {
  const { signIn } = useAuth();
  const search = useNextSearch();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <PageHeader title="Welcome back" backTo={`/welcome${search}`} />
      <Form onSubmit={submit} className="d-grid gap-3">
        {error && <Alert variant="danger" className="mb-0">{error}</Alert>}
        <Form.Group controlId="email">
          <Form.Label>Email</Form.Label>
          <Form.Control type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Form.Group>
        <Form.Group controlId="password">
          <Form.Label>Password</Form.Label>
          <Form.Control type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Form.Group>
        <Link to={`/forgot${search}`} className="small fw-semibold">Forgot password?</Link>
        <Button type="submit" size="lg" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        <div className="text-center small">New here? <Link to={`/signup${search}`} className="fw-semibold">Create an account</Link></div>
      </Form>
    </AuthShell>
  );
}

export function SignUp() {
  const { signUp } = useAuth();
  const search = useNextSearch();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) return setError('Use at least 8 characters for your password.');
    if (form.password !== form.confirm) return setError('Passwords don’t match.');
    setBusy(true);
    setError('');
    try {
      await signUp(form.name.trim(), form.email.trim(), form.password);
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
    return undefined;
  };

  return (
    <AuthShell>
      <PageHeader title="Create your account" backTo={`/welcome${search}`} />
      <Form onSubmit={submit} className="d-grid gap-3">
        {error && <Alert variant="danger" className="mb-0">{error}</Alert>}
        <Form.Group controlId="name">
          <Form.Label>Display name</Form.Label>
          <Form.Control autoComplete="nickname" required maxLength={40} value={form.name} onChange={set('name')} placeholder="How guests will see you" />
        </Form.Group>
        <Form.Group controlId="email">
          <Form.Label>Email</Form.Label>
          <Form.Control type="email" autoComplete="email" inputMode="email" required value={form.email} onChange={set('email')} />
        </Form.Group>
        <Form.Group controlId="password">
          <Form.Label>Password</Form.Label>
          <Form.Control type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={set('password')} />
          <Form.Text>At least 8 characters. Passwords are stored securely by Firebase Authentication.</Form.Text>
        </Form.Group>
        <Form.Group controlId="confirm">
          <Form.Label>Confirm password</Form.Label>
          <Form.Control type="password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} />
        </Form.Group>
        <Button type="submit" size="lg" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</Button>
        <div className="text-center small">Already have one? <Link to={`/signin${search}`} className="fw-semibold">Sign in</Link></div>
      </Form>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const { resetPassword } = useAuth();
  const search = useNextSearch();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(authErrorMessage(err));
    }
  };

  return (
    <AuthShell>
      <PageHeader title="Reset password" backTo={`/signin${search}`} />
      {sent ? (
        <Alert variant="success">If an account exists for {email}, a reset link is on its way.</Alert>
      ) : (
        <Form onSubmit={submit} className="d-grid gap-3">
          {error && <Alert variant="danger" className="mb-0">{error}</Alert>}
          <Form.Group controlId="email">
            <Form.Label>Email</Form.Label>
            <Form.Control type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Form.Group>
          <Button type="submit" size="lg">Send reset link</Button>
        </Form>
      )}
    </AuthShell>
  );
}
