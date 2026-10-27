import { Redirect, Stack, usePathname } from 'expo-router';
import { useAuth } from '../../hooks/AuthContext';
import { LoadingScreen } from '../../components/ui';
import { colors } from '../../theme';

/** Everything in this group needs a signed-in user (an account or a guest pass). */
export default function AppLayout() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  if (loading) return <LoadingScreen />;
  if (!user) {
    return <Redirect href={pathname === '/' ? ('/welcome' as any) : ({ pathname: '/welcome', params: { next: pathname } } as any)} />;
  }
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream }, animation: 'slide_from_right' }} />
  );
}
