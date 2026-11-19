import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../hooks/AuthContext";
import { useMyPotlucks, useMyStats } from "../hooks/useFirestore";
import { friendlyError, updateMyProfile } from "../data/api";
import { FRAMES, earnedFrames } from "../lib/frames";
import {
  ACHIEVEMENT_TIERS, EMPTY_STATS, FAMILIES, RARITY_INFO, TOTAL_FRAMES, familyCount, frameInfo, nextTier, otherFramesUnlocked,
  tierGoal, unlockedFrames, type Family, type Rarity,
} from "../lib/achievements";
import { toMillis } from "../lib/scoring";
import Avatar from "./Avatar";
import { Card, Icon, ProgressBar, Row, useToast } from "./ui";
import { colors, type } from "../theme";

/** Everything the frame screens need: stats, what's unlocked, and how to equip a frame. */
export function useFrames() {
  const { user, profile } = useAuth();
  const uid = user?.uid || "";
  const { data: potlucks } = useMyPotlucks();
  const { data: statsData, loading } = useMyStats();
  const stats = statsData ?? EMPTY_STATS;
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  // Classic frames are worn "from" a potluck: use the most recent one for each tier.
  const classicPotluck = useMemo(() => {
    const map: Record<string, string> = {};
    const earned = [...earnedFrames(uid, potlucks)].sort((a, b) => toMillis(b.potluck.startsAt) - toMillis(a.potluck.startsAt));
    for (const f of earned) map[f.tier] ??= f.potluckId;
    return map;
  }, [uid, potlucks]);

  const unlocked = useMemo(() => new Set(unlockedFrames(stats)), [stats]);
  const equipped: string | null = profile?.frame?.tier ?? null;

  const equip = async (tier: string | null) => {
    if (busy || tier === equipped) return;
    setBusy(tier ?? "none");
    try {
      await updateMyProfile({ frame: tier ? { tier, potluckId: classicPotluck[tier] ?? "" } : null });
      toast(tier ? `${frameInfo(tier)?.label} frame equipped` : "Frame removed");
    } catch (err) {
      toast(friendlyError(err), "danger");
    } finally {
      setBusy(null);
    }
  };

  return { uid, profile, stats, loading, unlocked, equipped, equip, busy, count: unlocked.size, total: TOTAL_FRAMES };
}

export function RarityChip({ rarity }: { rarity: Rarity }) {
  const r = RARITY_INFO[rarity];
  return (
    <View style={[s.rarity, { backgroundColor: r.soft }]}>
      <Text style={[s.rarityText, { color: r.color }]}>{r.label}</Text>
    </View>
  );
}

/** One frame: a preview on your own picture, its name and rarity, and whether it's unlocked. */
export function FrameTile({
  tier,
  frames,
  hint,
}: {
  tier: string | null;
  frames: ReturnType<typeof useFrames>;
  /** Shown under locked frames: what it takes to unlock. */
  hint?: string;
}) {
  const info = frameInfo(tier);
  const unlocked = !tier || frames.unlocked.has(tier);
  const active = frames.equipped === tier;
  return (
    <Pressable
      onPress={() => unlocked && frames.equip(tier)}
      disabled={!unlocked || Boolean(frames.busy)}
      accessibilityRole="button"
      accessibilityLabel={`${info?.label ?? "No frame"}${unlocked ? (active ? ", equipped" : ", tap to equip") : ", locked"}`}
      accessibilityState={{ selected: active, disabled: !unlocked }}
      style={[
        s.tile,
        !unlocked && s.tileLocked,
        // Epic and Legendary tiles stand out even before they're unlocked.
        info && (info.rarity === "epic" || info.rarity === "legendary") && {
          backgroundColor: RARITY_INFO[info.rarity].soft,
          borderColor: RARITY_INFO[info.rarity].color + "55",
        },
        active && s.tileActive,
      ]}
    >
      <View style={!unlocked && { opacity: 0.7 }}>
        <Avatar uid={frames.uid} profile={{ ...frames.profile, frame: tier ? { tier } : null }} size={64} />
      </View>
      {!unlocked && (
        <View style={s.lock}>
          <Icon name="lock-closed" size={13} color={colors.white} />
        </View>
      )}
      <Text style={[type.small, type.bold, { marginTop: 8, textAlign: "center" }]} numberOfLines={2}>
        {info?.label ?? "No frame"}
      </Text>
      {info && <RarityChip rarity={info.rarity} />}
      <Text style={[s.tileSub, active && { color: colors.coral, fontWeight: "700" }]} numberOfLines={3}>
        {active ? "Equipped" : unlocked ? "Tap to wear" : hint ?? info?.desc}
      </Text>
    </Pressable>
  );
}

