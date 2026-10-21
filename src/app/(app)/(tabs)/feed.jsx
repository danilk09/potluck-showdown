import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/AuthContext';
import { useDishes, useMyPotlucks, useMyRatings, useNow } from '../../../hooks/useFirestore';
import { friendlyError, toggleLike } from '../../../data/api';
import { PHASE_CHIP, PHASE_LABEL, phaseOf } from '../../../lib/phase';
import { rankDishes, toMillis } from '../../../lib/scoring';
import { tapFeedback } from '../../../lib/platform';
import { AuthorLine } from '../../../components/Avatar';
import {
  Button, Card, Chip, EmptyState, FsImage, Icon, IconButton, Loading, OptionSheet, Row, Screen, Stack, Stars, useToast,
} from '../../../components/ui';
import { colors, type } from '../../../theme';

/** Picks the potluck people most likely want: live voting, then the next one, then the latest. */
function defaultPotluck(potlucks, now = Date.now()) {
  const byPhase = (ph) => potlucks.filter((p) => phaseOf(p, now) === ph);
  return byPhase('voting')[0]
    ?? byPhase('open').sort((a, b) => toMillis(a.startsAt) - toMillis(b.startsAt))[0]
    ?? [...potlucks].sort((a, b) => toMillis(b.startsAt) - toMillis(a.startsAt))[0];
}

function LikeButton({ liked, count, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'} accessibilityState={{ selected: liked }}
      hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }}>
      <Icon name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? colors.coral : colors.muted} />
      <Text style={[type.body, { color: liked ? colors.coral : colors.muted }]}>{count}</Text>
    </Pressable>
  );
}

function DishCard({ dish, potluck, phase, rated, onLike }) {
  const { user } = useAuth();
  const [menu, setMenu] = useState(false);
  const mine = dish.authorId === user.uid;
  const liked = Boolean(dish.likedBy?.includes(user.uid));
  const category = potluck.dishCategories.find((c) => c.id === dish.categoryId);
  const detail = `/potlucks/${potluck.id}/dishes/${dish.id}`;
  const open = () => router.push(detail);
  return (
    <Card style={{ overflow: 'hidden' }}>
      <OptionSheet visible={menu} onClose={() => setMenu(false)} title={dish.name} options={[
        { label: 'View recipe', icon: 'document-text-outline', onPress: open },
        ...(mine && phase === 'open' ? [{ label: 'Edit my dish', icon: 'pencil', onPress: () => router.push({ pathname: `/potlucks/${potluck.id}/dish`, params: { did: dish.id } }) }] : []),
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
                ? <Chip tone="green" icon="checkmark">Rated</Chip>
                : <Button size="sm" variant="soft" icon="star" title="Rate Dish" style={{ borderRadius: 999 }} onPress={() => router.push(`${detail}/rate`)} />)
                : null}
        </Row>
        <Row wrap gap={6}>
          <Chip tone="peach" onPress={open}>Recipe</Chip>
          {dish.prepMinutes != null && <Text style={[type.small, type.muted]}>{dish.prepMinutes} min</Text>}
          {dish.calories != null && <Text style={[type.small, type.muted]}>· {dish.calories} kcal</Text>}
          {dish.dietary?.slice(0, 2).map((d) => <Text key={d} style={[type.small, type.muted]}>· {d.toLowerCase()}</Text>)}
        </Row>
      </Stack>
    </Card>
  );
}

export default function Feed() {
  const params = useLocalSearchParams();
  const toast = useToast();
  const now = useNow();
  const [picker, setPicker] = useState(false);
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

  const onLike = async (dish, liked) => {
    tapFeedback();
    try {
      await toggleLike(potluck.id, dish.id, liked);
    } catch (err) {
      toast(friendlyError(err), 'danger');
    }
  };

  return (
    <Screen inTabs wide>
      <OptionSheet visible={picker} onClose={() => setPicker(false)} title="Choose potluck" options={potlucks.map((p) => ({
        key: p.id, label: p.title, sub: PHASE_LABEL[phaseOf(p, now)], selected: p.id === pid, onPress: () => router.setParams({ pid: p.id }),
      }))} />
      <Row justify="space-between" style={{ marginBottom: 8, minHeight: 44 }}>
        <Text style={[type.h2, { textTransform: 'uppercase' }]}>Food Feed</Text>
        {potlucks.length > 0 && (
          <Pressable onPress={() => setPicker(true)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '55%' }}>
            <Text style={[type.body, type.bold, { color: colors.coral, flexShrink: 1 }]} numberOfLines={1}>{potluck?.title ?? 'Choose potluck'}</Text>
            <Icon name="chevron-down" size={16} color={colors.coral} />
          </Pressable>
        )}
      </Row>

      {loading ? <Loading /> : !potluck ? (
        <EmptyState emoji="📸" title="Nothing on the menu yet" action={<Button title="Join a potluck" onPress={() => router.push('/join')} />}>
          {params.pid ? 'You’re not part of that potluck.' : 'Dishes from your potlucks show up here.'}
        </EmptyState>
      ) : (
        <>
          <Row gap={12} style={{ marginBottom: 16 }}>
            <Chip tone={PHASE_CHIP[phase]}>{PHASE_LABEL[phase]}</Chip>
            <Button variant="link" size="sm" title="Event details" onPress={() => router.push(`/potlucks/${potluck.id}`)} />
            {phase === 'closed' && (
              <Button variant="link" size="sm" title="Leaderboard" iconRight="chevron-forward" style={{ marginLeft: 'auto' }}
                onPress={() => router.push(`/potlucks/${potluck.id}/results`)} />
            )}
          </Row>
          {dishesLoading ? <Loading /> : sorted.length === 0 ? (
            <EmptyState emoji="🍽️" title="No dishes yet"
              action={phase === 'open' && <Button title="Add your dish" onPress={() => router.push(`/potlucks/${potluck.id}/dish`)} />}>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  cell: { flexGrow: 1, flexBasis: 320, maxWidth: '100%' },
});
