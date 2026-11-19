import React, { useEffect } from "react";
import { Animated, Easing, Image, Platform, StyleSheet, Text, View, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { achievementById, frameInfo } from "../lib/achievements";
import { useProfiles } from "../hooks/useProfiles";
import { colors, type } from "../theme";

const COLORS = ["#f2553a", "#2f8f5b", "#6b4fd3", "#e0902a", "#2b7bb9", "#c2417a", "#4f8a3a"];

// Metallic rings for the win frames.
const FRAME_GRADIENTS: Record<string, [string, string, ...string[]]> = {
  gold: ["#ffd86b", "#f5a623", "#fff1b3", "#e8a10f"],
  silver: ["#e9edf2", "#a9b3bf", "#ffffff", "#8d99a6"],
  bronze: ["#f0b98a", "#b5703b", "#ffd9b8", "#9a5a2a"],
  host: [colors.coral, colors.gold, colors.lilac, colors.mint],
};

const HOLO = ["#ff6ec4", "#ffd86b", "#4ade80", "#38bdf8", "#7873f5", "#ff6ec4"] as const;

interface FrameLook {
  colors: readonly [string, string, ...string[]];
  /** Ring thickness as a share of the avatar size. */
  ring: number;
  glow?: string;
  /** Legendary rings slowly rotate. */
  spin?: boolean;
  badge: string;
  /** Background behind the badge emoji (rarer frames). */
  badgeBg?: string;
}

/** How a frame looks: rarer frames get thicker, brighter rings, a glow, and finally a rotating holographic ring. */
export function frameLook(tier?: string | null): FrameLook | null {
  const info = frameInfo(tier);
  if (!info || !tier) return null;
  if (FRAME_GRADIENTS[tier]) return { colors: FRAME_GRADIENTS[tier], ring: 0.07, badge: info.badge };
  const a = achievementById(tier)!;
  const [light, deep] = a.family.colors;
  switch (a.rarity) {
    case "common":
      return { colors: [light, deep], ring: 0.07, badge: info.badge };
    case "rare":
      return { colors: [deep, light, deep, light], ring: 0.085, badge: info.badge, badgeBg: colors.white };
    case "epic":
      return { colors: ["#fff3b0", light, deep, "#ffd86b", deep], ring: 0.095, glow: deep, badge: info.badge, badgeBg: colors.white };
    default:
      return { colors: [deep, ...HOLO], ring: 0.105, glow: "#ffb800", spin: true, badge: info.badge, badgeBg: "#ffd86b" };
  }
}

// One shared rotation drives every legendary ring on screen.
const spin = new Animated.Value(0);
let spinning = false;
const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

function SpinningRing({ look, size }: { look: FrameLook; size: number }) {
  useEffect(() => {
    if (spinning) return;
    spinning = true;
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: Platform.OS !== "web" })
    ).start();
  }, []);
  const big = size * 1.5;
  return (
    <Animated.View style={{ position: "absolute", width: big, height: big, left: -size * 0.25, top: -size * 0.25, transform: [{ rotate }] }}>
      <LinearGradient colors={look.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
    </Animated.View>
  );
}

function colorFor(seed: string = ""): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function initials(name: string = ""): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
}

export function displayName(profile?: any, fallback: string = "…"): string {
  return profile?.displayName ?? (profile === null ? "Former guest" : fallback);
}

