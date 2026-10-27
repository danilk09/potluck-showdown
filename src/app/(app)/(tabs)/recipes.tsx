import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMyPotlucks } from '../../../hooks/useFirestore';
import { useProfiles } from '../../../hooks/useProfiles';
import { friendlyError, loadRecipeBank } from '../../../data/api';
import { DIETARY_LABELS } from '../../../lib/formats';
import { overallScore, toMillis } from '../../../lib/scoring';
import { formatDate } from '../../../lib/dates';
import {
  Banner, Button, Card, Chip, ChipToggleGroup, EmptyState, FsImage, Icon, Input, Loading, PageHeader, Row, Screen, SelectField, Stars,
} from '../../../components/ui';
import { colors, type } from '../../../theme';

const SORTS = [
  { value: 'recent', label: 'Newest' },
  { value: 'top', label: 'Top rated' },
  { value: 'liked', label: 'Most liked' },
  { value: 'az', label: 'A–Z' },
];

/**
 * The recipe bank: every dish from every potluck the user attended.
 */
export default function RecipeBank() {
  const { data: potlucks, loading } = useMyPotlucks();
  const [recipes, setRecipes] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [potluckFilter, setPotluckFilter] = useState('');
  const [dietary, setDietary] = useState<string[]>([]);
  const [sort, setSort] = useState('recent');
  const lookup = useProfiles(recipes?.map((r) => r.authorId) ?? []);
  const potluckKey = potlucks.map((p) => p.id).join(',');

  useEffect(() => {
    if (loading) return undefined;
    let alive = true;
    loadRecipeBank(potlucks)
      .then((r) => {
        if (alive) setRecipes(r);
      })
      .catch((err) => {
        if (alive) setError(friendlyError(err));
      });
    return () => { alive = false; };
    // Reload when the set of potlucks changes, not on every snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, potluckKey]);

  const results = useMemo(() => {
    if (!recipes) return [];
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    return recipes
      .map((r) => ({ ...r, overall: overallScore(r, r.potluck.scoring) }))
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
        return toMillis(b.potluck.startsAt) - toMillis(a.potluck.startsAt);
      });
  }, [recipes, search, potluckFilter, dietary, sort, lookup]);

  const filtered = Boolean(search || potluckFilter || dietary.length);

  return (
    <Screen inTabs wide>
      <PageHeader title="Recipe bank" back={false} />
      <Text style={[type.body, type.muted, { marginBottom: 12 }]}>Recipes from every potluck you’ve attended, ready to recreate.</Text>

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

      {error ? <Banner style={{ marginBottom: 12 }}>{error}</Banner> : null}
      {loading || (!recipes && !error) ? <Loading label="Gathering your recipes…" /> : results.length === 0 ? (
        <EmptyState emoji={filtered ? '🔍' : '📖'} title={filtered ? 'No matching recipes' : 'Your recipe bank is empty'}
          action={filtered ? <Button variant="outline" title="Clear filters" onPress={() => { setSearch(''); setPotluckFilter(''); setDietary([]); }} /> : null}>
          {filtered ? 'Try a different search or filter.' : 'Join a potluck and recipes from it will collect here.'}
        </EmptyState>
      ) : (
        <>
          <Text style={[type.small, type.muted, { marginBottom: 8 }]}>{results.length} recipe{results.length === 1 ? '' : 's'}</Text>
          <View style={s.grid}>
            {results.map((r) => (
              <View key={`${r.potluck.id}/${r.id}`} style={s.cell}>
                <Card style={s.card} onPress={() => router.push(`/potlucks/${r.potluck.id}/dishes/${r.id}` as any)} accessibilityLabel={r.name}>
                  <View style={s.thumb}><FsImage src={r.photo} /></View>
                  <View style={{ flex: 1, minWidth: 0, paddingVertical: 4, gap: 2 }}>
                    <Text style={[type.body, type.bold]} numberOfLines={1}>{r.name}</Text>
                    <Text style={[type.small, type.muted]} numberOfLines={1}>by {lookup(r.authorId)?.displayName ?? '…'}</Text>
                    <Text style={[type.small, { color: colors.coral }]} numberOfLines={1}>{r.potluck.title} · {formatDate(r.potluck.startsAt)}</Text>
                    <Row gap={8} style={{ marginTop: 4 }}>
                      {r.potluck.status === 'closed' && <Stars small value={r.overall} />}
                      {r.dietary?.[0] && <Chip tone="green">{r.dietary[0]}</Chip>}
                    </Row>
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
  card: { flexDirection: 'row', gap: 12, padding: 8 },
  thumb: { width: 92, height: 92, borderRadius: 12, overflow: 'hidden' },
});
