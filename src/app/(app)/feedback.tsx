import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { friendlyError, submitFeedback } from '../../data/api';
import { Banner, Button, Card, Chip, Icon, Input, PageHeader, Row, Screen, Stack, StarRating, Tile } from '../../components/ui';
import { colors, type } from '../../theme';

type Answer = 'hard' | 'okay' | 'easy' | 'unclear' | 'clear' | 'na';
type FeatureKey = 'creating' | 'joining' | 'addingDish' | 'voting';

const EASE: [Answer, string][] = [['hard', 'Hard'], ['okay', 'Okay'], ['easy', 'Easy'], ['na', 'N/A']];
const CLARITY: [Answer, string][] = [['unclear', 'Unclear'], ['okay', 'Okay'], ['clear', 'Clear'], ['na', 'N/A']];
const QUESTIONS: { key: FeatureKey; label: string; options: [Answer, string][] }[] = [
  { key: 'creating', label: 'How easy was creating a potluck?', options: EASE },
  { key: 'joining', label: 'How easy was joining a potluck?', options: EASE },
  { key: 'addingDish', label: 'How easy was adding a dish?', options: EASE },
  { key: 'voting', label: 'How clear were rating and voting?', options: CLARITY },
];

function Choice({ options, value, onChange, label }: {
  options: [Answer, string][]; value?: Answer; onChange: (v?: Answer) => void; label: string;
}) {
  return (
    <Row gap={8} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map(([v, text]) => {
        const on = value === v;
        return (
          <Pressable key={v} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={text}
            onPress={() => onChange(on ? undefined : v)} style={[s.choice, on && s.choiceOn]}>
            <Text style={[type.small, on && { color: colors.coral, fontWeight: '700' }]}>{text}</Text>
          </Pressable>
        );
      })}
    </Row>
  );
}

/** Profile → Give feedback. Only the overall rating is required. */
export default function GiveFeedback() {
  const [rating, setRating] = useState(0);
  const [features, setFeatures] = useState<Partial<Record<FeatureKey, Answer>>>({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      await submitFeedback({ source: 'form', rating, features, comment });
      setSent(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen>
        <PageHeader title="Feedback" back={false} />
        <Card style={{ padding: 24, alignItems: 'center', marginTop: 24 }}>
          <View style={s.check}><Icon name="checkmark-circle-outline" size={36} color={colors.mint} /></View>
          <Text style={[type.caps, { color: colors.mint, marginTop: 12 }]}>Feedback sent</Text>
          <Text style={[type.h2, { textAlign: 'center', marginVertical: 8 }]}>Thanks for helping us dish up better!</Text>
          <Text style={[type.body, type.muted, { textAlign: 'center', marginBottom: 14 }]}>
            We’ve received your rating and feedback. Your ideas help make Potluck Showdown more fun for everyone.
          </Text>
          <Chip tone="peach" icon="star">{`Your experience: ${rating} / 5`}</Chip>
        </Card>
        <Button size="lg" title="Back to Potluck Showdown" style={{ marginTop: 16 }} onPress={() => router.replace('/')} />
        <Text style={[type.small, type.muted, { textAlign: 'center', marginTop: 12 }]}>More ideas later? Visit Profile → Give feedback.</Text>
      </Screen>
    );
  }

  return (
    <Screen footer={<Button size="lg" title={busy ? 'Sending…' : 'Send feedback'} loading={busy} disabled={!rating} onPress={send} />}>
      <PageHeader title="Give feedback" />
      <Text style={[type.h2, { marginBottom: 4 }]}>A better potluck starts here</Text>
      <Text style={[type.body, type.muted, { marginBottom: 16 }]}>
        Tell us what’s working and what could be better. About 1 minute · only overall rating is required.
      </Text>

      <Stack gap={12}>
        <Card style={{ padding: 16 }}>
          <Row justify="space-between" style={{ marginBottom: 10 }}>
            <Text style={type.h3}>Overall app experience</Text>
            <Text style={[type.small, { color: colors.danger, fontWeight: '700' }]}>Required</Text>
          </Row>
          <StarRating label="Overall app experience" value={rating} onChange={setRating} />
          <Row justify="space-between" style={{ marginTop: 4 }}>
            <Text style={[type.small, type.muted]}>1 · Poor</Text>
            <Text style={[type.small, type.muted]}>5 · Excellent</Text>
          </Row>
          {rating ? <Text style={[type.small, { color: colors.mint, fontWeight: '600', marginTop: 8 }]}>✓ {rating} of 5 selected</Text> : null}
        </Card>

        <Card style={{ padding: 16 }}>
          <Row justify="space-between">
            <Text style={type.h3}>How did the features feel?</Text>
            <Text style={[type.small, type.muted]}>Optional</Text>
          </Row>
          <Text style={[type.small, type.muted, { marginBottom: 12 }]}>
            Skip any question. Choose N/A (not applicable) for features you haven’t used.
          </Text>
          <Stack gap={14}>
            {QUESTIONS.map((q) => (
              <View key={q.key}>
                <Text style={[type.body, type.bold, { marginBottom: 8 }]}>{q.label}</Text>
                <Choice label={q.label} options={q.options} value={features[q.key]}
                  onChange={(v) => setFeatures((f) => ({ ...f, [q.key]: v }))} />
              </View>
            ))}
          </Stack>
        </Card>

        <Card style={{ padding: 16 }}>
          <Row justify="space-between">
            <Text style={type.h3}>What could we improve?</Text>
            <Text style={[type.small, type.muted]}>Optional</Text>
          </Row>
          <Text style={[type.small, type.muted, { marginBottom: 8 }]}>
            Any bugs, confusing moments, or features you’d love? If something broke, tell us what happened.
          </Text>
          <Input multiline rows={4} maxLength={2000} value={comment} onChangeText={setComment}
            placeholder="Your ideas" accessibilityLabel="What could we improve" />
        </Card>

        {error ? <Banner>{error}</Banner> : null}
        {rating ? (
          <Tile tone="mint" style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
            <Text style={[type.small, { color: colors.mintDark }]}>Your overall rating is ready. All other answers are optional.</Text>
          </Tile>
        ) : null}
      </Stack>
    </Screen>
  );
}

const s = StyleSheet.create({
  choice: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1,
    borderColor: colors.line, backgroundColor: colors.cream,
  },
  choiceOn: { borderColor: colors.coral, backgroundColor: colors.peachSoft },
  check: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center' },
});
