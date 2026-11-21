import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../../../../hooks/AuthContext';
import { useDishes, useMyRatings, useNow, usePotluck } from '../../../../../../hooks/useFirestore';
import { useProfiles } from '../../../../../../hooks/useProfiles';
import { friendlyError, submitRating } from '../../../../../../data/api';
import { phaseOf } from '../../../../../../lib/phase';
import { formatDuration } from '../../../../../../lib/dates';
import { feedOrder, toMillis } from '../../../../../../lib/scoring';
import { healthPoints } from '../../../../../../lib/healthScore';
import { HealthScoreMeter } from '../../../../../../components/HealthScoreMeter';
import { ImpactStyle, tapFeedback } from '../../../../../../lib/platform';
import {
  Banner, Button, Card, Chip, Dialog, EmptyState, FsImage, IconButton, LoadingScreen, PageHeader, ProgressBar, Row, Screen, StarRating,
  Stack, Tile, goToTab, useConfirm, useToast,
} from '../../../../../../components/ui';
import { colors, type } from '../../../../../../theme';

const PROMPTS: Record<string, string> = {
  Deliciousness: 'Would you sneak back for seconds?',
  Healthiness: 'How balanced and nourishing is it?',
  Creativity: 'How unique and creative was the dish?',
  Presentation: 'How good does it look on the plate?',
  'Theme fit': 'How well does it fit the theme?',
};

/** The voting page for this potluck. Back always returns here, however deep the rating screen was opened from. */
const toVoting = (pid?: string) => goToTab({ pathname: '/feed', params: pid ? { pid } : {} });

function Notice({ emoji, title, children, pid }: { emoji?: string; title: string; children?: React.ReactNode; pid?: string }) {
  return (
    <Screen>
      <PageHeader title="Rate this dish" onBack={() => toVoting(pid)} />
      <EmptyState emoji={emoji} title={title}
        action={pid ? <Button title="Back to voting" onPress={() => toVoting(pid)} /> : undefined}>
        {children}
      </EmptyState>
    </Screen>
  );
}

