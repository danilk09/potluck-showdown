import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../../hooks/AuthContext';
import { useMyPotlucks, useNow } from '../../../hooks/useFirestore';
import PotluckCard from '../../../components/PotluckCard';
import { Button, EmptyState, Loading, PageHeader, Row, Screen, Stack } from '../../../components/ui';
import { toMillis } from '../../../lib/scoring';
import { colors, radius } from '../../../theme';

type TabKey = 'upcoming' | 'hosting' | 'past';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'hosting', label: 'Hosting' },
  { key: 'past', label: 'Past' },
];

// Remembered while the app is open, like the web version's session storage.
let lastTab: TabKey = 'upcoming';

export default function Events() {
  const { user } = useAuth();
  const now = useNow();
  const [tab, setTab] = useState<TabKey>(lastTab);
  const { data: potlucks, loading } = useMyPotlucks();

  const uid = user?.uid || '';
  const lists: Record<TabKey, any[]> = {
    upcoming: potlucks.filter((p) => p.status !== 'closed'),
    hosting: potlucks.filter((p) => p.hostId === uid),
    past: potlucks.filter((p) => p.status === 'closed').sort((a, b) => toMillis(b.startsAt) - toMillis(a.startsAt)),
  };
  const shown = lists[tab];

  useEffect(() => {
    lastTab = tab;
  }, [tab]);

  return (
    <Screen inTabs wide>
      <PageHeader title="Your events" back={false} />
      <Row gap={10} style={{ marginBottom: 16 }}>
        <Button style={{ flex: 1 }} icon="add" title="Create" onPress={() => router.push('/create')} />
        <Button style={{ flex: 1 }} variant="outline" title="Join with code" onPress={() => router.push('/join')} />
      </Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ marginBottom: 16, flexGrow: 0 }}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: active }}
              style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: active ? colors.coral : 'transparent' }}>
              <Text style={{ fontWeight: '600', color: active ? colors.white : colors.coral }}>
                {t.label} <Text style={{ opacity: 0.75 }}>({lists[t.key].length})</Text>
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {loading ? <Loading /> : shown.length === 0 ? (
        <EmptyState emoji={tab === 'past' ? '📜' : '🗓️'}
          title={tab === 'past' ? 'No finished showdowns yet' : tab === 'hosting' ? 'You haven’t hosted yet' : 'Nothing coming up'}>
          {tab === 'hosting' ? 'Create a potluck and invite your friends with a code.' : 'Join a potluck with an invite code, or host your own.'}
        </EmptyState>
      ) : (
        <Stack>{shown.map((p) => <PotluckCard key={p.id} potluck={p} now={now} />)}</Stack>
      )}
    </Screen>
  );
}
