import { Redirect, Stack, useGlobalSearchParams } from 'expo-router';
import { useAuth } from '../../hooks/AuthContext';
import { LoadingScreen } from '../../components/ui';
import { colors } from '../../theme';

/** Only allow in-app paths as the post-sign-in destination. */
function safeNext(next: unknown): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

/** Welcome + sign-in screens. Signed-in people go on to where they were headed. */
export default function AuthLayout() {
  const { user, loading } = useAuth();
  const { next } = useGlobalSearchParams();
  if (loading) return <LoadingScreen />;
  if (user) return <Redirect href={safeNext(next) as any} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }} />;
}
