import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../../hooks/AuthContext';
import { useDishes, usePotluck } from '../../../../hooks/useFirestore';
import { useProfiles } from '../../../../hooks/useProfiles';
import { healthPoints } from '../../../../lib/healthScore';
import { bracketWinners, categoryAwards, rankDishes, resultsSummary } from '../../../../lib/scoring';
import { FRAMES, FRAME_ORDER } from '../../../../lib/frames';
import { formatDate } from '../../../../lib/dates';
import { shareLink } from '../../../../lib/platform';
import Avatar from '../../../../components/Avatar';
import {
  Button, Card, EmptyState, FsImage, Icon, LoadingScreen, PageHeader, Row, Screen, Stack, Stars, Tile, useToast,
} from '../../../../components/ui';
import { colors, type } from '../../../../theme';

const PLACES = [
  { bg: colors.gold, border: colors.coral, rank: colors.coral },
  { bg: colors.mintSoft, border: undefined, rank: colors.mint },
  { bg: colors.lilacSoft, border: undefined, rank: colors.lilac },
];

export default function Results() {
  const { pid } = useLocalSearchParams<{ pid: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const [showAll, setShowAll] = useState(false);
  const { data: potluck, loading } = usePotluck(pid);
  const uid = user?.uid || '';
  const isMember = Boolean(potluck?.memberIds.includes(uid));
  const { data: dishes, loading: dishesLoading } = useDishes(pid, isMember);
  const ranked = useMemo(() => (potluck ? rankDishes(dishes, potluck.scoring) : []), [dishes, potluck]);
  const lookup = useProfiles(ranked.map((d: any) => d.authorId));

  if (loading || (isMember && dishesLoading)) return <LoadingScreen />;
  if (!potluck || !isMember) return <Screen><PageHeader title="Results" /><EmptyState title="Results unavailable" emoji="🔒" /></Screen>;
  if (potluck.status !== 'closed') {
    return (
      <Screen>
        <PageHeader title="Potluck Competition" />
        <EmptyState emoji="⏳" title="Results aren’t in yet" action={<Button title="Back to event" onPress={() => router.back()} />}>
          The leaderboard appears once the host closes voting and publishes the results.
        </EmptyState>
      </Screen>
    );
  }

  const summary = potluck.results ?? resultsSummary(ranked, potluck.memberIds.length);
  const top = ranked.filter((d: any) => d.overall != null).slice(0, 3);
  const awards = categoryAwards(ranked, potluck.scoring);
  const brackets = potluck.dishCategories.length > 1 ? bracketWinners(ranked, potluck.dishCategories) : [];
  const myPlace = (potluck.podium ?? []).indexOf(uid);
  const name = (authorUid: string) => lookup(authorUid)?.displayName ?? 'Former guest';
  const openDish = (id: string) => router.push(`/potlucks/${pid}/dishes/${id}` as any);

  const share = async () => {
    const lines = top.map((d: any, i: number) => `${['🥇', '🥈', '🥉'][i]} ${d.name} by ${name(d.authorId)} (${d.overall.toFixed(1)}/5)`);
    const res = await shareLink({ title: `${potluck.title} results`, text: `🍲 ${potluck.title}: the votes are in!\n${lines.join('\n')}\n\nMade with Potluck Showdown` });
    if (res === 'copied') toast('Results copied');
  };

  return (
    <Screen>
      <PageHeader title="Potluck Competition" backTo={`/potlucks/${pid}`} actions={<Button variant="link" title="Share" onPress={share} />} />

      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 48 }}>🎉</Text>
        <Text style={[type.h2, { textAlign: 'center', marginBottom: 4 }]}>Plates cleared. Votes counted.</Text>
        <Text style={[type.body, type.muted]}>{potluck.title} · {formatDate(potluck.startsAt)}</Text>
      </View>

      {myPlace >= 0 && (
        <Tile tone="gold" onPress={() => router.push('/profile')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 16 }}>
          <Text style={{ fontSize: 30 }}>{FRAMES[FRAME_ORDER[myPlace]].medal}</Text>
          <Text style={[type.body, { flex: 1 }]}>
            <Text style={type.bold}>You placed #{myPlace + 1}!</Text> Your {FRAMES[FRAME_ORDER[myPlace]].label} frame is unlocked. Wear it on your profile picture.
          </Text>
          <Icon name="chevron-forward" />
        </Tile>
      )}

      <Card style={{ padding: 16, marginBottom: 24 }}>
        <Text style={[type.caps, { color: colors.coral, marginBottom: 6 }]}>Final scores</Text>
        {[
          ['Total votes', summary.totalVotes],
          ['Average rating', `${summary.averageRating}/5`],
          ['Winning rating', `${summary.winningRating}/5`],
        ].map(([label, value]) => (
          <Row key={label} justify="space-between" style={{ paddingVertical: 4 }}>
            <Text style={[type.body, type.muted]}>{label}</Text>
            <Text style={[type.h2, { fontSize: 22 }]}>{value}</Text>
          </Row>
        ))}
      </Card>

      <Row justify="space-between" style={{ marginBottom: 8 }}>
        <Text style={type.h2}>Leaderboard</Text>
        <Text style={[type.caps, { color: colors.coral }]}>Top {top.length}</Text>
      </Row>
      {top.length === 0 ? <EmptyState emoji="🤷" title="No votes were cast" /> : (
        <Stack gap={8} style={{ marginBottom: 12 }}>
          {top.map((d: any, i: number) => (
            <Tile key={d.id} tone="lilac" onPress={() => openDish(d.id)}
              style={[s.podium, { backgroundColor: PLACES[i].bg }, PLACES[i].border ? { borderWidth: 2, borderColor: PLACES[i].border } : {}]}>
              <View style={s.rank}><Text style={[type.h3, { color: PLACES[i].rank }]}>{i + 1}</Text></View>
              <View style={s.thumb}><FsImage src={d.photo} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, type.heavy]} numberOfLines={1}>{d.name}</Text>
                <Row gap={4}>
                  <Avatar uid={d.authorId} profile={lookup(d.authorId)} size={22} medal={false} />
                  <Text style={[type.small, { flexShrink: 1 }]} numberOfLines={1}>by {name(d.authorId)}</Text>
                </Row>
              </View>
              <Stars small value={d.overall} />
            </Tile>
          ))}
        </Stack>
      )}

      {ranked.length > 3 && (
        <>
          <Button variant="link" title={`${showAll ? 'Hide' : 'Show'} full ranking`} iconRight={showAll ? 'chevron-up' : 'chevron-down'}
            style={{ alignSelf: 'flex-start', marginBottom: 8 }} onPress={() => setShowAll((v) => !v)} />
          {showAll && (
            <Card style={{ padding: 6, marginBottom: 16 }}>
              {ranked.slice(3).map((d: any, i: number) => (
                <Row key={d.id} gap={10} style={{ padding: 8 }}>
                  <Text style={[type.body, type.bold, type.muted, { width: 24 }]}>{i + 4}</Text>
                  <Text style={[type.body, { flex: 1 }]} numberOfLines={1} onPress={() => openDish(d.id)}>
                    {d.name} <Text style={[type.small, type.muted]}>by {name(d.authorId)}</Text>
                  </Text>
                  <Stars small value={d.overall} />
                </Row>
              ))}
            </Card>
          )}
        </>
      )}

      {(awards.length > 0 || brackets.length > 0) && (
        <>
          <Text style={[type.h3, { marginTop: 8, marginBottom: 8 }]}>Category champions</Text>
          <View style={s.awards}>
            {awards.map((a: any) => (
              <Card key={a.category.id} style={s.award} onPress={() => openDish(a.dish.id)}>
                <Text style={[type.caps, { color: colors.coral }]}>Top {a.category.name}</Text>
                <Text style={[type.body, type.bold]} numberOfLines={1}>{a.dish.name}</Text>
                <Text style={[type.small, type.muted]} numberOfLines={1}>{name(a.dish.authorId)} · {a.category.mode === 'ai' ? `${healthPoints(a.dish, a.category.id) ?? Math.round(a.avg * 20)}/100 · AI` : `${a.avg.toFixed(1)}/5`}</Text>
              </Card>
            ))}
            {brackets.map((b: any) => (
              <Card key={b.category.id} style={s.award} onPress={() => openDish(b.dish.id)}>
                <Text style={[type.caps, { color: colors.mint }]}>Best {b.category.name}</Text>
                <Text style={[type.body, type.bold]} numberOfLines={1}>{b.dish.name}</Text>
                <Text style={[type.small, type.muted]} numberOfLines={1}>{name(b.dish.authorId)} · {b.dish.overall.toFixed(1)}/5</Text>
              </Card>
            ))}
          </View>
        </>
      )}

      <Card style={{ flexDirection: 'row', justifyContent: 'space-around', padding: 10, marginBottom: 16 }}>
        <Text style={[type.small, type.muted]}>{summary.guestCount} guests</Text>
        <Text style={[type.small, type.muted]}>{summary.dishCount} dishes</Text>
        <Text style={[type.small, type.muted]}>{summary.totalVotes} ratings</Text>
      </Card>
      <Button size="lg" variant="soft" title="Share the results" onPress={share} />
    </Screen>
  );
}

const s = StyleSheet.create({
  podium: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  rank: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 64, height: 64, borderRadius: 14, overflow: 'hidden' },
  awards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  award: { flexGrow: 1, flexBasis: '45%', padding: 14, gap: 2 },
});
