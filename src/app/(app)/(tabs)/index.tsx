import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../../hooks/AuthContext';
import { useMyPotlucks, useNow } from '../../../hooks/useFirestore';
import Avatar from '../../../components/Avatar';
import PotluckCard from '../../../components/PotluckCard';
import GetAppBanner from '../../../components/GetAppBanner';
import GuideSlides from '../../../components/GuideSlides';
import { loadDrafts } from '../../../components/PotluckForm';
import { Button, Dialog, EmptyState, Icon, Loading, Row, Screen, SectionTitle, Stack, Tile } from '../../../components/ui';
import { phaseOf } from '../../../lib/phase';
import { toMillis } from '../../../lib/scoring';
import FeedbackPrompt from '../../../components/FeedbackPrompt';
import JoinDialog from '../../../components/JoinDialog';
import { colors, type } from '../../../theme';
import { takeNewAccountGuide } from '../../../lib/guide';
import { potluckWhen } from '../../../lib/dates';

const TIPS = [
  'Claim a dish early and become everyone’s favorite guest.',
  'Healthy swaps count: healthiness is part of the score.',
  'Add your recipe so guests can recreate your dish later.',
  'A clear photo helps people find your dish in the feed.',
];

const GUIDE = [
  { icon: 'calendar-outline' as const, title: 'Create or join a potluck', body: 'Hosts set the date, dish categories, and invite code. Guests join with that code or an invite link.' },
  { icon: 'restaurant-outline' as const, title: 'Add what you are bringing', body: 'Open a potluck and add one or more dishes. Pick a category, list ingredients, and add a photo or recipe if you like.' },
  { icon: 'star-outline' as const, title: 'Vote and see the results', body: 'When voting opens, rate other people’s dishes. The host publishes winners when voting ends. Find recipes later in the Recipes tab.' },
];