/** A family of achievement frames: your count, progress to the next level, and every level. */
export function FamilyCard({ family, frames }: { family: Family; frames: ReturnType<typeof useFrames> }) {
  const count = familyCount(family, frames.stats, otherFramesUnlocked(frames.stats));
  const next = nextTier(family, frames.stats);
  const tiers = ACHIEVEMENT_TIERS.filter((t) => t.family === family);
  const prev = next ? tiers[next.tier.level - 2]?.threshold ?? 0 : 0;
  return (
    <Card style={{ padding: 14, marginBottom: 12 }}>
      <Row gap={10} style={{ marginBottom: 10 }}>
        <View style={[s.familyIcon, { backgroundColor: family.colors[0] }]}>
          <Text style={{ fontSize: 20 }}>{family.emoji}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.body, type.bold]}>{family.label}</Text>
          <Text style={[type.small, type.muted]}>{family.unit(count)} so far</Text>
        </View>
        {!next && <Text style={[type.small, { color: colors.mint, fontWeight: "800" }]}>All done ✓</Text>}
      </Row>
      {next && (
        <View style={{ marginBottom: 12 }}>
          <ProgressBar value={(count - prev) / Math.max(1, next.tier.threshold - prev)} color={family.colors[1]} />
          <Text style={[type.small, type.muted, { marginTop: 4 }]}>
            {next.tier.threshold - count} more to unlock <Text style={type.bold}>{next.tier.name}</Text> ({tierGoal(next.tier).toLowerCase()})
          </Text>
        </View>
      )}
      <View style={s.grid}>
        {tiers.map((t) => (
          <FrameTile key={t.id} tier={t.id} frames={frames} hint={`${tierGoal(t)}`} />
        ))}
      </View>
    </Card>
  );
}

/** The classic frames: none, plus the ones earned at a single showdown. */
export function ClassicFrames({ frames }: { frames: ReturnType<typeof useFrames> }) {
  return (
    <View style={s.grid}>
      {[null, "gold", "silver", "bronze", "host"].map((tier) => (
        <FrameTile key={tier ?? "none"} tier={tier} frames={frames} hint={tier ? FRAMES[tier].desc : undefined} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: {
    flexGrow: 1, flexBasis: "45%", minWidth: 120, alignItems: "center", gap: 4, paddingVertical: 12, paddingHorizontal: 8,
    backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.line,
  },
  tileActive: { borderColor: colors.coral, borderWidth: 2, backgroundColor: "#fff8f5" },
  tileLocked: { backgroundColor: "#faf6f3" },
  tileSub: { fontSize: 12, lineHeight: 16, color: colors.muted, textAlign: "center" },
  lock: {
    position: "absolute", top: 12, left: 10, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(34,27,23,0.75)",
    alignItems: "center", justifyContent: "center",
  },
  rarity: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  rarityText: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  seeAll: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line,
  },
  familyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});

/** Profile card: how many frames you have, the ones you're closest to, and a link to all of them. */
export function FrameSummary({ frames, onOpen }: { frames: ReturnType<typeof useFrames>; onOpen: () => void }) {
  const others = otherFramesUnlocked(frames.stats);
  const upNext = FAMILIES.map((f) => {
    const next = nextTier(f, frames.stats);
    if (!next) return null;
    const count = familyCount(f, frames.stats, others);
    return { tier: next.tier, count, progress: count / next.tier.threshold };
  })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 2);
  return (
    <Card style={{ padding: 16, marginBottom: 24 }}>
      <Row justify="space-between" style={{ marginBottom: 8 }}>
        <Text style={[type.body, type.bold]}>{frames.count} of {frames.total} frames collected</Text>
        <Text style={[type.small, type.bold, { color: colors.coral }]}>{Math.round((frames.count / frames.total) * 100)}%</Text>
      </Row>
      <ProgressBar value={frames.count / frames.total} color={colors.coral} />
      {upNext.length > 0 && (
        <>
          <Text style={[type.small, type.muted, { marginTop: 14, marginBottom: 8 }]}>Closest to unlocking</Text>
          <View style={{ gap: 10 }}>
            {upNext.map(({ tier, count }) => (
              <Row key={tier.id} gap={10}>
                <View style={[s.familyIcon, { width: 34, height: 34, backgroundColor: tier.family.colors[0] }]}>
                  <Text style={{ fontSize: 17 }}>{tier.family.emoji}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Row gap={6}>
                    <Text style={[type.small, type.bold, { flexShrink: 1 }]} numberOfLines={1}>{tier.name}</Text>
                    <RarityChip rarity={tier.rarity} />
                  </Row>
                  <ProgressBar value={count / tier.threshold} color={tier.family.colors[1]} />
                  <Text style={[type.small, type.muted]} numberOfLines={1}>{count} / {tier.threshold} · {tierGoal(tier)}</Text>
                </View>
              </Row>
            ))}
          </View>
        </>
      )}
      <Pressable onPress={onOpen} accessibilityRole="button" style={s.seeAll}>
        <Icon name="ribbon-outline" size={18} color={colors.coral} />
        <Text style={{ color: colors.coral, fontWeight: "700", flex: 1 }}>See all frames & change yours</Text>
        <Icon name="chevron-forward" size={18} color={colors.coral} />
      </Pressable>
    </Card>
  );
}
