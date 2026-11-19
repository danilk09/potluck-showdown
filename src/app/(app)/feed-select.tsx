import { router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { useMyPotlucks, useNow } from '../../hooks/useFirestore';
import PotluckBrowser from '../../components/PotluckBrowser';
import { PageHeader, Screen } from '../../components/ui';
import { type } from '../../theme';

/** Picks which potluck the food feed shows. Laid out like the Events tab. */
export default function FeedSelect() {
  const { pid } = useLocalSearchParams<{ pid?: string }>();
  const now = useNow();
  const { data: potlucks, loading } = useMyPotlucks();
  const current = potlucks.find((p) => p.id === pid);

  return (
    <Screen wide>
      <PageHeader title="Choose a potluck" backTo="/feed" />
      <Text style={[type.body, type.muted, { marginBottom: 12 }]}>Pick whose dishes to see in the food feed.</Text>
      <PotluckBrowser
        potlucks={potlucks}
        loading={loading}
        now={now}
        memoryKey="feed"
        // Start where the potluck being shown is, so it's easy to see and swap.
        initialTab={current ? (current.status === 'closed' ? 'past' : 'upcoming') : undefined}
        selectedId={typeof pid === 'string' ? pid : undefined}
        onSelect={(p) => router.dismissTo({ pathname: '/feed', params: { pid: p.id } })}
      />
    </Screen>
  );
}
