import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../../hooks/AuthContext';
import { useDishes, useMyRatings, useNow, usePotluck } from '../../../../hooks/useFirestore';
import { useProfiles } from '../../../../hooks/useProfiles';
import { deletePotluck, friendlyError, leavePotluck, openVoting, publishResults, removeGuest } from '../../../../data/api';
import { formatInfo } from '../../../../lib/formats';
import { PHASE_CHIP, PHASE_LABEL, phaseOf, Phase } from '../../../../lib/phase';
import { formatDuration, formatWhen } from '../../../../lib/dates';
import { toMillis } from '../../../../lib/scoring';
import Avatar, { AvatarStack, displayName } from '../../../../components/Avatar';
import InviteSheet from '../../../../components/InviteSheet';
import {
  Button, Card, Chip, EmptyState, FsImage, HeroCard, Icon, IconButton, LoadingScreen, OptionSheet, PageHeader, Row, Screen, Stack, Tile,
  useConfirm, useToast,
} from '../../../../components/ui';
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
      title: 'Claiming dishes',
      text: opens ? `Voting opens ${formatWhen(potluck.votingOpensAt)}.` : 'The host opens voting during the event.',
      action: null as any,
      host: <Button size="sm" title="Open voting now" onPress={() => onAction('open')} disabled={busy || dishes.length < 2} />,
      hostHint: dishes.length < 2 ? 'Voting can open once at least 2 dishes are in.' : 'Opening voting locks dish edits.',
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
  const { data: potluck, loading } = usePotluck(pid);
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
  const needed = potluck.dishCategories.reduce((sum: number, c: any) => sum + c.needed, 0);
  const claimed = potluck.dishCategories.reduce((sum: number, c: any) => sum + Math.min(c.needed, dishes.filter((d: any) => d.categoryId === c.id).length), 0);
  const othersDishes = dishes.filter((d: any) => d.authorId !== uid);
  const ratedCount = othersDishes.filter((d: any) => ratings.has(d.id)).length;
  const showInvite = (kind = '1') => router.setParams({ invite: kind });

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
    if (phase === 'voting') return <Button size="lg" icon="star-outline" title="Rate dishes" onPress={() => router.push({ pathname: '/feed', params: { pid } })} />;
    if (phase === 'closed') return <Button size="lg" icon="trophy-outline" title="See results" onPress={() => router.push(`/potlucks/${pid}/results` as any)} />;
    return null;
  })();

  return (
    <Screen footer={cta}>
      {confirmEl}
      <InviteSheet potluck={potluck} visible={Boolean(invite)} justCreated={invite === 'new'} onClose={() => router.setParams({ invite: undefined })} />
      <OptionSheet visible={menu} onClose={() => setMenu(false)} options={[
        { label: 'Invite people', icon: 'share-social-outline', onPress: () => showInvite() },
        { label: 'Open food feed', icon: 'image-outline', onPress: () => router.push({ pathname: '/feed', params: { pid } }) },
        ...(isHost && phase !== 'closed' ? [
          { label: 'Edit details', icon: 'pencil' as any, onPress: () => router.push(`/potlucks/${pid}/edit` as any) },
          { label: 'Delete potluck', icon: 'trash-outline' as any, danger: true, onPress: onDelete },
        ] : []),
        ...(!isHost && phase === 'open' ? [{ label: 'Leave potluck', icon: 'exit-outline' as any, danger: true, onPress: onLeave }] : []),
      ]} />
      <PageHeader
        title="Event details"
        backTo="/events"
        actions={<IconButton name="ellipsis-horizontal" color={colors.coral} size={26} onPress={() => setMenu(true)} accessibilityLabel="More options" />}
      />

      <HeroCard style={{ marginBottom: 16 }}>
        {potluck.coverImage && <View style={s.heroCover}><FsImage src={potluck.coverImage} accessibilityLabel={`${potluck.title} cover photo`} /></View>}
        <Row wrap gap={6} style={{ marginBottom: 8 }}>
          <Chip tone="default">{`${fmt.emoji} ${fmt.label}`}</Chip>
          <Chip tone={PHASE_CHIP[phase] as any}>{PHASE_LABEL[phase]}</Chip>
        </Row>
        {potluck.theme ? <Text style={s.heroSub}>{potluck.theme}</Text> : null}
        <Text style={[type.h2, { color: colors.white, marginBottom: 4 }]}>{potluck.title}</Text>
        <Text style={[type.body, type.bold, { color: colors.white }]}>{formatWhen(potluck.startsAt)}</Text>
        {potluck.location ? (
          <Row gap={4}><Icon name="location-outline" size={16} color={colors.white} /><Text style={[type.body, { color: colors.white, flex: 1 }]}>{potluck.location}</Text></Row>
        ) : null}
        <Row justify="space-between" style={{ marginTop: 14 }}>
          <AvatarStack uids={potluck.memberIds} max={4} />
          <Button size="sm" variant="white" icon="person-add-outline" title={`${potluck.memberIds.length} attending`} onPress={() => showInvite()} />
        </Row>
      </HeroCard>

      <PhasePanel potluck={potluck} phase={phase} isHost={isHost} dishes={dishes} rateableCount={othersDishes.length} ratedCount={ratedCount} now={now} onAction={onAction} busy={busy} />

      {(potluck.formatDetail || potluck.description) ? (
        <Card style={{ padding: 14, marginBottom: 16, gap: 4 }}>
          {potluck.formatDetail ? <Text style={type.body}><Text style={type.bold}>{fmt.detailLabel}:</Text> {potluck.formatDetail}</Text> : null}
          {potluck.description ? <Text style={[type.body, type.muted]}>{potluck.description}</Text> : null}
        </Card>
      ) : null}

      <Text style={type.h3}>{potluck.format === 'courses' ? 'Course brackets' : 'Dish lineup'}</Text>
      <Text style={[type.small, type.muted, { marginBottom: 8 }]}>
        {claimed} of {needed} dishes claimed{needed > claimed ? ` · ${needed - claimed} still needed` : ' · all set!'}
      </Text>
      <Stack gap={8} style={{ marginBottom: 24 }}>
        {potluck.dishCategories.map((cat: any, i: number) => {
          const inCat = dishes.filter((d: any) => d.categoryId === cat.id);
          const missing = cat.needed - inCat.length;
          const [emoji, bg] = CAT_STYLES[i % CAT_STYLES.length];
          return (
            <View key={cat.id} style={[s.catRow, missing > 0 && phase === 'open' && s.catNeeds]}>
              <View style={[s.catIcon, { backgroundColor: bg }]}><Text style={{ fontSize: 22 }}>{emoji}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, type.bold]}>{cat.name}</Text>
                {inCat.map((d: any) => (
                  <Row key={d.id} gap={8}>
                    <Text style={[type.small, type.muted, { textDecorationLine: 'underline', flex: 1 }]} numberOfLines={1}
                      onPress={() => router.push(`/potlucks/${pid}/dishes/${d.id}` as any)}>
                      {lookup(d.authorId)?.displayName?.split(' ')[0] ?? '…'} · {d.name}
                    </Text>
                    {phase === 'open' && d.authorId === uid && (
                      <Button variant="link" size="sm" title="Edit" onPress={() => router.push({ pathname: `/potlucks/${pid}/dish` as any, params: { did: d.id } })} />
                    )}
                  </Row>
                ))}
                {missing > 0 && <Text style={[type.small, { color: colors.danger }]}>Still needs {missing} contribution{missing === 1 ? '' : 's'}</Text>}
              </View>
              <Text style={[type.small, type.muted]}>{inCat.length} claimed</Text>
            </View>
          );
        })}
      </Stack>

      <Text style={[type.h3, { marginBottom: 8 }]}>Guests ({potluck.memberIds.length})</Text>
      <Card style={{ padding: 6 }}>
        {potluck.memberIds.map((memberUid: string) => (
          <Row key={memberUid} gap={10} style={{ padding: 8 }}>
            <Avatar uid={memberUid} profile={lookup(memberUid)} size={36} />
            <Row gap={6} style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type.body, { flexShrink: 1 }]} numberOfLines={1}>{displayName(lookup(memberUid))}</Text>
              {memberUid === potluck.hostId && <Chip tone="peach">Host</Chip>}
              {memberUid === uid && <Text style={[type.small, type.muted]}>(you)</Text>}
            </Row>
            {dishes.some((d: any) => d.authorId === memberUid) && <Icon name="checkmark-circle" size={20} color={colors.mint} />}
            {isHost && memberUid !== uid && phase !== 'closed' && (
              <IconButton name="close" size={18} color={colors.muted} accessibilityLabel="Remove guest" onPress={() => onRemoveGuest(memberUid)} />
            )}
          </Row>
        ))}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  heroCover: { height: 190, marginHorizontal: -20, marginTop: -20, marginBottom: 16 },
  hostRow: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)', marginTop: 10, paddingTop: 10 },
  heroSub: { color: colors.heroSub, fontWeight: '700', fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  catRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.line, borderRadius: 16,
  },
  catNeeds: { borderColor: colors.goldLine, borderWidth: 2 },
  catIcon: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
