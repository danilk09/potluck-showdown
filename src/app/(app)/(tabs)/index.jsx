import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../../hooks/AuthContext';
import { useMyPotlucks, useNow } from '../../../hooks/useFirestore';
import Avatar from '../../../components/Avatar';
import PotluckCard from '../../../components/PotluckCard';
import GetAppBanner from '../../../components/GetAppBanner';
import { Button, EmptyState, Icon, Loading, Row, Screen, SectionTitle, Stack, Tile } from '../../../components/ui';
import { phaseOf } from '../../../lib/phase';
import { toMillis } from '../../../lib/scoring';
import { colors, type } from '../../../theme';

const TIPS = [
  'Claim a dish early and become everyone’s favorite guest.',
  'Healthy swaps count: healthiness is part of the score.',
  'Add your recipe so guests can recreate your dish later.',
  'A clear photo helps people find your dish in the feed.',
];

export default function Home() {
  const { user, profile } = useAuth();
  const now = useNow();
  const { data: potlucks, loading } = useMyPotlucks();

  const live = potlucks.filter((p) => phaseOf(p, now) === 'voting');
  // "Upcoming" = not finished and not more than a day in the past.
  const upcoming = potlucks.filter((p) => p.status !== 'closed' && toMillis(p.startsAt) > now - 86_400_000);
  const tip = TIPS[new Date(now).getDate() % TIPS.length];

  return (
    <Screen inTabs>
      <Row justify="space-between" style={{ marginBottom: 16 }}>
        <Text style={[type.h4, type.heavy, { fontSize: 19 }]}>Potluck Showdown</Text>
        <Pressable onPress={() => router.push('/profile')} accessibilityLabel="Your profile" accessibilityRole="button">
          <Avatar uid={user.uid} profile={profile} size={44} />
        </Pressable>
      </Row>
      <GetAppBanner />

      <Text style={[type.h1, { marginBottom: 8 }]}>Make your Potluck more fun</Text>
      <Text style={[type.body, type.muted, { marginBottom: 16 }]}>
        Join a potluck, share what you bring, and compete for favorites based on taste and healthiness.
      </Text>
      <Row gap={10} style={{ marginBottom: 24 }}>
        <Button style={{ flex: 1 }} size="lg" icon="add" title="Create Potluck" onPress={() => router.push('/create')} />
        <Button style={{ flex: 1 }} size="lg" variant="outline" title="Join Potluck" onPress={() => router.push('/join')} />
      </Row>

      {live.map((p) => (
        <Tile key={p.id} tone="gold" onPress={() => router.push({ pathname: '/feed', params: { pid: p.id } })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 12 }}>
          <Text style={{ fontSize: 26 }}>🗳️</Text>
          <Text style={[type.body, { flex: 1 }]}><Text style={type.bold}>Voting is open</Text> at {p.title}. Rate the dishes!</Text>
          <Icon name="chevron-forward" />
        </Tile>
      ))}

      <SectionTitle right={<Button variant="link" title="See all" onPress={() => router.push('/events')} />}>Upcoming potlucks</SectionTitle>

      {loading ? <Loading /> : upcoming.length === 0 ? (
        <EmptyState emoji="🥘" title={potlucks.length ? 'Nothing coming up' : 'No potlucks yet'}
          action={<Button title="Enter an invite code" onPress={() => router.push('/join')} />}>
          {potlucks.length ? 'Your past showdowns are under Events. ' : ''}Create your own showdown, or join one with an invite code from a friend.
        </EmptyState>
      ) : (
        <Stack>
          {upcoming.slice(0, 4).map((p) => <PotluckCard key={p.id} potluck={p} now={now} />)}
        </Stack>
      )}

      <Tile tone="lilac" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 24 }}>
        <Icon name="star-outline" size={24} color={colors.coral} />
        <View style={{ flex: 1 }}><Text style={type.body}>{tip}</Text></View>
      </Tile>
    </Screen>
  );
}
