import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../../../../hooks/AuthContext';
import { useDocData, useMyRatings, usePotluck } from '../../../../../../hooks/useFirestore';
import { friendlyError, toggleLike } from '../../../../../../data/api';
import { phaseOf } from '../../../../../../lib/phase';
import { categoryAverage, overallScore } from '../../../../../../lib/scoring';
import { formatDate } from '../../../../../../lib/dates';
import { shareLink, tapFeedback } from '../../../../../../lib/platform';
import { AuthorLine } from '../../../../../../components/Avatar';
import {
  Button, Card, Chip, EmptyState, FsImage, Icon, IconButton, LoadingScreen, PageHeader, ProgressBar, Row, Screen, Stars, Tile, useToast,
} from '../../../../../../components/ui';
import { colors, type } from '../../../../../../theme';

export default function DishDetail() {
  const { pid, did } = useLocalSearchParams<{ pid: string; did: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const { data: potluck, loading } = usePotluck(pid);
  const uid = user?.uid || '';
  const isMember = Boolean(potluck?.memberIds.includes(uid));
  const { data: dish, loading: dishLoading, error } = useDocData(isMember ? `potlucks/${pid}/dishes/${did}` : null);
  const { ratings } = useMyRatings(pid, isMember);

  if (loading || (isMember && dishLoading)) return <LoadingScreen />;
  if (!potluck || !isMember || !dish || error) {
    return (
      <Screen>
        <PageHeader title="Recipe" />
        <EmptyState emoji="🔒" title="Recipe unavailable">Recipes are only visible to people who attended that potluck.</EmptyState>
      </Screen>
    );
  }

  const phase = phaseOf(potluck);
  const mine = dish.authorId === uid;
  const myRating = ratings.get(dish.id);
  const liked = Boolean(dish.likedBy?.includes(uid));
  const category = potluck.dishCategories.find((c: any) => c.id === dish.categoryId);
  const overall = overallScore(dish, potluck.scoring);

  const like = async () => {
    tapFeedback();
    try {
      await toggleLike(pid, dish.id, liked);
    } catch (err) {
      toast(friendlyError(err), 'danger');
    }
  };

  // Sharing text only. Recipes stay private to attendees, so no link is shared.
  const share = async () => {
    const text = `${dish.name}\n\nIngredients:\n${(dish.ingredients ?? []).map((i: string) => `• ${i}`).join('\n')}${dish.steps ? `\n\nSteps:\n${dish.steps}` : ''}`;
    const res = await shareLink({ title: dish.name, text });
    if (res === 'copied') toast('Recipe copied');
  };

  return (
    <Screen>
      <PageHeader title="Recipe" actions={<IconButton name="share-social-outline" color={colors.coral} onPress={share} accessibilityLabel="Share recipe" />} />
      <Card style={{ overflow: 'hidden', marginBottom: 16 }}>
        <View style={{ aspectRatio: 16 / 10 }}><FsImage src={dish.photo} accessibilityLabel={dish.name} /></View>
        <View style={{ padding: 14 }}>
          <Row wrap gap={6} style={{ marginBottom: 8 }}>
            {category && <Chip tone="peach">{category.name}</Chip>}
            {dish.dietary?.map((d: string) => <Chip key={d} tone="green">{d}</Chip>)}
          </Row>
          <Text style={[type.h2, { marginBottom: 8 }]} selectable>{dish.name}</Text>
          <Row justify="space-between" gap={8}>
            <AuthorLine uid={dish.authorId} sub={`${potluck.title} · ${formatDate(potluck.startsAt)}`} />
            <Pressable onPress={like} accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'} hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? colors.coral : colors.muted} />
              <Text style={[type.body, { color: liked ? colors.coral : colors.muted }]}>{dish.likedBy?.length ?? 0}</Text>
            </Pressable>
          </Row>
        </View>
        <Row gap={0} style={{ borderTopWidth: 1, borderTopColor: colors.line }}>
          {[
            ['Serves', dish.serves || '—'],
            ['Prep', dish.prepMinutes != null ? `${dish.prepMinutes} min` : '—'],
            ['Calories', dish.calories != null ? `${dish.calories} kcal` : '—'],
          ].map(([label, value], i) => (
            <View key={label} style={{ flex: 1, padding: 10, alignItems: 'center', borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.line }}>
              <Text style={[type.small, type.muted]}>{label}</Text>
              <Text style={[type.small, type.bold]} numberOfLines={1}>{value}</Text>
            </View>
          ))}
        </Row>
      </Card>

      {phase === 'voting' && !mine && (
        myRating
          ? <Tile tone="mint" style={{ padding: 14, marginBottom: 16 }}><Text style={[type.body, { color: colors.mintDark }]}>✓ You rated this dish. Thanks!</Text></Tile>
          : <Button size="lg" icon="star" title="Rate this dish" style={{ marginBottom: 16 }} onPress={() => router.push(`/potlucks/${pid}/dishes/${did}/rate` as any)} />
      )}
      {mine && phase === 'open' && <Button variant="outline" title="Edit my dish" style={{ marginBottom: 16 }} onPress={() => router.push({ pathname: `/potlucks/${pid}/dish` as any, params: { did } })} />}

      {phase === 'closed' && (
        <Card style={{ padding: 14, marginBottom: 16 }}>
          <Row justify="space-between" style={{ marginBottom: 8 }}>
            <Text style={type.h4}>Final score</Text>
            <Stars value={overall} />
          </Row>
          {potluck.scoring.map((c: any) => {
            const avg = categoryAverage(dish, c.id);
            return (
              <View key={c.id} style={{ marginBottom: 10 }}>
                <Row justify="space-between" style={{ marginBottom: 4 }}>
                  <Text style={type.small}>{c.name}</Text>
                  <Text style={[type.small, type.bold]}>{avg != null ? avg.toFixed(1) : '—'}</Text>
                </Row>
                <ProgressBar value={avg ? avg / 5 : 0} />
              </View>
            );
          })}
          <Text style={[type.small, type.muted]}>
            {dish.ratingCount} vote{dish.ratingCount === 1 ? '' : 's'}{myRating ? ` · you gave ${Object.values(myRating.scores).join(' / ')}` : ''}
          </Text>
        </Card>
      )}

      {dish.allergens?.length > 0 && (
        <Tile tone="gold" style={{ padding: 14, marginBottom: 16, flexDirection: 'row', gap: 8 }}>
          <Icon name="warning-outline" size={18} />
          <Text style={[type.body, { flex: 1 }]}><Text style={type.bold}>Contains:</Text> {dish.allergens.join(', ')}</Text>
        </Tile>
      )}

      <Card style={{ padding: 14, marginBottom: 16 }}>
        <Text style={[type.h4, { marginBottom: 6 }]}>Ingredients</Text>
        {(dish.ingredients ?? []).map((item: string, n: number) => (
          // eslint-disable-next-line react/no-array-index-key
          <Text key={n} style={[type.body, { paddingVertical: 2 }]} selectable>• {item}</Text>
        ))}
      </Card>

      <Card style={{ padding: 14 }}>
        <Text style={[type.h4, { marginBottom: 6 }]}>Recipe</Text>
        {dish.steps ? <Text style={type.body} selectable>{dish.steps}</Text> : <Text style={[type.small, type.muted]}>No written steps were added.</Text>}
        {dish.recipePhoto && (
          <View style={{ marginTop: 12, borderRadius: 12, overflow: 'hidden', aspectRatio: 3 / 4 }}>
            <FsImage src={dish.recipePhoto} accessibilityLabel="Recipe card" fallback="📄" contentFit="contain" />
          </View>
        )}
      </Card>
    </Screen>
  );
}
