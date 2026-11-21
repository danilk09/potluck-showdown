import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { goToTab, useKeyboardVisible } from "./ui";
import { colors } from "../theme";

export type TabDef = {
  name: string;
  href: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
};

// Five destinations, per Android navigation-bar guidance. "Create" lives on
// Home/Events as a primary button; the recipe bank gets a tab of its own.
export const TABS: TabDef[] = [
  { name: "index", href: "/", title: "Home", icon: "home" },
  { name: "feed", href: "/feed", title: "Feed", icon: "image" },
  { name: "recipes", href: "/recipes", title: "Recipes", icon: "book" },
  { name: "events", href: "/events", title: "Events", icon: "calendar" },
  { name: "profile", href: "/profile", title: "Profile", icon: "person" },
];

const TAB_PATHS = new Set(TABS.map((t) => t.href));

/** True on the tab screens themselves, which already have the real tab bar. */
export function isTabPath(pathname: string): boolean {
  return TAB_PATHS.has(pathname);
}

/** Which tab a screen above the tabs belongs to, so the bar shows where you are. */
function sectionOf(pathname: string): string {
  if (pathname.startsWith("/potlucks") || pathname.startsWith("/create")) return "events";
  if (pathname.startsWith("/feed")) return "feed";
  if (pathname.startsWith("/frames") || pathname.startsWith("/feedback")) return "profile";
  return "index";
}

export function TabIcon({ icon, focused, color }: { icon: TabDef["icon"]; focused: boolean; color: string }) {
  return (
    <View style={[s.pill, focused && { backgroundColor: colors.peachSoft }]}>
      <Ionicons name={focused ? icon : (`${icon}-outline` as any)} size={21} color={color} />
    </View>
  );
}

/**
 * The tab bar, drawn under screens that open on top of the tabs (event details,
 * recipes, rating…), so a base page is always one tap away.
 */
export default function BottomNav({ pathname }: { pathname: string }) {
  const insets = useSafeAreaInsets();
  const typing = useKeyboardVisible();
  if (typing) return null;
  const current = sectionOf(pathname);
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 6) }]} accessibilityRole="tablist">
      {TABS.map((t) => {
        const focused = t.name === current;
        const color = focused ? colors.coral : colors.muted;
        return (
          <Pressable
            key={t.name}
            onPress={() => goToTab(t.href)}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={t.title}
            style={s.item}
          >
            <TabIcon icon={t.icon} focused={focused} color={color} />
            <Text style={[s.label, { color }]}>{t.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 6,
  },
  item: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 2 },
  label: { fontSize: 11.5, fontWeight: "600" },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
});
