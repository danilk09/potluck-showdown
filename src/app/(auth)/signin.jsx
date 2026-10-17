import { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { authErrorMessage, useAuth } from '../../hooks/AuthContext';
import AuthShell from '../../components/AuthShell';
import { Banner, Button, Field, PageHeader, Row, Stack } from '../../components/ui';
import { type } from '../../theme';

export default function SignIn() {
  const { signIn } = useAuth();
  const { next } = useLocalSearchParams();
  const params = next ? { next } : {};
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
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
      <PageHeader title="Welcome back" backTo="/welcome" />
      <Stack gap={16}>
        {error ? <Banner>{error}</Banner> : null}
        <Field label="Email" value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password"
          textContentType="password" returnKeyType="go" onSubmitEditing={submit} />
        <Button variant="link" title="Forgot password?" style={{ alignSelf: 'flex-start' }}
          onPress={() => router.push({ pathname: '/forgot', params: { ...params, email } })} />
        <Button size="lg" title={busy ? 'Signing in…' : 'Sign in'} loading={busy} disabled={!email || !password} onPress={submit} />
        <Row justify="center" gap={4}>
          <Text style={type.small}>New here?</Text>
          <Button variant="link" title="Create an account" onPress={() => router.replace({ pathname: '/signup', params })} />
        </Row>
      </Stack>
    </AuthShell>
  );
}
