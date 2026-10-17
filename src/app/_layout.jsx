import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../hooks/AuthContext';
import { ToastProvider } from '../components/ui';
import { colors } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigator() {
  const { loading } = useAuth();
  // Keep the splash screen up until we know whether someone is signed in.
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream }, animation: 'slide_from_right' }} />
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <Navigator />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