export interface AvatarProps {
  profile?: any;
  uid?: string | null;
  size?: number;
  medal?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Profile picture with the owner's chosen win frame. This is the only place
 * other people's profiles surface: a name, a photo, and the frame they earned.
 */
export default function Avatar({ profile, uid, size = 40, medal = true, style }: AvatarProps) {
  const name = displayName(profile, "");
  const tier = typeof profile?.frame === "object" ? profile?.frame?.tier : profile?.frame;
  const look = frameLook(tier);
  const info = frameInfo(tier);
  const pad = look ? Math.max(2, Math.round(size * look.ring)) : 0;
  const inner = size - pad * 2;
  const label = info ? `${name} · ${info.label} frame` : name;
  const picture = profile?.photoURL ? (
    <Image
      source={{ uri: profile.photoURL }}
      style={[s.img, { width: inner, height: inner, borderRadius: inner / 2 }]}
    />
  ) : (
    <View
      style={[
        s.img,
        {
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: colorFor(uid ?? name),
        },
      ]}
    >
      <Text style={{ color: colors.white, fontWeight: "800", fontSize: inner * 0.4 }}>{initials(name)}</Text>
    </View>
  );
  const ringStyle = { width: size, height: size, borderRadius: size / 2 };
  const badgeSize = Math.max(12, size * 0.34);
  return (
    <View style={[{ width: size, height: size }, style]} accessibilityRole="image" accessibilityLabel={label}>
      {look ? (
        <View
          style={[
            ringStyle,
            look.glow && {
              backgroundColor: look.glow,
              shadowColor: look.glow,
              shadowOpacity: 0.85,
              shadowRadius: Math.max(4, size * 0.16),
              shadowOffset: { width: 0, height: 0 },
              elevation: 6,
            },
          ]}
        >
          {look.spin ? (
            <View style={[ringStyle, s.center, { overflow: "hidden" }]}>
              <SpinningRing look={look} size={size} />
              {picture}
            </View>
          ) : (
            <LinearGradient colors={look.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[ringStyle, { padding: pad }]}>
              {picture}
            </LinearGradient>
          )}
        </View>
      ) : (
        picture
      )}
      {look?.spin && size >= 56 && (
        <Text style={[s.sparkle, { fontSize: size * 0.2, left: -size * 0.04, top: -size * 0.04 }]}>✨</Text>
      )}
      {look && medal && size >= 32 && (
        <View
          style={[
            s.medal,
            look.badgeBg && {
              backgroundColor: look.badgeBg,
              width: badgeSize * 1.45,
              height: badgeSize * 1.45,
              borderRadius: badgeSize,
              borderWidth: 1.5,
              borderColor: look.spin ? "#e8a10f" : colors.line,
            },
          ]}
        >
          <Text style={{ fontSize: badgeSize }}>{look.badge}</Text>
        </View>
      )}
    </View>
  );
}

export function UserAvatar({ uid, ...rest }: { uid?: string | null } & Omit<AvatarProps, "profile" | "uid">) {
  const lookup = useProfiles(uid ? [uid] : []);
  return <Avatar uid={uid} profile={lookup(uid)} {...rest} />;
}

export function AvatarStack({ uids, max = 3, size = 34 }: { uids: string[]; max?: number; size?: number }) {
  const shown = uids.slice(0, max);
  const lookup = useProfiles(shown);
  return (
    <View style={s.stack}>
      {shown.map((id, i) => (
        <Avatar
          key={id}
          uid={id}
          profile={lookup(id)}
          size={size}
          medal={false}
          style={i > 0 ? { marginLeft: -10 } : undefined}
        />
      ))}
      {uids.length > max && (
        <View style={[s.more, { width: size, height: size, borderRadius: size / 2 }]}>
          <Text style={{ color: colors.mintDark, fontSize: 12, fontWeight: "800" }}>+{uids.length - max}</Text>
        </View>
      )}
    </View>
  );
}

/** Avatar + display name, used on feed posts and dish pages. */
export function AuthorLine({
  uid,
  size = 36,
  sub,
  light,
}: {
  uid: string;
  size?: number;
  sub?: string;
  light?: boolean;
}) {
  const lookup = useProfiles([uid]);
  const p = lookup(uid);
  return (
    <View style={s.author}>
      <Avatar uid={uid} profile={p} size={size} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.body, type.bold, light ? { color: colors.white } : null]} numberOfLines={1}>
          {displayName(p)}
        </Text>
        {sub ? (
          <Text style={[type.small, light ? { color: colors.white } : type.muted]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  img: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.white,
    overflow: "hidden",
  },
  medal: { position: "absolute", right: -4, bottom: -4, alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  sparkle: { position: "absolute" },
  stack: { flexDirection: "row", alignItems: "center" },
  more: {
    marginLeft: -10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.mintSoft,
    borderWidth: 2,
    borderColor: colors.white,
  },
  author: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
});
