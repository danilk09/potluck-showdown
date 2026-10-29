import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../../../../hooks/AuthContext';
import { useDishes, useMyRatings, useNow, usePotluck } from '../../../../../../hooks/useFirestore';
import { useProfiles } from '../../../../../../hooks/useProfiles';
import { friendlyError, submitRating } from '../../../../../../data/api';
import { phaseOf } from '../../../../../../lib/phase';
import { formatDuration } from '../../../../../../lib/dates';
import { toMillis } from '../../../../../../lib/scoring';
import { healthPoints } from '../../../../../../lib/healthScore';
import { HealthScoreMeter } from '../../../../../../components/HealthScoreMeter';
import { ImpactStyle, tapFeedback } from '../../../../../../lib/platform';
import Avatar from '../../../../../../components/Avatar';
import {
  Banner, Button, Card, Chip, EmptyState, FsImage, Icon, LoadingScreen, PageHeader, Row, Screen, StarRating, Stack, Tile, useToast,
} from '../../../../../../components/ui';
import { colors, type } from '../../../../../../theme';

const PROMPTS: Record<string, string> = {
  Deliciousness: 'Would you sneak back for seconds?',
  Healthiness: 'How balanced and nourishing is it?',
  Creativity: 'How unique and creative was the dish?',
  Presentation: 'How good does it look on the plate?',
  'Theme fit': 'How well does it fit the challenge?',
};

function Notice({ emoji, title, children, pid }: { emoji?: string; title: string; children?: React.ReactNode; pid?: string }) {
  return (
    <Screen>
      <PageHeader title="Rate this dish" />
      <EmptyState emoji={emoji} title={title}
        action={pid ? <Button title="Back to the feed" onPress={() => router.replace({ pathname: '/feed', params: { pid } })} /> : undefined}>
        {children}
      </EmptyState>
    </Screen>
  );
}

