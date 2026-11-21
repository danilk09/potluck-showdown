import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/AuthContext';
import { useDishes, useMyPotlucks, useMyRatings, useNow } from '../../../hooks/useFirestore';
import { friendlyError, reportDish, toggleLike, toggleSave } from '../../../data/api';
import { PHASE_CHIP, PHASE_LABEL, phaseOf, Phase } from '../../../lib/phase';
import { potluckWhen } from '../../../lib/dates';
import { healthPoints } from '../../../lib/healthScore';
import { feedOrder, rankDishes, toMillis } from '../../../lib/scoring';
import { tapFeedback } from '../../../lib/platform';
import { AuthorLine } from '../../../components/Avatar';
import JoinDialog from '../../../components/JoinDialog';
import {
  Banner, Button, Card, Chip, Facts, FsImage, Icon, IconButton, Loading, OptionSheet, PageHeader, ProgressBar, Row, Screen, Segmented, Stack, Stars,
  useToast, EmptyState,
} from '../../../components/ui';
import { colors, type } from '../../../theme';

/**
 * The most recent potluck: one with voting open right now, otherwise the latest one that has
 * already started, otherwise the next one coming up.
 */
function defaultPotluck(potlucks: any[], now: number = Date.now()): any {
  const voting = potlucks.filter((p) => phaseOf(p, now) === 'voting');
  const started = potlucks.filter((p) => toMillis(p.startsAt) <= now);
  const latest = (list: any[]) => [...list].sort((a, b) => toMillis(b.startsAt) - toMillis(a.startsAt))[0];
  return latest(voting) ?? latest(started) ?? [...potlucks].sort((a, b) => toMillis(a.startsAt) - toMillis(b.startsAt))[0];
}

const REPORT_REASONS = ['Inappropriate photo', 'Not food', 'Spam or misleading', 'Other'];

function LikeButton({ liked, count, onPress }: { liked: boolean; count: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'} accessibilityState={{ selected: liked }}
      hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }}>
      <Icon name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? colors.coral : colors.muted} />
      <Text style={[type.body, { color: liked ? colors.coral : colors.muted }]}>{count}</Text>
    </Pressable>
  );
}

