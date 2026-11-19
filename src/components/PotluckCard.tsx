import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AvatarStack } from "./Avatar";
import { useShareInvite } from "./InviteSheet";
import { Card, Chip, FsImage, Icon, IconButton } from "./ui";
import { PHASE_CHIP, PHASE_LABEL, phaseOf } from "../lib/phase";
import { formatInfo } from "../lib/formats";
import { formatWhen } from "../lib/dates";
import { useAuth } from "../hooks/AuthContext";
import { colors, type } from "../theme";

interface PotluckCardProps {
  potluck: any;
  now?: number;
  /** Replaces the default (open the event). */
  onPress?: () => void;
  /** Outlined with a check, for the potluck currently picked. */
  selected?: boolean;
  /** Show the share button (default true). */
  share?: boolean;
}

export default function PotluckCard({ potluck, now, onPress, selected, share = true }: PotluckCardProps) {
  const { user } = useAuth();
  const phase = phaseOf(potluck, now);
  const fmt = formatInfo(potluck.format);
  const spots = potluck.maxGuests ? potluck.maxGuests - (potluck.memberIds?.length || 0) : null;
  const shareInvite = useShareInvite();
  const canShare = share && phase !== "closed";
  return (
    <View>
      <Card
        style={[s.card, selected && s.selected]}
        onPress={onPress ?? (() => router.push(`/potlucks/${potluck.id}` as any))}
        accessibilityLabel={potluck.title}
      >
        <View style={s.cover}>
          <FsImage src={potluck.coverImage} fallback={fmt.emoji} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={[s.chips, (canShare || selected) && { paddingRight: 36 }]}>
            <Chip tone={PHASE_CHIP[phase] as any}>{PHASE_LABEL[phase]}</Chip>
            {potluck.hostId === user?.uid && <Chip tone="peach">Hosting</Chip>}
          </View>
          <Text style={[type.h4, { fontSize: 18, fontWeight: "800", marginTop: 6 }]} numberOfLines={1}>
            {potluck.title}
          </Text>
          <Text style={[type.small, { color: colors.coral, fontWeight: "600" }]} numberOfLines={1}>
            {potluck.theme || fmt.label}
          </Text>
          <Text style={[type.small, type.muted]} numberOfLines={2}>
            {formatWhen(potluck.startsAt)}
            {spots != null && ` · ${spots > 0 ? `${spots} spot${spots === 1 ? "" : "s"} left` : "Full"}`}
          </Text>
          <View style={s.going}>
            <AvatarStack uids={potluck.memberIds || []} />
            <Text style={[type.small, type.muted]}>{potluck.memberIds?.length || 0} going</Text>
          </View>
        </View>
      </Card>
      {/* Beside the card, not inside it, so tapping share doesn't also open the event. */}
      {selected && (
        <View style={s.check} accessibilityLabel="Selected">
          <Icon name="checkmark" size={16} color={colors.white} />
        </View>
      )}
      {canShare && !selected && (
        <IconButton
          name="share-social-outline"
          color={colors.coral}
          style={s.share}
          onPress={() => shareInvite(potluck)}
          accessibilityLabel={`Share invite to ${potluck.title}`}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: "row", gap: 14, padding: 12 },
  cover: { width: 112, aspectRatio: 1 / 1.05, borderRadius: 16, overflow: "hidden" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  share: { position: "absolute", top: 6, right: 6, backgroundColor: colors.peachSoft },
  selected: { borderColor: colors.coral, borderWidth: 2 },
  check: {
    position: "absolute", top: 12, right: 12, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.coral,
    alignItems: "center", justifyContent: "center",
  },
  going: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
});
