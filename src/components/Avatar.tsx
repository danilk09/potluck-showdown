import React from "react";
import { Image, StyleSheet, Text, View, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { FRAMES } from "../lib/frames";
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
  const frame = tier && FRAMES[tier];
  const pad = frame ? Math.max(2, Math.round(size * 0.07)) : 0;
  const inner = size - pad * 2;
  const label = frame ? `${name} · ${frame.label}` : name;
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
  return (
    <View style={[{ width: size, height: size }, style]} accessibilityRole="image" accessibilityLabel={label}>
      {frame && FRAME_GRADIENTS[tier] ? (
        <LinearGradient
          colors={FRAME_GRADIENTS[tier]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: size, height: size, borderRadius: size / 2, padding: pad }}
        >
          {picture}
        </LinearGradient>
      ) : (
        picture
      )}
      {frame && medal && size >= 32 && (
        <Text style={[s.medal, { fontSize: Math.max(12, size * 0.36) }]}>{frame.medal}</Text>
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
  medal: { position: "absolute", right: -4, bottom: -4 },
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
