import { router } from 'expo-router';
import { Button, EmptyState, Screen } from '../components/ui';

export default function NotFound() {
  return (
    <Screen contentStyle={{ paddingTop: 32 }}>
      <EmptyState emoji="🥄" title="This page isn’t on the menu" action={<Button title="Go home" onPress={() => router.replace('/')} />} />
    </Screen>
  );
}
