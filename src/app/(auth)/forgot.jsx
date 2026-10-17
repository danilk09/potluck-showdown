import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { authErrorMessage, useAuth } from '../../hooks/AuthContext';
import AuthShell from '../../components/AuthShell';
import { Banner, Button, Field, PageHeader, Stack } from '../../components/ui';

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const params = useLocalSearchParams();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(authErrorMessage(err));
    }
  };

  return (
    <AuthShell>
      <PageHeader title="Reset password" backTo="/signin" />
      {sent ? (
        <Banner tone="success">If an account exists for {email}, a reset link is on its way.</Banner>
      ) : (
        <Stack gap={16}>
          {error ? <Banner>{error}</Banner> : null}
          <Field label="Email" value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address"
            autoCapitalize="none" autoCorrect={false} returnKeyType="send" onSubmitEditing={submit} />
          <Button size="lg" title="Send reset link" disabled={!email.trim()} onPress={submit} />
        </Stack>
      )}
    </AuthShell>
  );
}
