import { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { authErrorMessage, useAuth } from '../../hooks/AuthContext';
import AuthShell from '../../components/AuthShell';
import { Banner, Button, Field, PageHeader, Row, Stack } from '../../components/ui';
import { type } from '../../theme';

export default function SignUp() {
  const { signUp } = useAuth();
  const { next } = useLocalSearchParams();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim()) return setError('Please fill in your name and email.');
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
      <PageHeader title="Create your account" backTo="/welcome" />
      <Stack gap={16}>
        {error ? <Banner>{error}</Banner> : null}
        <Field label="Display name" value={form.name} onChangeText={set('name')} maxLength={40} placeholder="How guests will see you"
          autoComplete="nickname" />
        <Field label="Email" value={form.email} onChangeText={set('email')} autoComplete="email" keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" />
        <Field label="Password" value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password"
          textContentType="newPassword" hint="At least 8 characters. Passwords are stored securely by Firebase Authentication." />
        <Field label="Confirm password" value={form.confirm} onChangeText={set('confirm')} secureTextEntry autoComplete="new-password"
          textContentType="newPassword" returnKeyType="go" onSubmitEditing={submit} />
        <Button size="lg" title={busy ? 'Creating account…' : 'Create account'} loading={busy} onPress={submit} />
        <Row justify="center" gap={4}>
          <Text style={type.small}>Already have one?</Text>
          <Button variant="link" title="Sign in" onPress={() => router.replace({ pathname: '/signin', params: next ? { next } : {} })} />
        </Row>
      </Stack>
    </AuthShell>
  );
}
