import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AuthShell from '../../components/AuthShell';
import { Button, Icon, Row, Stack } from '../../components/ui';
import { usingEmulators } from '../../firebase';
import { colors, type } from '../../theme';

const POINTS = [
  ['trophy-outline', 'Rate dishes anonymously and crown a winner'],
  ['book-outline', 'Keep recipes from every potluck you attend'],
  ['ribbon-outline', 'Earn a winner’s frame for your profile picture'],
];

export default function Welcome() {
  const { next } = useLocalSearchParams();
  const params = next ? { next } : {};
  return (
    <AuthShell
      footer={(
        <Stack gap={10}>
          <Button size="lg" title="Create an account" onPress={() => router.push({ pathname: '/signup', params })} />
          <Button size="lg" variant="outline" title="Sign in" onPress={() => router.push({ pathname: '/signin', params })} />
          <Button variant="link" title="Got an invite code? Join as a guest" onPress={() => router.push('/join')} />
          {usingEmulators && <Text style={[type.small, type.muted, { textAlign: 'center' }]}>Running on local Firebase emulators</Text>}
        </Stack>
      )}
    >
      <Text style={[type.h4, type.heavy, { fontSize: 18 }]}>🍲 Potluck Showdown</Text>
      <View style={{ paddingVertical: 32 }}>
        <Text style={{ fontSize: 42, marginBottom: 12 }}>🥗🍜🧁🏆</Text>
        <Text style={[type.h1, { marginBottom: 12 }]}>Make your potluck more fun.</Text>
        <Text style={[type.body, type.muted, { fontSize: 18, lineHeight: 26 }]}>
          Host a cook-off, claim a dish, and compete for the tastiest and healthiest plate.
          Every recipe stays in your recipe bank after the party.
        </Text>
        <Stack gap={10} style={{ marginTop: 20 }}>
          {POINTS.map(([icon, text]) => (
            <Row key={text} gap={10}>
              <Icon name={icon} color={colors.coral} />
              <Text style={[type.body, { flex: 1 }]}>{text}</Text>
            </Row>
          ))}
        </Stack>
      </View>
    </AuthShell>
  );
}
