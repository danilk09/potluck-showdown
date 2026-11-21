import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/AuthContext';
import { useMyPotlucks, useRecipeBank } from '../../../hooks/useFirestore';
import { useProfiles } from '../../../hooks/useProfiles';
import { DIETARY_LABELS } from '../../../lib/formats';
import { healthPoints } from '../../../lib/healthScore';
import { overallScore, toMillis } from '../../../lib/scoring';
import { formatDate } from '../../../lib/dates';
import {
  Button, Card, Chip, ChipToggleGroup, EmptyState, Facts, FsImage, Icon, Input, Loading, PageHeader, Row, Screen, Segmented, SelectField,
} from '../../../components/ui';
import { colors, type } from '../../../theme';

const SORTS = [
  { value: 'recent', label: 'Newest' },
  { value: 'top', label: 'Top rated' },
  { value: 'liked', label: 'Most liked' },
  { value: 'az', label: 'A–Z' },
  { value: 'light', label: 'Fewest calories' },
  { value: 'protein', label: 'Most protein' },
];

type Show = 'all' | 'saved' | 'mine';

/**
 * The recipe bank: every dish from every potluck the user attended.
 */
export default function RecipeBank() {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const { data: potlucks } = useMyPotlucks();
  const params = useLocalSearchParams<{ show?: string }>();
  const asShow = (v?: string): Show | null => (v === 'mine' || v === 'saved' ? v : null);
  const [show, setShow] = useState<Show>(asShow(params.show) ?? 'all');
  // Opened from Profile → "Dishes shared": the tab may already be mounted, so follow a new param.
  const [seenParam, setSeenParam] = useState(params.show);
  if (params.show !== seenParam) {
    setSeenParam(params.show);
    const next = asShow(params.show);
    if (next) setShow(next);
  }
  // Live: new dishes and newly joined potlucks show up without a reload.
  const { data: recipes, loading } = useRecipeBank();
  const [search, setSearch] = useState('');
  const [potluckFilter, setPotluckFilter] = useState('');
  const [dietary, setDietary] = useState<string[]>([]);
  const [sort, setSort] = useState('recent');
  const lookup = useProfiles(recipes.map((r) => r.authorId));

  const results = useMemo(() => {
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    return recipes
      .map((r) => ({ ...r, overall: overallScore(r, r.potluck.scoring) }))
      .filter((r) => show === 'all' || (show === 'saved' ? r.savedBy?.includes(uid) : r.authorId === uid))
      .filter((r) => !potluckFilter || r.potluck.id === potluckFilter)
      .filter((r) => dietary.every((d) => r.dietary?.includes(d)))
      .filter((r) => {
        if (!terms.length) return true;
        const haystack = [
          r.name, r.steps, r.potluck.title, r.potluck.theme, lookup(r.authorId)?.displayName,
          ...(r.ingredients ?? []), ...(r.dietary ?? []),
          r.potluck.dishCategories?.find((c: any) => c.id === r.categoryId)?.name,
        ].join(' ').toLowerCase();
        return terms.every((t) => haystack.includes(t));
      })
      .sort((a, b) => {
        if (sort === 'top') return (b.overall ?? -1) - (a.overall ?? -1);
        if (sort === 'liked') return (b.likedBy?.length ?? 0) - (a.likedBy?.length ?? 0);
        if (sort === 'az') return a.name.localeCompare(b.name);
        if (sort === 'light') return (a.calories ?? Infinity) - (b.calories ?? Infinity);
        if (sort === 'protein') return (b.protein ?? -1) - (a.protein ?? -1);
        return toMillis(b.potluck.startsAt) - toMillis(a.potluck.startsAt);
      });
  }, [recipes, search, potluckFilter, dietary, sort, lookup, show, uid]);

  const filtered = Boolean(search || potluckFilter || dietary.length || show !== 'all');
  const savedCount = recipes.filter((r) => r.savedBy?.includes(uid)).length;
  const SHOW: { value: Show; label: string }[] = [
    { value: 'all', label: 'Everyone’s' },
    { value: 'saved', label: `Saved (${savedCount})` },
    { value: 'mine', label: 'My dishes' },
  ];

  return (
    <Screen inTabs wide>
      <PageHeader title="Recipe bank" back={false} />
      <Segmented options={SHOW} value={show} onChange={setShow} style={{ marginBottom: 10 }} />

      <View style={{ justifyContent: 'center', marginBottom: 8 }}>
        <Input
          style={{ borderRadius: 999, paddingLeft: 42 }}
          placeholder="Search dishes, ingredients, people…"
          accessibilityLabel="Search recipes"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <Icon name="search" size={18} color={colors.muted} style={{ position: 'absolute', left: 16 }} />
      </View>
      <Row gap={8} style={{ marginBottom: 8 }}>
        <SelectField size="sm" style={{ flex: 7 }} value={potluckFilter} onChange={setPotluckFilter}
          options={[{ value: '', label: 'All potlucks' }, ...potlucks.map((p) => ({ value: p.id, label: p.title }))]} />
        <SelectField size="sm" style={{ flex: 5 }} value={sort} onChange={setSort} options={SORTS} />
      </Row>
      <View style={{ marginBottom: 16 }}>
        <ChipToggleGroup scroll options={DIETARY_LABELS.slice(0, 6)} value={dietary} onChange={setDietary} />
      </View>

      {loading ? <Loading label="Gathering your recipes…" /> : results.length === 0 ? (
        <EmptyState emoji={filtered ? '🔍' : '📖'} title={filtered ? 'No matching recipes' : 'Your recipe bank is empty'}
          action={filtered ? <Button variant="outline" title="Clear filters" onPress={() => { setSearch(''); setPotluckFilter(''); setDietary([]); setShow('all'); }} /> : null}>
          {show === 'saved' && !search && !potluckFilter && !dietary.length
            ? 'Tap Save on any recipe to keep it here.'
            : filtered ? 'Try a different search or filter.' : 'Join a potluck and recipes from it will collect here.'}
        </EmptyState>
      ) : (
        <>
          <Text style={[type.small, type.muted, { marginBottom: 8 }]}>{results.length} recipe{results.length === 1 ? '' : 's'}</Text>
          <View style={s.grid}>
            {results.map((r) => (
              <View key={`${r.potluck.id}/${r.id}`} style={s.cell}>
                <Card style={s.card} onPress={() => router.push(`/potlucks/${r.potluck.id}/dishes/${r.id}` as any)} accessibilityLabel={r.name}>
                  <View style={s.thumb}><FsImage src={r.photo} /></View>
                  <View style={{ flex: 1, minWidth: 0, paddingVertical: 2, gap: 6 }}>
                    <Row gap={6}>
                      <Text style={[type.body, type.bold, { flex: 1 }]} numberOfLines={2}>{r.name}</Text>
                      {r.savedBy?.includes(uid) && <Icon name="bookmark" size={16} color={colors.coral} />}
                    </Row>
                    <Facts size="sm" items={[
                      { label: 'Calories', value: r.calories != null ? `${r.calories} kcal` : null },
                      { label: 'Protein', value: r.protein != null ? `${r.protein} g` : null },
                      ...r.potluck.scoring.filter((c: any) => c.mode === 'ai').slice(0, 1).map((c: any) => {
                        const points = healthPoints(r, c.id);
                        return { label: 'Health', value: points != null ? `${points}/100` : null, tone: 'good' as const };
                      }),
                      { label: 'Rating', value: r.potluck.status === 'closed' && r.overall != null ? `${r.overall.toFixed(1)}/5` : null },
                    ]} />
                    {r.dietary?.length > 0 && (
                      <Row wrap gap={4}>{r.dietary.slice(0, 3).map((d: string) => <Chip key={d} tone="green">{d}</Chip>)}</Row>
                    )}
                    <Text style={[type.small, type.muted]} numberOfLines={1}>
                      by {lookup(r.authorId)?.displayName ?? '…'} · {r.potluck.title} · {formatDate(r.potluck.startsAt)}
                    </Text>
                  </View>
                </Card>
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { flexGrow: 1, flexBasis: 320, maxWidth: '100%' },
  card: { flexDirection: 'row', gap: 12, padding: 10 },
  thumb: { width: 88, height: 88, borderRadius: 12, overflow: 'hidden' },

});