export default function RateDish() {
  const { pid, did } = useLocalSearchParams<{ pid: string; did: string }>();
  const { user, profile } = useAuth();
  const toast = useToast();
  const now = useNow(30_000);
  const { data: potluck, loading } = usePotluck(pid);
  const uid = user?.uid || '';
  const isMember = Boolean(potluck?.memberIds.includes(uid));
  const { data: dishes, loading: dishesLoading } = useDishes(pid, isMember);
  const { ratings, loading: ratingsLoading } = useMyRatings(pid, isMember);
  const dish = dishes.find((d: any) => d.id === did);
  const author = useProfiles([dish?.authorId])(dish?.authorId);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (loading || dishesLoading || ratingsLoading) return <LoadingScreen />;
  if (!potluck || !isMember || !dish) return <Notice title="Dish not found" />;

  const phase = phaseOf(potluck, now);
  if (dish.authorId === uid) return <Notice pid={pid} emoji="🙈" title="That’s your dish!">You can’t rate your own dish.</Notice>;
  if (ratings.has(did)) return <Notice pid={pid} emoji="✅" title="Already rated">Votes are final. Thanks for judging!</Notice>;
  if (phase !== 'voting') return <Notice pid={pid} emoji="⏳" title={phase === 'open' ? 'Voting hasn’t opened yet' : 'Voting is closed'} />;

  const left = dishes.filter((d: any) => d.authorId !== uid && !ratings.has(d.id)).length;
  const closes = toMillis(potluck.votingClosesAt);
  const manualScoring = potluck.scoring.filter((c: any) => c.mode !== 'ai');
  const aiScoring = potluck.scoring.filter((c: any) => c.mode === 'ai');
  const done = manualScoring.filter((c: any) => scores[c.id]).length;
  const complete = manualScoring.length > 0 && done === manualScoring.length;
  const authorFirst = author?.displayName?.split(' ')[0];

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await submitRating(pid, did, scores);
      tapFeedback(ImpactStyle.Medium);
      toast('Rating submitted 🏆');
      // Go straight to the next unrated dish, if there is one.
      const nextDish = dishes.find((d: any) => d.authorId !== uid && !ratings.has(d.id) && d.id !== did);
      if (nextDish) router.replace(`/potlucks/${pid}/dishes/${nextDish.id}/rate` as any);
      else router.back();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <Screen footer={manualScoring.length === 0 ? undefined : (
      <Button size="lg" icon="trophy-outline" title={busy ? 'Submitting…' : 'Submit Rating'} disabled={!complete} loading={busy} onPress={submit} />
    )}>
      <PageHeader title="Rate this dish" actions={<Avatar uid={uid} profile={profile} size={40} />} />

      <Tile tone="peach" style={{ padding: 14, marginBottom: 12, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="trophy-outline" size={22} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.small, { color: colors.coral, fontWeight: '600' }]}>{potluck.title}</Text>
          <Text style={[type.body, type.bold]}>Rate {authorFirst ? `${authorFirst}’s` : 'this'} dish before the challenge closes</Text>
          <Text style={[type.small, type.muted]}>{left} dish{left === 1 ? '' : 'es'} left{closes ? ` · closes in ${formatDuration(closes - now)}` : ''}</Text>
        </View>
      </Tile>

      <Tile tone="lilac" style={{ padding: 14, marginBottom: 16, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 96, height: 76, borderRadius: 12, overflow: 'hidden' }}><FsImage src={dish.photo} accessibilityLabel={dish.name} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.h3]} numberOfLines={1}>{dish.name}</Text>
          <Text style={[type.small, type.muted]}>Made by {author?.displayName ?? '…'}</Text>
          <Text style={[type.small, { color: colors.danger }]}>Your rating is <Text style={type.bold}>anonymous</Text></Text>
        </View>
      </Tile>

      {aiScoring.length > 0 && (
        <Stack gap={12} style={{ marginBottom: 12 }}>
          {aiScoring.map((c: any) => (
            <HealthScoreMeter key={c.id} title={c.name} variant="reveal" score={healthPoints(dish, c.id)} />
          ))}
        </Stack>
      )}

      {manualScoring.length === 0 ? (
        <Tile tone="mint" style={{ padding: 14 }}>
          <Text style={[type.body, { color: colors.mintDark }]}>Health scores are calculated for each dish.</Text>
        </Tile>
      ) : (
      <Stack gap={12} style={{ marginBottom: 16 }}>
        {manualScoring.map((c: any) => (
          <Card key={c.id} style={{ padding: 16 }}>
            <Row justify="space-between">
              <Text style={type.h3}>{c.name}</Text>
              <Chip tone={scores[c.id] ? 'green' : 'peach'}>{`${scores[c.id] ?? 0} / 5`}</Chip>
            </Row>
            <Text style={[type.small, type.muted, { marginTop: 2, marginBottom: 10 }]}>{PROMPTS[c.name] ?? c.description}</Text>
            <StarRating label={c.name} value={scores[c.id] ?? 0} onChange={(v) => setScores((sc) => ({ ...sc, [c.id]: v }))} />
            {scores[c.id] ? <Text style={[type.small, { color: colors.mint, fontWeight: '600', marginTop: 8 }]}>✓ {scores[c.id]} of 5 selected</Text> : null}
          </Card>
        ))}
      </Stack>
      )}

      {error ? <Banner style={{ marginBottom: 12 }}>{error}</Banner> : null}
      {manualScoring.length > 0 && (complete
        ? <Tile tone="mint" style={{ paddingVertical: 10, paddingHorizontal: 14 }}><Text style={[type.small, { color: colors.mintDark }]}>✓ Ready to submit. All ratings are complete.</Text></Tile>
        : <Text style={[type.small, type.muted]}>Rate {manualScoring.length === 1 ? manualScoring[0].name : `all ${manualScoring.length} guest categories`} to submit. Votes are final.</Text>)}
    </Screen>
  );
}
