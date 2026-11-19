import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Linking, Modal, StyleSheet, Text, View } from "react-native";
import { aiScoreOnFive } from "../lib/healthScore";
import { colors, radius, shadow, type } from "../theme";
import { Button, Icon, Row } from "./ui";

export function HealthScoreMeter({
  title = "Healthiness",
  score,
}: {
  title?: string;
  score: number | null;
}) {
  const [fill] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;

    async function reveal() {
      fill.setValue(0);
      if (score == null) return;
      const reducedMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      if (cancelled) return;
      if (reducedMotion) {
        fill.setValue(score);
        return;
      }
      animation = Animated.timing(fill, {
        toValue: score,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      });
      animation.start();
    }

    void reveal();
    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [score, fill]);

  return (
    <View style={styles.card}>
      <Row justify="space-between" align="center">
        <Row gap={8} style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.icon}>
            <Icon name="sparkles" size={16} color={colors.mintDark} />
          </View>
          <Text style={[type.h4, { flex: 1 }]} numberOfLines={1}>{title}</Text>
        </Row>
        <View style={styles.pill}>
          <Text style={[type.caps, { color: colors.mintDark }]}>AI</Text>
        </View>
      </Row>
      {score == null ? (
        <Text style={[type.body, { marginTop: 8 }]}>No health score on this dish yet.</Text>
      ) : (
        <View style={{ marginTop: 6 }} accessibilityLiveRegion="polite">
          <Text style={styles.number}>{score}</Text>
          <Text style={[type.small, type.muted]}>out of 100</Text>
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityLabel={title}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={score}
          >
            <Animated.View style={[styles.fill, {
              width: fill.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
            }]} />
          </View>
          <Text style={[type.small, { marginTop: 8 }]}>
            Counts as <Text style={type.bold}>{aiScoreOnFive(score).toFixed(1)} / 5</Text> in the weighted total.
          </Text>
          <Text style={[type.small, type.muted, { marginTop: 4 }]}>
            Nutrition sources include USDA FoodData Central and{" "}
            <Text
              accessibilityRole="link"
              style={styles.sourceLink}
              onPress={() => { void Linking.openURL("https://world.openfoodfacts.org/data").catch(() => undefined); }}
            >
              Open Food Facts
            </Text>
            .
          </Text>
        </View>
      )}
    </View>
  );
}

export function HealthScoreModal({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={[type.small, type.muted, { marginBottom: 8 }]}>Sample score</Text>
          <HealthScoreMeter title={title} score={82} />
          <Button title="Close" onPress={onClose} style={{ marginTop: 12 }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.mintSoft,
    borderRadius: radius.lg,
    padding: 16,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  number: { fontSize: 52, lineHeight: 56, fontWeight: "800", color: colors.ink, letterSpacing: -1 },
  sourceLink: { color: colors.mintDark, textDecorationLine: "underline" },
  track: {
    height: 14,
    marginTop: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.72)",
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 999, backgroundColor: colors.mint },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(34, 27, 23, 0.45)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    borderRadius: radius.xl,
    backgroundColor: colors.cream,
    padding: 16,
    ...shadow,
  },
});