export default function Home() {
  const { user, profile } = useAuth();
  const now = useNow();
  const { data: potlucks, loading } = useMyPotlucks();
  const [guideStep, setGuideStep] = useState(-1);
  const [joining, setJoining] = useState(false);
  // Hides the popup right away, before the server's record of it comes back.
  const [feedbackHandled, setFeedbackHandled] = useState<string[]>([]);

  const uid = user?.uid || '';
  const [draftCount, setDraftCount] = useState(0);
  // Potluck drafts saved on this device; re-read whenever Home comes back into view.
  useFocusEffect(useCallback(() => {
    let alive = true;
    if (uid) loadDrafts(uid).then((d) => { if (alive) setDraftCount(d.length); });
    return () => { alive = false; };
  }, [uid]));

  // Only a brand-new account sees the walkthrough on its own; signing in again doesn't.
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    takeNewAccountGuide().then((show) => {
      if (alive && show) setGuideStep(0);
    });
    return () => { alive = false; };
  }, [uid]);

  const finishGuide = () => setGuideStep(-1);

  const live = potlucks.filter((p) => phaseOf(p, now) === 'voting');
  // "Upcoming" = not finished and not more than a day in the past.
  const upcoming = potlucks.filter((p) => p.status !== 'closed' && toMillis(p.startsAt) > now - 86_400_000);
  const tip = TIPS[new Date(now).getDate() % TIPS.length];
  // Finished potlucks you attended that haven't asked how the app went yet.
  const prompted = user?.feedbackPromptedIds ?? [];
  const feedbackFor = potlucks
    .filter((p) => p.status === 'closed' && !prompted.includes(p.id) && !feedbackHandled.includes(p.id))
    .map((p) => p.id);

  return (
    <Screen inTabs>
      <JoinDialog visible={joining} onClose={() => setJoining(false)} />
      {guideStep < 0 && feedbackFor.length > 0 && (
        <FeedbackPrompt potluckIds={feedbackFor} onDone={() => setFeedbackHandled((h) => [...h, ...feedbackFor])} />
      )}
      <Dialog visible={guideStep >= 0} title="How it works" onClose={finishGuide}
        footer={<>
          <Button title="Skip" variant="linkMuted" onPress={finishGuide} />
          <Button title={guideStep === GUIDE.length - 1 ? 'Done' : 'Next'} iconRight={guideStep === GUIDE.length - 1 ? undefined : 'arrow-forward'} onPress={() => guideStep === GUIDE.length - 1 ? finishGuide() : setGuideStep(guideStep + 1)} />
        </>}>
        {guideStep >= 0 && <GuideSlides slides={GUIDE} step={guideStep} onStep={setGuideStep} />}
      </Dialog>
      <Row justify="space-between" style={{ marginBottom: 16 }}>
        <Text style={[type.h4, type.heavy, { fontSize: 19 }]}>Potluck Showdown</Text>
        <Pressable onPress={() => router.push('/profile')} accessibilityLabel="Your profile" accessibilityRole="button">
          <Avatar uid={uid} profile={profile} size={44} />
        </Pressable>
      </Row>
      {live.map((p) => (
        <Tile key={p.id} tone="gold" onPress={() => router.push({ pathname: '/feed', params: { pid: p.id } })}
          style={{ padding: 16, marginBottom: 12, borderWidth: 2, borderColor: colors.goldLine }}>
          <Row gap={12}>
            <Text style={{ fontSize: 30 }}>🗳️</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type.caps, { color: colors.coralDark }]}>Happening now · voting is open</Text>
              <Text style={type.h3}>{p.title}</Text>
              <Text style={[type.small, type.muted]}>{p.location || potluckWhen(p)}</Text>
            </View>
          </Row>
          <Button size="md" variant="dark" icon="star" title="Rate the dishes" style={{ marginTop: 12 }}
            onPress={() => router.push({ pathname: '/feed', params: { pid: p.id } })} />
        </Tile>
      ))}
      <GetAppBanner />
      <Button variant="link" icon="help-circle-outline" title="How it works" style={{ alignSelf: 'flex-start', marginBottom: 12 }} onPress={() => setGuideStep(0)} />

      <Text style={[type.h1, { marginBottom: 8 }]}>Make your Potluck more fun</Text>
      <Text style={[type.body, type.muted, { marginBottom: 16 }]}>
        Join a potluck, share what you bring, and compete for favorites based on taste and healthiness.
      </Text>
      <Row gap={10} style={{ marginBottom: 24 }}>
        <Button style={{ flex: 1 }} size="lg" icon="add" title="Create Potluck" onPress={() => router.push('/create')} />
        <Button style={{ flex: 1 }} size="lg" variant="outline" title="Join Potluck" onPress={() => setJoining(true)} />
      </Row>
      {draftCount > 0 && (
        <Button variant="soft" icon="document-text-outline" title={`Continue a draft (${draftCount})`}
          style={{ marginTop: -12, marginBottom: 24 }} onPress={() => router.push('/create')} />
      )}

      <SectionTitle right={<Button variant="link" title="See all" onPress={() => router.push('/events')} />}>Upcoming potlucks</SectionTitle>

      {loading ? <Loading /> : upcoming.length === 0 ? (
        <EmptyState emoji="🥘" title={potlucks.length ? 'Nothing coming up' : 'No potlucks yet'}
          action={<Button title="Enter an invite code" onPress={() => setJoining(true)} />}>
          {potlucks.length ? 'Your past showdowns are under Events. ' : ''}Create your own showdown, or join one with an invite code from a friend.
        </EmptyState>
      ) : (
        <Stack>
          {upcoming.slice(0, 4).map((p) => <PotluckCard key={p.id} potluck={p} now={now} />)}
        </Stack>
      )}

      <Tile tone="lilac" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 24 }}>
        <Icon name="star-outline" size={24} color={colors.coral} />
        <View style={{ flex: 1 }}><Text style={type.body}>{tip}</Text></View>
      </Tile>
    </Screen>
  );
}
