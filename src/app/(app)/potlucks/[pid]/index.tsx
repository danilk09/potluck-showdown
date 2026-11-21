import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../../hooks/AuthContext';
import { useDishes, useMyRatings, useNow, usePotluck } from '../../../../hooks/useFirestore';
import { useProfiles } from '../../../../hooks/useProfiles';
import {
  claimSpot, deletePotluck, friendlyError, leavePotluck, openVoting, publishResults, releaseSpot, removeGuest,
} from '../../../../data/api';
import { formatInfo } from '../../../../lib/formats';
import { PHASE_CHIP, PHASE_LABEL, phaseOf, Phase } from '../../../../lib/phase';
import { formatDuration, formatWhen, potluckWhen } from '../../../../lib/dates';
import { mapsUrl } from '../../../../lib/platform';
import { toMillis } from '../../../../lib/scoring';
import Avatar, { AvatarStack, displayName } from '../../../../components/Avatar';
import InviteSheet, { useShareInvite } from '../../../../components/InviteSheet';
import {
  Banner, Button, Card, Chip, EmptyState, FsImage, HeroCard, Icon, IconButton, LoadingScreen, OptionSheet, PageHeader, Row, Screen, Stack,
  Tile, useConfirm, useToast,
} from '../../../../components/ui';
import PrizeList from '../../../../components/PrizeList';
import { colors, type } from '../../../../theme';

const CAT_STYLES = [
  ['🍝', '#ffe6dc'], ['🥗', '#e2f5ea'], ['🥙', '#eee8fd'], ['🍪', '#e3f0fb'], ['🍲', '#fff1cc'], ['🧁', '#fde4ef'],
];

type PhasePanelProps = {
  potluck: any;
  phase: Phase;
  isHost: boolean;
  dishes: any[];
  rateableCount: number;
  ratedCount: number;
  now: number;
  onAction: (kind: 'open' | 'publish') => void;
  busy: boolean;
};

function PhasePanel({ potluck, phase, isHost, dishes, rateableCount, ratedCount, now, onAction, busy }: PhasePanelProps) {
  const closes = toMillis(potluck.votingClosesAt);
  const opens = toMillis(potluck.votingOpensAt);
  const toRate = rateableCount - ratedCount;
  const content = {
    open: {
      title: opens ? `Voting opens ${formatWhen(potluck.votingOpensAt)}` : 'Voting opens at the event',
      text: 'Until then, guests can add and edit dishes.',
      action: null as any,
      host: <Button size="sm" title="Open voting now" onPress={() => onAction('open')} disabled={busy || dishes.length < 2} />,
      hostHint: dishes.length < 2 ? 'Needs at least 2 dishes first.' : null,
    },
    voting: {
      title: 'Voting is open',
      text: `${toRate > 0 ? `${toRate} dish${toRate === 1 ? '' : 'es'} left for you to rate` : 'You’ve rated every dish you can'}${closes ? ` · closes in ${formatDuration(closes - now)}` : ''}.`,
      action: <Button size="sm" variant="warning" title="Rate dishes" onPress={() => router.push({ pathname: '/feed', params: { pid: potluck.id } })} />,
      host: <Button size="sm" variant="outlineDark" title="Close voting & publish" onPress={() => onAction('publish')} disabled={busy} />,
      hostHint: null as any,
    },
    tallying: {
      title: 'Voting has closed',
      text: isHost ? 'Publish the results to crown the winners.' : 'Waiting for the host to publish the results.',
      action: null as any,
      host: <Button size="sm" title="Publish results" onPress={() => onAction('publish')} disabled={busy} />,
      hostHint: null as any,
    },
    closed: {
      title: 'Results are in 🏆',
      text: 'See who took home the top spots.',
      action: <Button size="sm" title="See results" onPress={() => router.push(`/potlucks/${potluck.id}/results` as any)} />,
      host: null as any,
      hostHint: null as any,
    },
  }[phase];

  const Surface = phase === 'voting' || phase === 'closed' ? Tile : Card;
  return (
    <Surface tone={phase === 'voting' ? 'gold' : 'lilac'} style={{ padding: 14, marginBottom: 16 }}>
      <Row gap={10}>
        <View style={{ flex: 1 }}>
          <Text style={[type.body, type.bold]}>{content.title}</Text>
          <Text style={[type.small, type.muted]}>{content.text}</Text>
        </View>
        {content.action}
      </Row>
      {isHost && content.host && (
        <Row gap={10} style={s.hostRow}>
          <View style={{ flex: 1 }}>
            <Row gap={4}><Icon name="person-circle-outline" size={16} /><Text style={[type.small, type.bold]}>Host controls</Text></Row>
            {content.hostHint && <Text style={[type.small, type.muted]}>{content.hostHint}</Text>}
          </View>
          {content.host}
        </Row>
      )}
    </Surface>
  );
}

