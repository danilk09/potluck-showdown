import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { useAuth } from "../hooks/AuthContext";
import { toMillis } from "../lib/scoring";
import PotluckCard from "./PotluckCard";
import { EmptyState, Loading, Stack } from "./ui";
import { colors, radius } from "../theme";

export type BrowserTab = "upcoming" | "hosting" | "past";

const TABS: { key: BrowserTab; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "hosting", label: "Hosting" },
  { key: "past", label: "Past" },
];

// Remembered while the app is open, per list (Events and the feed picker each keep their own).
const lastTab: Record<string, BrowserTab> = {};

/**
 * The Upcoming / Hosting / Past list of your potlucks, used by the Events tab
 * and the food feed's potluck picker so both look and work the same.
 */
export default function PotluckBrowser({
  potlucks,
  loading,
  now,
  memoryKey,
  initialTab,
  onSelect,
  selectedId,
  emptyAction,
}: {
  potlucks: any[];
  loading: boolean;
  now: number;
  /** Which remembered tab to use. */
  memoryKey: string;
  /** Open on this tab instead of the remembered one. */
  initialTab?: BrowserTab;
  /** Tapping a card calls this instead of opening the event. */
  onSelect?: (potluck: any) => void;
  selectedId?: string;
  emptyAction?: React.ReactNode;
}) {
  const { user } = useAuth();
  const uid = user?.uid || "";
  const [tab, setTab] = useState<BrowserTab>(initialTab ?? lastTab[memoryKey] ?? "upcoming");
  // `initialTab` can depend on data that arrives after the first render; apply it once it's known.
  const [appliedInitial, setAppliedInitial] = useState(initialTab);
  if (initialTab && initialTab !== appliedInitial) {
    setAppliedInitial(initialTab);
    setTab(initialTab);
  }

  useEffect(() => {
    lastTab[memoryKey] = tab;
  }, [memoryKey, tab]);

  const lists: Record<BrowserTab, any[]> = {
    upcoming: potlucks.filter((p) => p.status !== "closed"),
    hosting: potlucks.filter((p) => p.hostId === uid),
    past: potlucks.filter((p) => p.status === "closed").sort((a, b) => toMillis(b.startsAt) - toMillis(a.startsAt)),
  };
  const shown = lists[tab];

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ marginBottom: 16, flexGrow: 0 }}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: active }}
              style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: active ? colors.coral : "transparent" }}>
              <Text style={{ fontWeight: "600", color: active ? colors.white : colors.coral }}>
                {t.label} <Text style={{ opacity: 0.75 }}>({lists[t.key].length})</Text>
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {loading ? <Loading /> : shown.length === 0 ? (
        <EmptyState emoji={tab === "past" ? "📜" : "🗓️"}
          title={tab === "past" ? "No finished showdowns yet" : tab === "hosting" ? "You haven’t hosted yet" : "Nothing coming up"}
          action={emptyAction}>
          {tab === "hosting" ? "Create a potluck and invite your friends with a code." : "Join a potluck with an invite code, or host your own."}
        </EmptyState>
      ) : (
        <Stack>
          {shown.map((p) => (
            <PotluckCard key={p.id} potluck={p} now={now} selected={p.id === selectedId}
              onPress={onSelect ? () => onSelect(p) : undefined} share={!onSelect} />
          ))}
        </Stack>
      )}
    </>
  );
}
