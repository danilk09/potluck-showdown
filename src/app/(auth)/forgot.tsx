import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { authErrorMessage, useAuth } from '../../hooks/AuthContext';
import AuthShell from '../../components/AuthShell';
import { Banner, Button, Field, PageHeader, Stack, useFormError } from '../../components/ui';

/** Step 1 emails a one-time code; step 2 sets a new password with it and signs in. */
export default function ForgotPassword() {
  const { requestPasswordReset, resetPassword } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [problemEl, showProblem] = useFormError();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      showProblem({ title: 'Something went wrong', message: authErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () => {
    if (!email.trim()) {
      setChecked(true);
      showProblem({ missing: ['Email'] });
      return;
    }
    run(async () => {
      await requestPasswordReset(email.trim());
      setSent(true);
    });
  };

  // On success the auth layout sees the new session and moves on.
  const submitReset = () => {
    const missing = [!code.trim() && 'Reset code', !password && 'New password'].filter(Boolean) as string[];
    const problems = password && password.length < 8 ? ['Choose a stronger password (at least 8 characters).'] : [];
    if (missing.length || problems.length) {
      setChecked(true);
      showProblem({ missing, problems });
      return;
    }
    run(() => resetPassword(email.trim(), code.trim(), password));
  };

  return (
    <AuthShell>
      <PageHeader title="Reset password" backTo="/signin" />
      {!sent ? (
        <Stack gap={16}>
          {problemEl}
          <Field label="Email" required invalid={checked && !email.trim()} value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address"
            autoCapitalize="none" autoCorrect={false} returnKeyType="send" onSubmitEditing={sendCode} />
          <Button size="lg" title="Email me a reset code" loading={busy} onPress={sendCode} />
        </Stack>
      ) : (
        <Stack gap={16}>
          <Banner tone="success">If an account exists for {email}, a reset code is on its way. It expires in 15 minutes.</Banner>
          {problemEl}
          <Field label="Reset code" required invalid={checked && !code.trim()} value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false}
            autoComplete="one-time-code" />
          <Field label="New password" required invalid={checked && password.length < 8} value={password} onChangeText={setPassword} secureTextEntry
            autoComplete="new-password" returnKeyType="go" onSubmitEditing={submitReset} />
          <Button size="lg" title="Set new password" loading={busy} onPress={submitReset} />
          <Button variant="outline" title="Send a new code" disabled={busy} onPress={sendCode} />
        </Stack>
      )}
    </AuthShell>
  );
}