export default function EventDetail() {
  const { pid, invite } = useLocalSearchParams<{ pid: string; invite?: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const now = useNow(15_000);
  const [confirmEl, confirm] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  // Opened right after creating a potluck (?invite=new), or from the Invite buttons.
  const [inviteOpen, setInviteOpen] = useState<null | 'new' | 'invite'>(invite === 'new' ? 'new' : invite ? 'invite' : null);
  const shareInvite = useShareInvite();
  const { data: potluck, loading } = usePotluck(pid);

  useEffect(() => {
    if (invite) router.setParams({ invite: undefined });
  }, [invite]);

  // Popups sit above every screen, so close them when another screen (like an opened invite link) takes over.
  useFocusEffect(useCallback(() => () => {
    setInviteOpen(null);
    setMenu(false);
  }, []));
  const uid = user?.uid || '';
  const isMember = Boolean(potluck?.memberIds.includes(uid));
  const { data: dishes } = useDishes(pid, isMember);
  const { ratings } = useMyRatings(pid, isMember);
  const lookup = useProfiles([...(potluck?.memberIds ?? []), ...dishes.map((d: any) => d.authorId)]);

  if (loading) return <LoadingScreen />;
  if (!potluck) return <Screen><PageHeader title="Event details" /><EmptyState title="This potluck doesn’t exist anymore" emoji="🫙" /></Screen>;
  if (!isMember) return <Redirect href={`/join/${potluck.inviteCode}` as any} />;

  const isHost = potluck.hostId === uid;
  const phase = phaseOf(potluck, now);
  const fmt = formatInfo(potluck.format);
  const myDishes = dishes.filter((d: any) => d.authorId === uid);
  // Spots held without a dish yet ("I'll bring a dessert"), from people still in the potluck.
  const spotClaims = (potluck.spotClaims ?? []).filter((c: any) => potluck.memberIds.includes(c.userId));
  const filledIn = (catId: string) =>
    dishes.filter((d: any) => d.categoryId === catId).length + spotClaims.filter((c: any) => c.categoryId === catId).length;
  const needed = potluck.dishCategories.reduce((sum: number, c: any) => sum + c.needed, 0);
  const claimed = potluck.dishCategories.reduce((sum: number, c: any) => sum + Math.min(c.needed, filledIn(c.id)), 0);
  const othersDishes = dishes.filter((d: any) => d.authorId !== uid);
  const ratedCount = othersDishes.filter((d: any) => ratings.has(d.id)).length;
  const showInvite = () => setInviteOpen('invite');

  const run = async (fn: () => Promise<any>, success?: string) => {
    setBusy(true);
    try {
      await fn();
      if (success) toast(success);
      return true;
    } catch (err) {
      toast(friendlyError(err), 'danger');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onAction = async (kind: 'open' | 'publish') => {
    if (kind === 'open') {
      if (await confirm({ title: 'Open voting now?', body: 'Guests can start rating dishes, and dishes can no longer be added or edited.', confirmLabel: 'Open voting' })) {
        run(() => openVoting(potluck), 'Voting is open!');
      }
    } else if (kind === 'publish') {
      if (await confirm({ title: 'Publish the results?', body: 'Voting closes for everyone and the leaderboard becomes final.', confirmLabel: 'Publish results' })) {
        if (await run(() => publishResults(potluck))) router.push(`/potlucks/${pid}/results` as any);
      }
    }
  };

  const onDelete = async () => {
    if (await confirm({ title: 'Delete this potluck?', body: 'All dishes and recipes in it will be removed for everyone.', confirmLabel: 'Delete', danger: true })) {
      if (await run(() => deletePotluck(potluck), 'Potluck deleted')) router.replace('/events');
    }
  };

  const onLeave = async () => {
    if (await confirm({ title: 'Leave this potluck?', body: myDishes.length ? 'Your dishes will be removed too.' : undefined, confirmLabel: 'Leave', danger: true })) {
      if (await run(() => leavePotluck(pid), 'You left the potluck')) router.replace('/');
    }
  };

  const holdSpot = (catId: string, name: string) => run(() => claimSpot(pid, catId), `Spot held in ${name}. Add your dish when you decide.`);
  const giveUpSpot = (catId: string) => run(() => releaseSpot(pid, catId), 'Spot released');
  const openDish = (id: string) => router.push(`/potlucks/${pid}/dishes/${id}` as any);
  const openFeed = () => router.push({ pathname: '/feed', params: { pid, from: 'event' } });

  const onRemoveGuest = async (guestUid: string) => {
    const name = lookup(guestUid)?.displayName ?? 'this guest';
    if (await confirm({ title: `Remove ${name}?`, body: 'They will lose access to this potluck and its recipes.', confirmLabel: 'Remove', danger: true })) {
      run(() => removeGuest(pid, guestUid), `${name} was removed`);
    }
  };

  const cta = (() => {
    if (phase === 'open') {
      return <Button size="lg" icon="add" title="Add a dish" onPress={() => router.push(`/potlucks/${pid}/dish` as any)} />;
    }
    if (phase === 'voting') return <Button size="lg" icon="star-outline" title="Rate dishes" onPress={openFeed} />;
    if (phase === 'closed') return <Button size="lg" icon="trophy-outline" title="See results" onPress={() => router.push(`/potlucks/${pid}/results` as any)} />;
    return null;
  })();

  return (
    <Screen footer={cta}>
      {confirmEl}
      <InviteSheet potluck={potluck} visible={Boolean(inviteOpen)} justCreated={inviteOpen === 'new'} onClose={() => setInviteOpen(null)} />
      <OptionSheet visible={menu} onClose={() => setMenu(false)} options={[
        { label: 'Invite people', icon: 'person-add-outline', onPress: showInvite },
        { label: 'Share invite link', icon: 'share-social-outline', onPress: () => shareInvite(potluck) },
        { label: 'Open food feed', icon: 'image-outline', onPress: openFeed },
        ...(isHost && phase !== 'closed' ? [
          { label: 'Edit details', icon: 'pencil' as any, onPress: () => router.push(`/potlucks/${pid}/edit` as any) },
          { label: 'Delete potluck', icon: 'trash-outline' as any, danger: true, onPress: onDelete },
        ] : []),
        ...(!isHost && phase === 'open' ? [{ label: 'Leave potluck', icon: 'exit-outline' as any, danger: true, onPress: onLeave }] : []),
      ]} />
      <PageHeader
        title="Event details"
        backTo="/events"
        actions={(
          <Row gap={4}>
            {phase !== 'closed' && (
              <IconButton name="share-social-outline" color={colors.coral} size={24} onPress={() => shareInvite(potluck)} accessibilityLabel="Share invite link" />
            )}
            <IconButton name="ellipsis-horizontal" color={colors.coral} size={26} onPress={() => setMenu(true)} accessibilityLabel="More options" />
          </Row>
        )}
      />

      <HeroCard style={{ marginBottom: 12 }}>
        {potluck.coverImage && <View style={s.heroCover}><FsImage src={potluck.coverImage} accessibilityLabel={`${potluck.title} cover photo`} /></View>}
        <Row wrap gap={6} style={{ marginBottom: 8 }}>
          <Chip tone="default">{`${fmt.emoji} ${fmt.label}`}</Chip>
          <Chip tone={PHASE_CHIP[phase] as any}>{PHASE_LABEL[phase]}</Chip>
        </Row>
        <Text style={[type.h2, { color: colors.white, marginBottom: 6 }]}>{potluck.title}</Text>
        <Stack gap={4}>
          <Row gap={6}><Icon name="time-outline" size={16} color={colors.white} /><Text style={[type.body, type.bold, { color: colors.white, flex: 1 }]}>{potluckWhen(potluck)}</Text></Row>
          {potluck.location ? (
            <Pressable onPress={() => { void Linking.openURL(mapsUrl(potluck.location!)).catch(() => undefined); }} accessibilityRole="link"
              accessibilityLabel={`Open ${potluck.location} in maps`} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Icon name="location-outline" size={16} color={colors.white} />
              <Text style={[type.body, { color: colors.white, flex: 1, textDecorationLine: 'underline' }]}>{potluck.location}</Text>
              <Text style={[type.small, type.bold, { color: colors.heroSub }]}>Directions</Text>
            </Pressable>
          ) : (
            <Row gap={6}><Icon name="location-outline" size={16} color={colors.white} /><Text style={[type.body, { color: colors.white, flex: 1, opacity: 0.85 }]}>Location to be announced</Text></Row>
          )}
          {potluck.theme ? (
            <Row gap={6}><Icon name="color-palette-outline" size={16} color={colors.white} /><Text style={[type.body, { color: colors.white, flex: 1 }]}><Text style={type.bold}>Theme:</Text> {potluck.theme}</Text></Row>
          ) : null}
        </Stack>
        <Row justify="space-between" style={{ marginTop: 14 }}>
          <Row gap={8} style={{ flexShrink: 1 }}>
            <AvatarStack uids={potluck.memberIds} max={4} />
            <Text style={[type.small, type.bold, { color: colors.white, flexShrink: 1 }]}>
              {potluck.memberIds.length} going · {claimed} of {needed} dishes covered
            </Text>
          </Row>
          {phase !== 'closed' && <Button size="sm" variant="white" icon="person-add-outline" title="Invite" onPress={showInvite} />}
        </Row>
      </HeroCard>

      {(potluck.formatDetail || potluck.description) ? (
        <View style={{ marginBottom: 12, gap: 4 }}>
          {potluck.formatDetail ? <Text style={type.body}><Text style={type.bold}>{fmt.detailLabel}:</Text> {potluck.formatDetail}</Text> : null}
          {potluck.description ? <Text style={type.body}>{potluck.description}</Text> : null}
        </View>
      ) : null}
      {potluck.allergyNote ? (
        <Banner tone="warning" style={{ marginBottom: 12 }}>{`Allergies to avoid: ${potluck.allergyNote}`}</Banner>
      ) : null}

      <Row gap={8} style={{ marginBottom: 16 }}>
        {phase !== 'closed' && (
          <Button style={s.quick} size="sm" icon="share-social-outline" title="Share" onPress={() => shareInvite(potluck)} />
        )}
        <Button style={s.quick} size="sm" icon="image-outline" title="Food feed" onPress={openFeed} />
        {isHost && phase !== 'closed' ? (
          <Button style={s.quick} size="sm" icon="pencil" title="Edit" onPress={() => router.push(`/potlucks/${pid}/edit` as any)} />
        ) : phase === 'closed' ? (
          <Button style={s.quick} size="sm" icon="trophy-outline" title="Results" onPress={() => router.push(`/potlucks/${pid}/results` as any)} />
        ) : null}
      </Row>

      <PhasePanel potluck={potluck} phase={phase} isHost={isHost} dishes={dishes} rateableCount={othersDishes.length} ratedCount={ratedCount} now={now} onAction={onAction} busy={busy} />
      <PrizeList prizes={potluck.prizes} style={{ marginBottom: 16 }} />

      <Text style={type.h3}>{potluck.format === 'courses' ? 'Total dishes per course' : 'Total dishes needed'}</Text>
      <Text style={[type.small, type.bold, { color: needed > claimed ? colors.coralDark : colors.mint, marginBottom: 8 }]}>
        {claimed} of {needed} covered{needed > claimed ? ` · ${needed - claimed} still needed` : ' · all set!'}
      </Text>
      <Stack gap={8} style={{ marginBottom: 24 }}>
        {potluck.dishCategories.map((cat: any, i: number) => {
          const inCat = dishes.filter((d: any) => d.categoryId === cat.id);
          const held = spotClaims.filter((c: any) => c.categoryId === cat.id);
          const missing = cat.needed - inCat.length - held.length;
          const myHold = held.some((c: any) => c.userId === uid);
          const [emoji, bg] = CAT_STYLES[i % CAT_STYLES.length];
          return (
            <View key={cat.id} style={[s.catRow, missing > 0 && phase === 'open' && s.catNeeds]}>
              <Row gap={12}>
                <View style={[s.catIcon, { backgroundColor: bg }]}><Text style={{ fontSize: 22 }}>{emoji}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.body, type.bold]}>{cat.name}</Text>
                  <Text style={[type.small, missing > 0 ? { color: colors.danger } : type.muted]}>
                    {inCat.length + held.length} of {cat.needed} covered{missing > 0 ? ` · ${missing} still needed` : ''}
                  </Text>
                </View>
              </Row>
              {(inCat.length > 0 || held.length > 0) && (
                <View style={s.catDishes}>
                  {inCat.map((d: any) => (
                    <Pressable key={d.id} onPress={() => openDish(d.id)} accessibilityRole="button" accessibilityLabel={`${d.name}, open recipe`}
                      style={({ pressed }) => [s.dishLine, pressed && { opacity: 0.6 }]}>
                      <Avatar uid={d.authorId} profile={lookup(d.authorId)} size={24} medal={false} />
                      <Text style={[type.small, { flex: 1 }]} numberOfLines={1}>
                        <Text style={type.bold}>{d.name}</Text>
                        <Text style={type.muted}> · {lookup(d.authorId)?.displayName?.split(' ')[0] ?? '…'}</Text>
                      </Text>
                      {phase === 'open' && d.authorId === uid ? (
                        <Button variant="link" size="sm" title="Edit" onPress={() => router.push({ pathname: `/potlucks/${pid}/dish` as any, params: { did: d.id } })} />
                      ) : (
                        <Icon name="chevron-forward" size={16} color={colors.muted} />
                      )}
                    </Pressable>
                  ))}
                  {held.map((c: any) => (
                    <View key={c.userId} style={s.dishLine}>
                      <Avatar uid={c.userId} profile={lookup(c.userId)} size={24} medal={false} />
                      <Text style={[type.small, type.muted, { flex: 1 }]} numberOfLines={1}>
                        {c.userId === uid ? 'You' : lookup(c.userId)?.displayName?.split(' ')[0] ?? '…'} · deciding what to make
                      </Text>
                      {c.userId === uid && phase === 'open' && (
                        <Button variant="linkMuted" size="sm" title="Release" onPress={() => giveUpSpot(cat.id)} />
                      )}
                    </View>
                  ))}
                </View>
              )}
              {phase === 'open' && (myHold || missing > 0) && (
                <Row gap={8} style={{ marginTop: 10 }}>
                  <Button style={{ flex: 1 }} size="sm" variant={myHold ? 'primary' : 'soft'} icon="add"
                    title={myHold ? 'Add your dish' : 'Add a dish'} accessibilityLabel={`Bring a dish for ${cat.name}`}
                    onPress={() => router.push({ pathname: `/potlucks/${pid}/dish` as any, params: { cat: cat.id } })} />
                  {!myHold && (
                    <Button style={{ flex: 1 }} size="sm" variant="outline" icon="bookmark-outline" title="Hold a spot" disabled={busy}
                      accessibilityLabel={`Hold a spot in ${cat.name} and decide the dish later`} onPress={() => holdSpot(cat.id, cat.name)} />
                  )}
                </Row>
              )}
            </View>
          );
        })}
      </Stack>

      <Text style={[type.h3, { marginBottom: 8 }]}>Guests ({potluck.memberIds.length})</Text>
      <View style={s.guests}>
        {potluck.memberIds.map((memberUid: string, i: number) => {
          const theirs = dishes.filter((d: any) => d.authorId === memberUid);
          const holds = spotClaims.filter((c: any) => c.userId === memberUid);
          const bringing = theirs.length
            ? theirs.map((d: any) => d.name).join(', ')
            : holds.length
              ? `Holding a spot in ${holds.map((c: any) => potluck.dishCategories.find((k: any) => k.id === c.categoryId)?.name ?? 'a category').join(', ')}`
              : 'Hasn’t picked a dish yet';
          const open = theirs.length ? () => openDish(theirs[0].id) : undefined;
          return (
            <Pressable key={memberUid} disabled={!open} onPress={open} accessibilityRole={open ? 'button' : undefined}
              style={({ pressed }) => [s.guestRow, i > 0 && s.guestBorder, pressed && { backgroundColor: '#faf3ef' }]}>
              <Avatar uid={memberUid} profile={lookup(memberUid)} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Row gap={6}>
                  <Text style={[type.body, { flexShrink: 1 }]} numberOfLines={1}>{displayName(lookup(memberUid))}</Text>
                  {memberUid === potluck.hostId && <Chip tone="peach">Host</Chip>}
                  {memberUid === uid && <Text style={[type.small, type.muted]}>(you)</Text>}
                </Row>
                <Text style={[type.small, theirs.length ? { color: colors.mintDark, fontWeight: '600' } : type.muted]} numberOfLines={2}>
                  {theirs.length ? `Bringing ${bringing}` : bringing}
                </Text>
              </View>
              {open && <Icon name="chevron-forward" size={16} color={colors.muted} />}
              {isHost && memberUid !== uid && phase !== 'closed' && (
                <IconButton name="close" size={18} color={colors.muted} accessibilityLabel="Remove guest" onPress={() => onRemoveGuest(memberUid)} />
              )}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  heroCover: { height: 190, marginHorizontal: -20, marginTop: -20, marginBottom: 16 },
  hostRow: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)', marginTop: 10, paddingTop: 10 },
  heroSub: { color: colors.heroSub, fontWeight: '700', fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  catRow: {
    paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 12,
  },
  catDishes: { marginTop: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 4 },
  dishLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, minHeight: 36 },
  guests: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.white, overflow: 'hidden' },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  guestBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  catNeeds: { borderColor: colors.goldLine, borderWidth: 2 },
  quick: { flex: 1, paddingHorizontal: 8 },
  catIcon: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