function DishCard({ dish, potluck, phase, rated, onLike }: { dish: any; potluck: any; phase: Phase; rated: boolean; onLike: (dish: any, liked: boolean) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const uid = user?.uid ?? '';
  const mine = dish.authorId === uid;
  const liked = Boolean(dish.likedBy?.includes(uid));
  const saved = Boolean(dish.savedBy?.includes(uid));
  const category = potluck.dishCategories?.find((c: any) => c.id === dish.categoryId);
  const detail = `/potlucks/${potluck.id}/dishes/${dish.id}`;
  const open = () => router.push(detail as any);
  const ai = potluck.scoring.find((c: any) => c.mode === 'ai');
  const health = ai ? healthPoints(dish, ai.id) : null;

  const save = async () => {
    try {
      toast((await toggleSave(dish.id)) ? 'Saved to your recipe bank' : 'Removed from saved recipes');
    } catch (err) {
      toast(friendlyError(err), 'danger');
    }
  };
  const report = async (reason: string) => {
    try {
      await reportDish(dish.id, reason);
      toast('Thanks. The photo was reported for review.');
    } catch (err) {
      toast(friendlyError(err), 'danger');
    }
  };

  return (
    <Card style={{ overflow: 'hidden' }} onPress={open} accessibilityLabel={`${dish.name}, open recipe`}>
      <OptionSheet visible={menu} onClose={() => setMenu(false)} title={dish.name} options={[
        { label: 'View recipe', icon: 'document-text-outline', onPress: open },
        { label: saved ? 'Remove from saved recipes' : 'Save recipe', icon: saved ? 'bookmark' : 'bookmark-outline', onPress: save },
        ...(mine && phase === 'open' ? [{ label: 'Edit my dish', icon: 'pencil' as any, onPress: () => router.push({ pathname: `/potlucks/${potluck.id}/dish` as any, params: { did: dish.id } }) }] : []),
        ...(!mine && dish.photo ? [{ label: 'Report photo', icon: 'flag-outline' as any, danger: true, onPress: () => setReporting(true) }] : []),
      ]} />
      <OptionSheet visible={reporting} onClose={() => setReporting(false)} title="Why are you reporting this photo?"
        options={REPORT_REASONS.map((reason) => ({ label: reason, onPress: () => report(reason) }))} />
      <Row style={{ padding: 14, paddingBottom: 10 }}>
        <AuthorLine uid={dish.authorId} sub={category?.name} />
        <IconButton name="ellipsis-horizontal" onPress={() => setMenu(true)} accessibilityLabel="Dish options" />
      </Row>
      <View style={s.photo}>
        <FsImage src={dish.photo} accessibilityLabel={dish.name} />
      </View>
      <Stack gap={10} style={{ padding: 14 }}>
        <Text style={[type.h4, { fontSize: 18 }]}>{dish.name}</Text>
        <Facts size="sm" items={[
          { label: 'Calories', value: dish.calories != null ? `${dish.calories} kcal` : null },
          { label: 'Protein', value: dish.protein != null ? `${dish.protein} g` : null },
          { label: 'Health', value: health != null ? `${health}/100` : null, tone: 'good' },
          { label: 'Prep', value: dish.prepMinutes != null ? `${dish.prepMinutes} min` : null },
        ]} />
        {dish.dietary?.length > 0 && (
          <Row wrap gap={6}>
            {dish.dietary.slice(0, 3).map((d: string) => <Chip key={d} tone="green">{d}</Chip>)}
          </Row>
        )}
        <Row justify="space-between">
          <LikeButton liked={liked} count={dish.likedBy?.length ?? 0} onPress={() => onLike(dish, liked)} />
          {phase === 'closed' ? <Stars value={dish.overall} />
            : mine ? <Text style={[type.small, type.muted]}>Your dish</Text>
              : phase === 'voting' ? (rated
                ? <Button size="sm" variant="outline" icon="checkmark" title="Rated · Change vote" onPress={() => router.push(`${detail}/rate` as any)} />
                : <Button size="sm" icon="star" title="Rate this dish" onPress={() => router.push(`${detail}/rate` as any)} />)
                : <Text style={[type.small, type.link]}>View recipe ›</Text>}
        </Row>
      </Stack>
    </Card>
  );
}

type Filter = 'todo' | 'rated' | 'all';

export default function Feed() {
  const params = useLocalSearchParams<{ pid?: string; from?: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const now = useNow();
  const [joining, setJoining] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const { data: potlucks, loading } = useMyPotlucks();
  const pid = typeof params.pid === 'string' ? params.pid : defaultPotluck(potlucks, now)?.id;
  const potluck = potlucks.find((p) => p.id === pid);
  const { data: dishes, loading: dishesLoading } = useDishes(potluck?.id, Boolean(potluck));
  const { ratings } = useMyRatings(potluck?.id, Boolean(potluck));
  const phase = phaseOf(potluck, now);
  const uid = user?.uid ?? '';
  const voting = phase === 'voting';

  const rateable = dishes.filter((d: any) => d.authorId !== uid);
  const ratedCount = rateable.filter((d: any) => ratings.has(d.id)).length;
  const left = rateable.length - ratedCount;

  const sorted = useMemo(() => {
    if (!potluck) return [];
    if (phase === 'closed') return rankDishes(dishes, potluck.scoring);
    const ordered = feedOrder(dishes);
    if (phase !== 'voting') return ordered;
    // While voting, dishes still waiting for your vote come first, then rated ones, then your own.
    const rank = (d: any) => (d.authorId === uid ? 2 : ratings.has(d.id) ? 1 : 0);
    return ordered
      .filter((d) => filter === 'all' || (filter === 'todo' ? rank(d) === 0 : rank(d) === 1))
      .sort((a, b) => rank(a) - rank(b));
  }, [dishes, potluck, phase, filter, ratings, uid]);

  const onLike = async (dish: any, liked: boolean) => {
    if (!potluck) return;
    tapFeedback();
    try {
      await toggleLike(potluck.id, dish.id, liked);
    } catch (err) {
      toast(friendlyError(err), 'danger');
    }
  };

  const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: `All (${dishes.length})` },
    { value: 'todo', label: `To rate (${left})` },
    { value: 'rated', label: `Rated (${ratedCount})` },
  ];

  return (
    <Screen inTabs wide>
      <JoinDialog visible={joining} onClose={() => setJoining(false)} />
      {params.from === 'event' && potluck
        ? <PageHeader title="Food Feed" onBack={() => router.push(`/potlucks/${potluck.id}` as any)} />
        : <PageHeader title="Food Feed" back={false} />}

      {loading ? <Loading /> : !potluck ? (
        <EmptyState emoji="📸" title="Nothing on the menu yet"
          action={potlucks.length
            ? <Button title="Choose a potluck" onPress={() => router.push('/feed-select')} />
            : <Button title="Join a potluck" onPress={() => setJoining(true)} />}>
          {params.pid ? 'You’re not part of that potluck.' : 'Dishes from your potlucks show up here.'}
        </EmptyState>
      ) : (
        <>
          {/* What's in view: a plain heading with a switcher, not a card, so it doesn't look tappable. */}
          <View style={s.viewing}>
            <Row justify="space-between" align="flex-start" gap={12}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.caps, { color: colors.muted }]}>Showing dishes from</Text>
                <Text style={[type.h3, { marginTop: 2 }]}>{potluck.title}</Text>
              </View>
              <Button size="sm" icon="swap-horizontal" title="Switch potluck"
                onPress={() => router.push({ pathname: '/feed-select', params: { pid: potluck.id } })} />
            </Row>
            <Row gap={8} wrap style={{ marginTop: 6 }}>
              <Chip tone={PHASE_CHIP[phase] as any}>{PHASE_LABEL[phase]}</Chip>
              <Text style={[type.small, type.muted]}>{potluckWhen(potluck)}</Text>
            </Row>
            <Row gap={8} style={{ marginTop: 10 }}>
              <Button style={{ flex: 1 }} size="sm" icon="information-circle-outline" title="Event details"
                onPress={() => router.push(`/potlucks/${potluck.id}` as any)} />
              {phase === 'closed' && (
                <Button style={{ flex: 1 }} size="sm" icon="trophy-outline" title="Results"
                  onPress={() => router.push(`/potlucks/${potluck.id}/results` as any)} />
              )}
            </Row>
          </View>

          {voting && rateable.length > 0 && (
            <View style={{ marginBottom: 14, gap: 8 }}>
              {left === 0 ? (
                <Banner tone="success">{`You’ve rated all ${rateable.length} dishes. You can still change a vote until voting closes.`}</Banner>
              ) : (
                <View style={{ gap: 6 }}>
                  <Text style={[type.body, type.bold]}>
                    {left} dish{left === 1 ? '' : 'es'} left to rate <Text style={[type.small, type.muted]}>· {ratedCount} of {rateable.length} done</Text>
                  </Text>
                  <ProgressBar value={rateable.length ? ratedCount / rateable.length : 0} color={colors.mint} />
                </View>
              )}
              <Segmented options={FILTERS} value={filter} onChange={setFilter} />
            </View>
          )}

          {dishesLoading ? <Loading /> : dishes.length === 0 ? (
            <EmptyState emoji="🍽️" title="No dishes yet"
              action={phase === 'open' ? <Button title="Add your dish" onPress={() => router.push(`/potlucks/${potluck.id}/dish` as any)} /> : undefined}>
              Be the first to share what you’re bringing.
            </EmptyState>
          ) : sorted.length === 0 ? (
            <EmptyState emoji={filter === 'todo' ? '🎉' : '🗳️'} title={filter === 'todo' ? 'Nothing left to rate' : 'No rated dishes yet'}
              action={<Button variant="outline" title="Show all dishes" onPress={() => setFilter('all')} />} />
          ) : (
            <View style={s.grid}>
              {sorted.map((d) => (
                <View key={d.id} style={s.cell}>
                  <DishCard dish={d} potluck={potluck} phase={phase} rated={ratings.has(d.id)} onLike={onLike} />
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  photo: { aspectRatio: 16 / 10, backgroundColor: colors.peachSoft },
  viewing: { paddingBottom: 12, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  cell: { flexGrow: 1, flexBasis: 320, maxWidth: '100%' },
});
