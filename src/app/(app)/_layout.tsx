import { View } from 'react-native';
import { Redirect, Stack, usePathname } from 'expo-router';
import { useAuth } from '../../hooks/AuthContext';
import BottomNav, { isTabPath } from '../../components/BottomNav';
import { BottomNavContext, LoadingScreen } from '../../components/ui';
import { colors } from '../../theme';

/** Everything in this group needs a signed-in user (an account or a guest pass). */
export default function AppLayout() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  if (loading) return <LoadingScreen />;
  if (!user) {
    return <Redirect href={pathname === '/' ? ('/welcome' as any) : ({ pathname: '/welcome', params: { next: pathname } } as any)} />;
  }
  // Screens opened on top of the tabs keep the bottom bar too.
  const showNav = !isTabPath(pathname);
  return (
    <BottomNavContext.Provider value={showNav}>
      <View style={{ flex: 1, backgroundColor: colors.cream }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream }, animation: 'slide_from_right' }}>
          {/* Rating's "Previous" slides the page in from the left, like flipping back. */}
          <Stack.Screen
            name="potlucks/[pid]/dishes/[did]/rate"
            options={({ route }: any) => ({ animation: route.params?.dir === 'prev' ? 'slide_from_left' : 'slide_from_right' })}
          />
        </Stack>
        {showNav && <BottomNav pathname={pathname} />}
      </View>
    </BottomNavContext.Provider>
  );
}
