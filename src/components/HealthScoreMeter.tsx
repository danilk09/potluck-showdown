import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { aiScoreOnFive, mockHealthScore } from "../lib/healthScore";
import { colors, radius, shadow, type } from "../theme";
import { Button, Icon, Row } from "./ui";

const SCAN_STEPS = [
  { to: 0.28, ms: 560, label: "Reading the ingredient list…" },
  { to: 0.55, ms: 560, label: "Weighing portions and balance…" },
  { to: 0.8, ms: 520, label: "Estimating nutrition…" },
  { to: 1, ms: 420, label: "Finishing the health score…" },
];

type Phase = "scan" | "score" | "empty";

function fillWidth(value: Animated.Value, width: number) {
  return value.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(width, 0)] });
}

export function HealthScoreMeter({
  title = "Healthiness",
  score = null,
  variant = "reveal",
  runId = 0,
  compact = false,
  onDone,
  action,
}: {
  title?: string;
  /** Known 0–100 score. Ignored while `variant` is `calculate`. */
  score?: number | null;
  variant?: "calculate" | "reveal";
  runId?: number;
  compact?: boolean;
  onDone?: (score: number) => void;
  action?: React.ReactNode;
}) {
  const [progress] = useState(() => new Animated.Value(0));
  const [scoreBar] = useState(() => new Animated.Value(0));
  const [shimmer] = useState(() => new Animated.Value(0));
  const onDoneRef = useRef(onDone);
  const reported = useRef(false);

  const [phase, setPhase] = useState<Phase>(variant === "calculate" ? "scan" : score == null ? "empty" : "score");
  const [label, setLabel] = useState(variant === "calculate" ? SCAN_STEPS[0].label : "Health score");
  const [display, setDisplay] = useState<number | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(variant === "reveal" ? score ?? null : null);
  const [trackWidth, setTrackWidth] = useState(0);

  const scanWidth = useMemo(() => fillWidth(progress, trackWidth), [progress, trackWidth]);
  const revealWidth = useMemo(() => fillWidth(scoreBar, trackWidth), [scoreBar, trackWidth]);
  const shift = useMemo(
    () => shimmer.interpolate({ inputRange: [0, 1], outputRange: [-120, 280] }),
    [shimmer]
  );

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;
    let frame = 0;
    reported.current = false;

    const stop = () => {
      cancelled = true;
      loop?.stop();
      progress.stopAnimation();
      scoreBar.stopAnimation();
      if (frame) cancelAnimationFrame(frame);
    };

    const finish = (final: number) => {
      if (cancelled || reported.current) return;
      reported.current = true;
      if (variant === "calculate") onDoneRef.current?.(final);
    };

    const countTo = (final: number) => {
      setDisplay(0);
      const start = Date.now();
      const tick = () => {
        if (cancelled) return;
        const t = Math.min(1, (Date.now() - start) / 620);
        const eased = 1 - (1 - t) ** 3;
        setDisplay(Math.round(final * eased));
        if (t < 1) frame = requestAnimationFrame(tick);
        else finish(final);
      };
      frame = requestAnimationFrame(tick);
    };

    const showScore = (final: number, duration: number) => {
      setFinalScore(final);
      setPhase("score");
      setLabel("Health score");
      scoreBar.setValue(0);
      if (duration <= 0) {
        scoreBar.setValue(final / 100);
        setDisplay(final);
        finish(final);
        return;
      }
      Animated.timing(scoreBar, {
        toValue: final / 100,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
      countTo(final);
    };

    const run = async () => {
      let reduce = false;
      try {
        reduce = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {
        reduce = false;
      }
      if (cancelled) return;

      if (variant === "reveal") {
        if (score == null || !Number.isFinite(Number(score))) {
          setPhase("empty");
          setDisplay(null);
          setLabel("No health score yet");
          return;
        }
        showScore(Math.max(0, Math.min(100, Math.round(Number(score)))), reduce ? 0 : 820);
        return;
      }

      const rolled = mockHealthScore();
      setFinalScore(rolled);
      if (reduce) {
        showScore(rolled, 0);
        return;
      }

      setPhase("scan");
      setDisplay(null);
      setLabel(SCAN_STEPS[0].label);
      progress.setValue(0);
      shimmer.setValue(0);
      loop = Animated.loop(
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1050,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== "web",
        })
      );
      loop.start();

      let step = 0;
      const next = () => {
        if (cancelled) return;
        if (step >= SCAN_STEPS.length) {
          loop?.stop();
          showScore(rolled, 700);
          return;
        }
        const stage = SCAN_STEPS[step];
        step += 1;
        setLabel(stage.label);
        Animated.timing(progress, {
          toValue: stage.to,
          duration: stage.ms,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }).start(({ finished }) => {
          if (finished && !cancelled) next();
        });
      };
      next();
    };

    void run();
    return stop;
  }, [variant, score, runId, progress, scoreBar, shimmer]);

  const shown = phase === "score" ? display : null;
  const numberSize = compact ? 36 : 52;

  return (
    <View
      style={[styles.card, compact && styles.cardCompact]}
      accessibilityRole="progressbar"
      accessibilityLabel={
        shown != null ? `${title} health score ${shown} out of 100` : `Calculating ${title}`
      }
      accessibilityValue={{ min: 0, max: 100, now: shown ?? 0 }}
    >
      <Row justify="space-between" align="center">
        <Row gap={8} style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.icon}>
            <Icon name="sparkles" size={16} color={colors.mintDark} />
          </View>
          <Text style={[type.h4, { flex: 1 }]} numberOfLines={1}>
            {title}
          </Text>
        </Row>
        <View style={styles.pill}>
          <Text style={[type.caps, { color: colors.mintDark }]}>AI</Text>
        </View>
      </Row>

      {phase === "empty" ? (
        <Text style={[type.body, { marginTop: 8 }]}>No health score on this dish yet.</Text>
      ) : phase === "scan" ? (
        <Text style={[type.h3, { marginTop: 10 }]}>Calculating</Text>
      ) : (
        <View style={{ marginTop: 6 }} accessibilityLiveRegion="polite">
          <Text style={[styles.number, { fontSize: numberSize, lineHeight: numberSize + 4 }]}>{shown == null ? "–" : shown}</Text>
          <Text style={[type.small, type.muted]}>out of 100</Text>
        </View>
      )}

      {phase !== "empty" && (
        <View
          style={[styles.track, { marginTop: phase === "score" ? 10 : 12 }]}
          onLayout={(event) => {
            const next = event.nativeEvent.layout.width;
            setTrackWidth((current) => (Math.abs(current - next) < 1 ? current : next));
          }}
        >
          <Animated.View
            style={[
              styles.fill,
              {
                width: phase === "scan" ? scanWidth : revealWidth,
                backgroundColor: phase === "scan" ? colors.lilac : colors.mint,
              },
            ]}
          />
          {phase === "scan" && (
            <Animated.View pointerEvents="none" style={[styles.shimmer, { transform: [{ translateX: shift }] }]} />
          )}
        </View>
      )}

      <Text style={[type.small, { marginTop: 8, color: phase === "scan" ? colors.lilac : colors.muted }]}>{label}</Text>

      {phase === "score" && finalScore != null && (
        <Text style={[type.small, { marginTop: 2 }]}>
          Counts as <Text style={type.bold}>{aiScoreOnFive(finalScore).toFixed(1)} / 5</Text> in the weighted total.
        </Text>
      )}

      {phase === "empty" && action ? <View style={{ marginTop: 10 }}>{action}</View> : null}

      <Text style={[type.small, type.muted, { marginTop: 8 }]}>Stand-in score. Real AI scoring comes later.</Text>
    </View>
  );
}

