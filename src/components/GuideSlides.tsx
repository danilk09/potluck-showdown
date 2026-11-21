import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Icon, Row } from "./ui";
import { colors, type } from "../theme";

export interface Slide {
  icon: any;
  title: string;
  body: string;
}

/**
 * Walkthrough pages you can swipe between (or move with the buttons around it).
 * `step` and `onStep` keep it in sync with those buttons.
 */
export default function GuideSlides({ slides, step, onStep }: { slides: Slide[]; step: number; onStep: (i: number) => void }) {
  const [width, setWidth] = useState(0);
  const pager = useRef<any>(null);
  const shown = useRef(step);

  // A button press moves the pages; a swipe has already moved them.
  useEffect(() => {
    if (width && shown.current !== step) {
      shown.current = step;
      pager.current?.scrollTo({ x: step * width, animated: true });
    }
  }, [step, width]);

  const settle = (x: number) => {
    if (!width) return;
    const i = Math.max(0, Math.min(slides.length - 1, Math.round(x / width)));
    if (i !== shown.current) {
      shown.current = i;
      onStep(i);
    }
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        contentOffset={{ x: step * width, y: 0 }}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.x)}
        // The web has no momentum events; settle once a swipe lands on a page.
        onScroll={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          if (width && Math.abs(x / width - Math.round(x / width)) < 0.02) settle(x);
        }}
      >
        {slides.map((s) => (
          <View key={s.title} style={{ width: width || 1, alignItems: "center", paddingVertical: 16, paddingHorizontal: 8, gap: 12 }}>
            <Icon name={s.icon} size={54} color={colors.coral} />
            <Text style={[type.h3, { textAlign: "center" }]}>{s.title}</Text>
            <Text style={[type.body, { textAlign: "center" }]}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
      <Row gap={6} justify="center" accessibilityLabel={`Step ${step + 1} of ${slides.length}`}>
        {slides.map((s, i) => (
          <View
            key={s.title}
            style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === step ? colors.coral : colors.line }}
          />
        ))}
      </Row>
      <Text style={[type.small, type.muted, { textAlign: "center", marginTop: 8 }]}>Swipe to see more</Text>
    </View>
  );
}
