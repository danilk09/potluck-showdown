import { useState } from 'react';
import { router } from 'expo-router';
import { useMyPotlucks, useNow } from '../../../hooks/useFirestore';
import JoinDialog from '../../../components/JoinDialog';
import PotluckBrowser from '../../../components/PotluckBrowser';
import { Button, PageHeader, Row, Screen } from '../../../components/ui';

export default function Events() {
  const now = useNow();
  const [joining, setJoining] = useState(false);
  const { data: potlucks, loading } = useMyPotlucks();

  return (
    <Screen inTabs wide>
      <JoinDialog visible={joining} onClose={() => setJoining(false)} />
      <PageHeader title="Your events" back={false} />
      <Row gap={10} style={{ marginBottom: 16 }}>
        <Button style={{ flex: 1 }} icon="add" title="Create" onPress={() => router.push('/create')} />
        <Button style={{ flex: 1 }} variant="outline" title="Join with code" onPress={() => setJoining(true)} />
      </Row>
      <PotluckBrowser potlucks={potlucks} loading={loading} now={now} memoryKey="events" />
    </Screen>
  );
}
