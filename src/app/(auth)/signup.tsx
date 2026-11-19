import { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { authErrorMessage, useAuth } from '../../hooks/AuthContext';
import AuthShell from '../../components/AuthShell';
import { Button, Field, PageHeader, Row, Stack, useFormError } from '../../components/ui';
import { type } from '../../theme';

export default function SignUp() {
  const { signUp } = useAuth();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [problemEl, showProblem] = useFormError();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (busy) return;
    const missing = [
      !form.name.trim() && 'Display name',
      !form.email.trim() && 'Email',
      !form.password && 'Password',
      !form.confirm && 'Confirm password',
    ].filter(Boolean) as string[];
    const problems = [
      form.password && form.password.length < 8 && 'Use at least 8 characters for your password.',
      form.password && form.confirm && form.password !== form.confirm && 'The two passwords don’t match.',
    ].filter(Boolean) as string[];
    if (missing.length || problems.length) {
      setChecked(true);
      showProblem({ missing, problems });
      return;
    }
    setBusy(true);
    try {
      await signUp(form.name.trim(), form.email.trim(), form.password);
    } catch (err) {
      showProblem({ title: 'Couldn’t create your account', message: authErrorMessage(err) });
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <PageHeader title="Create your account" backTo="/welcome" />
      <Stack gap={16}>
        {problemEl}
        <Field label="Display name" required invalid={checked && !form.name.trim()} value={form.name} onChangeText={set('name')} maxLength={40} placeholder="How guests will see you"
          autoComplete="nickname" />
        <Field label="Email" required invalid={checked && !form.email.trim()} value={form.email} onChangeText={set('email')} autoComplete="email" keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" />
        <Field label="Password" required invalid={checked && form.password.length < 8} value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password"
          textContentType="newPassword" hint="At least 8 characters. Passwords are stored securely." />
        <Field label="Confirm password" required invalid={checked && (!form.confirm || form.confirm !== form.password)} value={form.confirm} onChangeText={set('confirm')} secureTextEntry autoComplete="new-password"
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