export function HealthScoreModal({
  visible,
  categories,
  purpose = "commit",
  saving = false,
  savingLabel = "Saving…",
  onCancel,
  onComplete,
}: {
  visible: boolean;
  categories: { id: string; name: string }[];
  purpose?: "preview" | "commit";
  saving?: boolean;
  savingLabel?: string;
  onCancel: () => void;
  onComplete?: (scores: Record<string, number>) => void;
}) {
  const [cursor, setCursor] = useState(0);
  const [replay, setReplay] = useState(0);
  const [finished, setFinished] = useState(false);
  const collected = useRef<Record<string, number>>({});
  const sent = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const current = categories[cursor];
  const locked = saving || (purpose === "commit" && finished);

  const handleDone = (score: number) => {
    if (!current) return;
    collected.current = { ...collected.current, [current.id]: score };
    const last = cursor >= categories.length - 1;
    if (!last && purpose === "commit") {
      setCursor(cursor + 1);
      return;
    }
    setFinished(true);
    if (purpose === "commit" && !sent.current) {
      sent.current = true;
      onCompleteRef.current?.({ ...collected.current });
    }
  };

  const requestClose = () => {
    if (locked) return;
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={requestClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {categories.length > 1 && purpose === "commit" && (
            <Text style={[type.caps, { color: colors.mintDark, marginBottom: 8 }]}>
              {Math.min(cursor + 1, categories.length)} of {categories.length}
            </Text>
          )}
          {visible && current ? (
            <HealthScoreMeter
              key={`${current.id}-${cursor}-${replay}`}
              title={current.name}
              variant="calculate"
              runId={replay}
              onDone={handleDone}
            />
          ) : null}
          {purpose === "commit" && finished && (
            <Row gap={8} style={{ marginTop: 12 }}>
              <ActivityIndicator color={colors.mint} />
              <Text style={[type.body, { flex: 1 }]}>{savingLabel}</Text>
            </Row>
          )}
          {purpose === "preview" && finished && (
            <Row gap={8} style={{ marginTop: 12 }}>
              <Button
                title="Watch again"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => {
                  setFinished(false);
                  sent.current = false;
                  collected.current = {};
                  setReplay((n) => n + 1);
                }}
              />
              <Button title="Close" style={{ flex: 1 }} onPress={onCancel} />
            </Row>
          )}
          {!finished && !saving && (
            <Button variant="link" title={purpose === "preview" ? "Close" : "Cancel"} onPress={onCancel} style={{ marginTop: 4 }} />
          )}
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
  cardCompact: { padding: 12 },
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
  number: { fontWeight: "800", color: colors.ink, letterSpacing: -1 },
  track: {
    height: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.72)",
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 999 },
  shimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 72,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
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
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    padding: 16,
    ...shadow,
  },
});
