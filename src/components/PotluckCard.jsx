import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AvatarStack } from './Avatar';
import { Card, Chip, FsImage } from './ui';
import { PHASE_CHIP, PHASE_LABEL, phaseOf } from '../lib/phase';
import { formatInfo } from '../lib/formats';
import { formatWhen } from '../lib/dates';
import { useAuth } from '../hooks/AuthContext';
import { colors, type } from '../theme';

export default function PotluckCard({ potluck, now }) {
  const { user } = useAuth();
  const phase = phaseOf(potluck, now);
  const fmt = formatInfo(potluck.format);
  const spots = potluck.maxGuests ? potluck.maxGuests - potluck.memberIds.length : null;
  return (
    <Card style={s.card} onPress={() => router.push(`/potlucks/${potluck.id}`)} accessibilityLabel={potluck.title}>
      <View style={s.cover}>
        <FsImage src={potluck.coverImage} fallback={fmt.emoji} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.chips}>
          <Chip tone={PHASE_CHIP[phase]}>{PHASE_LABEL[phase]}</Chip>
          {potluck.hostId === user?.uid && <Chip tone="peach">Hosting</Chip>}
        </View>
        <Text style={[type.h4, { fontSize: 18, fontWeight: '800', marginTop: 6 }]} numberOfLines={1}>{potluck.title}</Text>
        <Text style={[type.small, { color: colors.coral, fontWeight: '600' }]} numberOfLines={1}>{potluck.theme || fmt.label}</Text>
        <Text style={[type.small, type.muted]} numberOfLines={2}>
          {formatWhen(potluck.startsAt)}
          {spots != null && ` · ${spots > 0 ? `${spots} spot${spots === 1 ? '' : 's'} left` : 'Full'}`}
        </Text>
        <View style={s.going}>
          <AvatarStack uids={potluck.memberIds} />
          <Text style={[type.small, type.muted]}>{potluck.memberIds.length} going</Text>
        </View>
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', gap: 14, padding: 12 },
  cover: { width: 112, aspectRatio: 1 / 1.05, borderRadius: 16, overflow: 'hidden' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  going: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
});