export default function RateDish() {
  const { pid, did } = useLocalSearchParams<{ pid: string; did: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const now = useNow(30_000);
  const [confirmEl, confirm] = useConfirm();
  const { data: potluck, loading } = usePotluck(pid);
  const uid = user?.uid || '';
  const isMember = Boolean(potluck?.memberIds.includes(uid));
  const { data: dishes, loading: dishesLoading } = useDishes(pid, isMember);
  const { ratings, loading: ratingsLoading } = useMyRatings(pid, isMember);
  const dish = dishes.find((d: any) => d.id === did);
  const author = useProfiles([dish?.authorId])(dish?.authorId);
  // Changes the person has made on this screen; anything unchanged falls back to their earlier vote.
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [allDone, setAllDone] = useState(false);

  if (loading || dishesLoading || ratingsLoading) return <LoadingScreen />;
  if (!potluck || !isMember || !dish) return <Notice pid={pid} title="Dish not found" />;

  const phase = phaseOf(potluck, now);
  if (dish.authorId === uid) return <Notice pid={pid} emoji="🙈" title="That’s your dish!">You can’t rate your own dish.</Notice>;
  if (phase !== 'voting') return <Notice pid={pid} emoji="⏳" title={phase === 'open' ? 'Voting hasn’t opened yet' : 'Voting is closed'} />;

  const previous = ratings.get(did);
  const scores: Record<string, number> = { ...previous?.scores, ...edits };
  const rateable = feedOrder(dishes.filter((d: any) => d.authorId !== uid));
  const index = rateable.findIndex((d: any) => d.id === did);
  const ratedCount = rateable.filter((d: any) => ratings.has(d.id)).length;
  const closes = toMillis(potluck.votingClosesAt);
  const manualScoring = potluck.scoring.filter((c: any) => c.mode !== 'ai');
  const aiScoring = potluck.scoring.filter((c: any) => c.mode === 'ai');
  const done = manualScoring.filter((c: any) => scores[c.id]).length;
  const complete = manualScoring.length > 0 && done === manualScoring.length;
  const changed = Object.keys(edits).some((k) => edits[k] !== previous?.scores?.[k]);
  const authorFirst = author?.displayName?.split(' ')[0];

  // Moves to a neighbouring dish without stacking screens. Unsaved stars are confirmed first.
  const go = async (step: number) => {
    const target = rateable[(index + step + rateable.length) % rateable.length];
    if (!target || target.id === did) return;
    if (changed && !(await confirm({ title: 'Leave without saving?', body: 'Your new stars for this dish haven’t been submitted.', confirmLabel: 'Leave' }))) return;
    // "dir" picks the slide direction (see app/(app)/_layout.tsx): back slides in from the left.
    router.replace(`/potlucks/${pid}/dishes/${target.id}/rate?dir=${step < 0 ? 'prev' : 'next'}` as any);
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await submitRating(pid, did, scores);
      tapFeedback(ImpactStyle.Medium);
      const finishedAll = !previous && ratedCount + 1 === rateable.length;
      setEdits({});
      if (finishedAll) setAllDone(true);
      else toast(previous ? 'Vote updated' : 'Rating submitted');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const footer = manualScoring.length === 0 ? undefined : previous && !changed ? (
    <Button size="lg" variant="outline" icon="checkmark" title="Rated ✓" disabled />
  ) : (
    <Button size="lg" icon="trophy-outline" title={busy ? 'Submitting…' : previous ? 'Update my vote' : 'Submit rating'}
      disabled={!complete} loading={busy} onPress={submit} />
  );

  return (
    <Screen footer={footer}>
      {confirmEl}
      <Dialog visible={allDone} onClose={() => setAllDone(false)} title="You’ve rated every dish! 🎉"
        footer={<>
          <Button variant="light" title="Stay here" onPress={() => setAllDone(false)} />
          <Button title="Back to voting" onPress={() => { setAllDone(false); toVoting(pid); }} />
        </>}>
        <Text style={[type.body, type.muted]}>
          All {rateable.length} dishes have your vote. You can change any of them until voting closes.
        </Text>
      </Dialog>
      <PageHeader title="Rate this dish" onBack={() => toVoting(pid)} />

      <View style={{ marginBottom: 12, gap: 6 }}>
        <Row justify="space-between">
          <Text style={[type.small, type.bold]}>{ratedCount} of {rateable.length} dishes rated</Text>
          {closes ? <Text style={[type.small, type.muted]}>Voting closes in {formatDuration(closes - now)}</Text> : null}
        </Row>
        <ProgressBar value={rateable.length ? ratedCount / rateable.length : 0} color={colors.mint} />
      </View>

      <Tile tone="lilac" style={{ padding: 12, marginBottom: 16 }}>
        <Row gap={8}>
          <IconButton name="chevron-back" size={26} color={colors.ink} accessibilityLabel="Previous dish" disabled={rateable.length < 2} onPress={() => go(-1)} />
          <View style={{ width: 84, height: 70, borderRadius: 12, overflow: 'hidden' }}><FsImage src={dish.photo} accessibilityLabel={dish.name} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.small, type.muted]}>Dish {index + 1} of {rateable.length}</Text>
            <Text style={type.h3} numberOfLines={2}>{dish.name}</Text>
            <Text style={[type.small, type.muted]} numberOfLines={1}>Made by {authorFirst ?? '…'}</Text>
          </View>
          <IconButton name="chevron-forward" size={26} color={colors.ink} accessibilityLabel="Next dish" disabled={rateable.length < 2} onPress={() => go(1)} />
        </Row>
        <Row justify="space-between" style={{ marginTop: 8 }}>
          {previous
            ? <Chip tone="green" icon="checkmark">{changed ? 'Rated · unsaved changes' : 'You rated this dish'}</Chip>
            : <Chip tone="peach">Not rated yet</Chip>}
          <Text style={[type.small, type.muted]}>Your rating is anonymous</Text>
        </Row>
      </Tile>

      {aiScoring.length > 0 && (
        <Stack gap={12} style={{ marginBottom: 12 }}>
          {aiScoring.map((c: any) => (
            <HealthScoreMeter key={c.id} title={c.name} score={healthPoints(dish, c.id)} />
          ))}
        </Stack>
      )}

      {manualScoring.length === 0 ? (
        <Tile tone="mint" style={{ padding: 14 }}>
          <Text style={[type.body, { color: colors.mintDark }]}>Every category here is scored by AI, so there’s nothing to vote on.</Text>
        </Tile>
      ) : (
        <Stack gap={12} style={{ marginBottom: 16 }}>
          {manualScoring.map((c: any) => (
            <Card key={c.id} style={{ padding: 16 }}>
              <Row justify="space-between">
                <Text style={type.h3}>{c.name}</Text>
                <Text style={[type.body, type.bold, { color: scores[c.id] ? colors.mintDark : colors.muted }]}>{`${scores[c.id] ?? '–'} / 5`}</Text>
              </Row>
              <Text style={[type.small, type.muted, { marginTop: 2, marginBottom: 10 }]}>{PROMPTS[c.name] ?? c.description}</Text>
              <StarRating label={c.name} value={scores[c.id] ?? 0} onChange={(v) => setEdits((sc) => ({ ...sc, [c.id]: v }))} />
            </Card>
          ))}
        </Stack>
      )}

      {error ? <Banner style={{ marginBottom: 12 }}>{error}</Banner> : null}
      <Row gap={8}>
        <Button style={{ flex: 1 }} variant="light" icon="chevron-back" title="Previous" disabled={rateable.length < 2} onPress={() => go(-1)} />
        <Button style={{ flex: 1 }} variant="light" iconRight="chevron-forward" title="Next dish" disabled={rateable.length < 2} onPress={() => go(1)} />
      </Row>
    </Screen>
  );
}
