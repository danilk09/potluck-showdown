import { Text, View } from 'react-native';
import { ClassicFrames, FamilyCard, RarityChip, useFrames } from '../../components/FrameCollection';
import { Card, Loading, PageHeader, ProgressBar, Row, Screen } from '../../components/ui';
import { ACHIEVEMENT_TIERS, FAMILIES, RARITIES, frameInfo } from '../../lib/achievements';
import { colors, type } from '../../theme';

/** Every profile frame: the classic showdown frames and the achievement families, with progress. */
export default function Frames() {
  const frames = useFrames();
  const equipped = frameInfo(frames.equipped);

  return (
    <Screen>
      <PageHeader title="Profile frames" backTo="/profile" />
      <Card style={{ padding: 16, marginBottom: 20 }}>
        <Row justify="space-between" style={{ marginBottom: 8 }}>
          <Text style={type.h3}>{frames.count} of {frames.total} collected</Text>
          <Text style={[type.small, type.bold, { color: colors.coral }]}>{Math.round((frames.count / frames.total) * 100)}%</Text>
        </Row>
        <ProgressBar value={frames.count / frames.total} color={colors.coral} />
        <Row wrap gap={6} style={{ marginTop: 12 }}>
          {RARITIES.map((r) => {
            const all = ACHIEVEMENT_TIERS.filter((t) => t.rarity === r);
            const have = all.filter((t) => frames.unlocked.has(t.id)).length;
            return (
              <Row key={r} gap={4}>
                <RarityChip rarity={r} />
                <Text style={[type.small, type.muted]}>{have}/{all.length}</Text>
              </Row>
            );
          })}
        </Row>
        <Text style={[type.small, type.muted, { marginTop: 10 }]}>
          {equipped ? `Wearing: ${equipped.label}. ` : ''}Everyone sees your frame around your picture in feeds and guest lists. Rarer frames have flashier rings.
        </Text>
      </Card>

      {frames.loading ? <Loading /> : (
        <>
          <Text style={[type.h3, { marginBottom: 4 }]}>Showdown frames</Text>
          <Text style={[type.small, type.muted, { marginBottom: 10 }]}>Earned at a single showdown by placing or hosting.</Text>
          <View style={{ marginBottom: 24 }}>
            <ClassicFrames frames={frames} />
          </View>

          <Text style={[type.h3, { marginBottom: 4 }]}>Achievement frames</Text>
          <Text style={[type.small, type.muted, { marginBottom: 10 }]}>
            Keep playing to level these up. Each one goes from Common to Legendary.
          </Text>
          {FAMILIES.map((f) => <FamilyCard key={f.key} family={f} frames={frames} />)}
        </>
      )}
    </Screen>
  );
}
