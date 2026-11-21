import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../../../../hooks/AuthContext';
import { useDocData, useMyRatings, usePotluck } from '../../../../../../hooks/useFirestore';
import { friendlyError, recalculateDishHealth, toggleLike, toggleSave } from '../../../../../../data/api';
import { HealthScoreMeter } from '../../../../../../components/HealthScoreMeter';
import { healthPoints } from '../../../../../../lib/healthScore';
import { phaseOf } from '../../../../../../lib/phase';
import { categoryAverage, overallScore } from '../../../../../../lib/scoring';
import { formatDate } from '../../../../../../lib/dates';
import { formatServes } from '../../../../../../lib/formats';
import { shareLink, tapFeedback } from '../../../../../../lib/platform';
import { AuthorLine } from '../../../../../../components/Avatar';
import {
  Button, Card, Chip, EmptyState, Facts, FsImage, Icon, IconButton, LoadingScreen, PageHeader, ProgressBar, Row, Screen, Stars, Tile, useToast,
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
  const [savingScore, setSavingScore] = useState(false);

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
  const saved = Boolean(dish.savedBy?.includes(uid));
  const category = potluck.dishCategories.find((c: any) => c.id === dish.categoryId);
  const overall = overallScore(dish, potluck.scoring);
  const aiScoring = potluck.scoring.filter((c: any) => c.mode === 'ai');
  const needsVotes = potluck.scoring.some((c: any) => c.mode !== 'ai');

  const calculateScore = async () => {
    if (savingScore) return;
    setSavingScore(true);
    try {
      await recalculateDishHealth(pid, dish.id);
      toast('Health score saved');
    } catch (err) {
      toast(friendlyError(err), 'danger');
    } finally {
      setSavingScore(false);
    }
  };

  const like = async () => {
    tapFeedback();
    try {
      await toggleLike(pid, dish.id, liked);
    } catch (err) {
      toast(friendlyError(err), 'danger');
    }
  };

  const save = async () => {
    tapFeedback();
    try {
      toast((await toggleSave(dish.id)) ? 'Saved. Find it under Saved in the Recipes tab.' : 'Removed from saved recipes');
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
      <PageHeader title="Recipe" actions={(
        <Row gap={4}>
          <Button size="sm" variant={saved ? 'soft' : 'outline'} icon={saved ? 'bookmark' : 'bookmark-outline'} title={saved ? 'Saved' : 'Save'}
            accessibilityLabel={saved ? 'Remove from saved recipes' : 'Save recipe'} onPress={save} />
          <IconButton name="share-social-outline" color={colors.coral} onPress={share} accessibilityLabel="Share recipe" />
        </Row>
      )} />
      <Card style={{ overflow: 'hidden', marginBottom: 16 }}>
        <View style={{ aspectRatio: 16 / 10 }}><FsImage src={dish.photo} accessibilityLabel={dish.name} /></View>
        <View style={{ padding: 14 }}>
          <Row wrap gap={6} style={{ marginBottom: 8 }}>
            {category && <Chip tone="peach">{category.name}</Chip>}
            {dish.dietary?.map((d: string) => <Chip key={d} tone="green">{d}</Chip>)}
          </Row>
          <Text style={[type.h2, { marginBottom: 8 }]} selectable>{dish.name}</Text>
          <Facts style={{ marginBottom: 12 }} items={[
            { label: 'Calories', value: dish.calories != null ? `${dish.calories} kcal` : '—' },
            { label: 'Protein', value: dish.protein != null ? `${dish.protein} g` : '—' },
            ...aiScoring.map((c: any) => {
              const points = healthPoints(dish, c.id);
              return { label: c.name, value: points != null ? `${points}/100` : '—', tone: 'good' as const };
            }),
            { label: 'Serves', value: formatServes(dish.serves) },
            { label: 'Prep', value: dish.prepMinutes != null ? `${dish.prepMinutes} min` : '—' },
          ]} />
          <Row justify="space-between" gap={8}>
            <AuthorLine uid={dish.authorId} sub={`${potluck.title} · ${formatDate(potluck.startsAt)}`} />
            <Pressable onPress={like} accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'} hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? colors.coral : colors.muted} />
              <Text style={[type.body, { color: liked ? colors.coral : colors.muted }]}>{dish.likedBy?.length ?? 0}</Text>
            </Pressable>
          </Row>
        </View>
      </Card>

      {aiScoring.length > 0 && (
        <View style={{ gap: 8, marginBottom: 16 }}>
          {aiScoring.map((c: any) => {
            const points = healthPoints(dish, c.id);
            return (
              <View key={c.id}>
                <HealthScoreMeter
                  title={c.name}
                  score={points}
                />
              </View>
            );
          })}
          {mine && phase === 'open' && (
            <Button
              variant="link"
              title={savingScore ? 'Calculating health score…' : 'Calculate health score'}
              loading={savingScore}
              style={{ alignSelf: 'flex-start' }}
              onPress={calculateScore}
            />
          )}
        </View>
      )}

      {phase === 'voting' && !mine && needsVotes && (
        myRating
          ? (
            <Tile tone="mint" style={{ padding: 14, marginBottom: 16, gap: 8 }}>
              <Text style={[type.body, { color: colors.mintDark }]}>✓ You rated this dish. Thanks!</Text>
              <Button size="sm" variant="outline" title="Change my vote" style={{ alignSelf: 'flex-start' }} onPress={() => router.push(`/potlucks/${pid}/dishes/${did}/rate` as any)} />
            </Tile>
          )
          : <Button size="lg" icon="star" title="Rate this dish" style={{ marginBottom: 16 }} onPress={() => router.push(`/potlucks/${pid}/dishes/${did}/rate` as any)} />
      )}
      {mine && phase === 'open' && <Button variant="outline" title="Edit my dish" style={{ marginBottom: 16 }} onPress={() => router.push({ pathname: `/potlucks/${pid}/dish` as any, params: { did } })} />}

      {phase === 'closed' && (
        <Card style={{ padding: 14, marginBottom: 16 }}>
          <Row justify="space-between" style={{ marginBottom: 8 }}>
            <Text style={type.h4}>Final score (out of 5)</Text>
            <Stars value={overall} />
          </Row>
          {potluck.scoring.map((c: any) => {
            const points = c.mode === 'ai' ? healthPoints(dish, c.id) : null;
            const avg = c.mode === 'ai' ? (points == null ? null : points / 20) : categoryAverage(dish, c.id);
            const bar = c.mode === 'ai' ? (points ?? 0) / 100 : avg ? avg / 5 : 0;
            return (
              <View key={c.id} style={{ marginBottom: 10 }}>
                <Row justify="space-between" style={{ marginBottom: 4 }}>
                  <Text style={type.small}>{c.name}{c.mode === 'ai' ? ' (AI)' : ' (guest votes)'} · {c.weight}% of score</Text>
                  <Text style={[type.small, type.bold]}>{c.mode === 'ai' ? (points == null ? '—' : `${points}/100`) : avg != null ? `${avg.toFixed(1)}/5` : '—'}</Text>
                </Row>
                <ProgressBar value={bar} color={c.mode === 'ai' ? colors.mint : colors.gold} />
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
        <Text style={[type.h4, { marginBottom: 6 }]}>Steps</Text>
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
