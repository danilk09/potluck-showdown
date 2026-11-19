import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/AuthContext';
import { useDishes, useMyPotlucks, useMyRatings, useNow } from '../../../hooks/useFirestore';
import { friendlyError, toggleLike } from '../../../data/api';
import { PHASE_CHIP, PHASE_LABEL, phaseOf, Phase } from '../../../lib/phase';
import { formatInfo } from '../../../lib/formats';
import { formatWhen } from '../../../lib/dates';
import { rankDishes, toMillis } from '../../../lib/scoring';
import { tapFeedback } from '../../../lib/platform';
import { AuthorLine } from '../../../components/Avatar';
import JoinDialog from '../../../components/JoinDialog';
import {
  Button, Card, Chip, FsImage, Icon, IconButton, Loading, OptionSheet, Row, Screen, Stack, Stars, useSinglePress, useToast,
  EmptyState,
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
  const [menu, setMenu] = useState(false);
  const mine = dish.authorId === user?.uid;
  const liked = Boolean(dish.likedBy?.includes(user?.uid));
  const category = potluck.dishCategories?.find((c: any) => c.id === dish.categoryId);
  const detail = `/potlucks/${potluck.id}/dishes/${dish.id}`;
  const open = useSinglePress(() => router.push(detail as any))!;
  return (
    <Card style={{ overflow: 'hidden' }}>
      <OptionSheet visible={menu} onClose={() => setMenu(false)} title={dish.name} options={[
        { label: 'View recipe', icon: 'document-text-outline', onPress: open },
        ...(mine && phase === 'open' ? [{ label: 'Edit my dish', icon: 'pencil' as any, onPress: () => router.push({ pathname: `/potlucks/${potluck.id}/dish` as any, params: { did: dish.id } }) }] : []),
      ]} />
      <Row style={{ padding: 14, paddingBottom: 10 }}>
        <AuthorLine uid={dish.authorId} sub={category?.name} />
        <IconButton name="ellipsis-horizontal" onPress={() => setMenu(true)} accessibilityLabel="Dish options" />
      </Row>
      <Pressable onPress={open} accessibilityLabel={dish.name} style={s.photo}>
        <FsImage src={dish.photo} accessibilityLabel={dish.name} />
      </Pressable>
      <Stack gap={8} style={{ padding: 14 }}>
        <Text style={[type.h4, { fontSize: 18 }]} onPress={open}>{dish.name}</Text>
        <Row justify="space-between">
          <LikeButton liked={liked} count={dish.likedBy?.length ?? 0} onPress={() => onLike(dish, liked)} />
          {phase === 'closed' ? <Stars value={dish.overall} />
            : mine ? <Chip tone="plain">Your dish</Chip>
              : phase === 'voting' ? (rated
                ? <Chip tone="green" icon="checkmark" onPress={() => router.push(`${detail}/rate` as any)}>Rated · Change</Chip>
                : <Button size="sm" variant="soft" icon="star" title="Rate Dish" style={{ borderRadius: 999 }} onPress={() => router.push(`${detail}/rate` as any)} />)
                : null}
        </Row>
        <Row wrap gap={6}>
          <Chip tone="peach" onPress={open}>Recipe</Chip>
          {dish.prepMinutes != null && <Text style={[type.small, type.muted]}>{dish.prepMinutes} min</Text>}
          {dish.calories != null && <Text style={[type.small, type.muted]}>· {dish.calories} kcal</Text>}
          {dish.dietary?.slice(0, 2).map((d: string) => <Text key={d} style={[type.small, type.muted]}>· {d.toLowerCase()}</Text>)}
        </Row>
      </Stack>
    </Card>
  );
}

export default function Feed() {
  const params = useLocalSearchParams<{ pid?: string }>();
  const toast = useToast();
  const now = useNow();
  const [joining, setJoining] = useState(false);
  const { data: potlucks, loading } = useMyPotlucks();
  const pid = typeof params.pid === 'string' ? params.pid : defaultPotluck(potlucks, now)?.id;
  const potluck = potlucks.find((p) => p.id === pid);
  const { data: dishes, loading: dishesLoading } = useDishes(potluck?.id, Boolean(potluck));
  const { ratings } = useMyRatings(potluck?.id, Boolean(potluck));
  const phase = phaseOf(potluck, now);

  const sorted = useMemo(() => {
    if (!potluck) return [];
    if (phase === 'closed') return rankDishes(dishes, potluck.scoring);
    return [...dishes].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }, [dishes, potluck, phase]);

  const onLike = async (dish: any, liked: boolean) => {
    if (!potluck) return;
    tapFeedback();
    try {
      await toggleLike(potluck.id, dish.id, liked);
    } catch (err) {
      toast(friendlyError(err), 'danger');
    }
  };

  return (
    <Screen inTabs wide>
      <JoinDialog visible={joining} onClose={() => setJoining(false)} />
      <Text style={[type.h2, { textTransform: 'uppercase', marginBottom: 12 }]}>Food Feed</Text>

      {loading ? <Loading /> : !potluck ? (
        <EmptyState emoji="📸" title="Nothing on the menu yet"
          action={potlucks.length
            ? <Button title="Choose a potluck" onPress={() => router.push('/feed-select')} />
            : <Button title="Join a potluck" onPress={() => setJoining(true)} />}>
          {params.pid ? 'You’re not part of that potluck.' : 'Dishes from your potlucks show up here.'}
        </EmptyState>
      ) : (
        <>
          <Card style={s.current}>
            <View style={s.thumb}><FsImage src={potluck.coverImage} fallback={formatInfo(potluck.format).emoji} /></View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[type.small, type.muted]}>Showing dishes from</Text>
              <Text style={[type.body, type.heavy]} numberOfLines={1}>{potluck.title}</Text>
              <Row gap={6} wrap>
                <Chip tone={PHASE_CHIP[phase] as any}>{PHASE_LABEL[phase]}</Chip>
                <Text style={[type.small, type.muted]}>{formatWhen(potluck.startsAt)}</Text>
              </Row>
            </View>
            <Button size="sm" variant="soft" icon="swap-horizontal" title="Change"
              accessibilityLabel="Choose a different potluck"
              onPress={() => router.push({ pathname: '/feed-select', params: { pid: potluck.id } })} />
          </Card>
          <Row gap={16} style={{ marginBottom: 16 }}>
            <Button variant="link" size="sm" icon="information-circle-outline" title="Event details" onPress={() => router.push(`/potlucks/${potluck.id}` as any)} />
            {phase === 'closed' && (
              <Button variant="link" size="sm" icon="trophy-outline" title="Leaderboard"
                onPress={() => router.push(`/potlucks/${potluck.id}/results` as any)} />
            )}
          </Row>
          {dishesLoading ? <Loading /> : sorted.length === 0 ? (
            <EmptyState emoji="🍽️" title="No dishes yet"
              action={phase === 'open' ? <Button title="Add your dish" onPress={() => router.push(`/potlucks/${potluck.id}/dish` as any)} /> : undefined}>
              Be the first to share what you’re bringing.
            </EmptyState>
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
  current: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, marginBottom: 8 },
  thumb: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  cell: { flexGrow: 1, flexBasis: 320, maxWidth: '100%' },
});
