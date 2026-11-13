import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { authErrorMessage, useAuth } from '../../hooks/AuthContext';
import AuthShell from '../../components/AuthShell';
import { Banner, Button, Field, PageHeader, Stack } from '../../components/ui';

/** Step 1 emails a one-time code; step 2 sets a new password with it and signs in. */
export default function ForgotPassword() {
  const { requestPasswordReset, resetPassword } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () => run(async () => {
    await requestPasswordReset(email.trim());
    setSent(true);
  });

  // On success the auth layout sees the new session and moves on.
  const submitReset = () => {
    if (password.length < 8) {
      setError('Please choose a stronger password (at least 8 characters).');
      return;
    }
    run(() => resetPassword(email.trim(), code.trim(), password));
  };

  return (
    <AuthShell>
      <PageHeader title="Reset password" backTo="/signin" />
      {!sent ? (
        <Stack gap={16}>
          {error ? <Banner>{error}</Banner> : null}
          <Field label="Email" value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address"
            autoCapitalize="none" autoCorrect={false} returnKeyType="send" onSubmitEditing={sendCode} />
          <Button size="lg" title="Email me a reset code" loading={busy} disabled={!email.trim()} onPress={sendCode} />
        </Stack>
      ) : (
        <Stack gap={16}>
          <Banner tone="success">If an account exists for {email}, a reset code is on its way. It expires in 15 minutes.</Banner>
          {error ? <Banner>{error}</Banner> : null}
          <Field label="Reset code" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false}
            autoComplete="one-time-code" />
          <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry
            autoComplete="new-password" returnKeyType="go" onSubmitEditing={submitReset} />
          <Button size="lg" title="Set new password" loading={busy} disabled={!code.trim() || !password} onPress={submitReset} />
          <Button variant="outline" title="Send a new code" disabled={busy} onPress={sendCode} />
        </Stack>
      )}
    </AuthShell>
  );
}
