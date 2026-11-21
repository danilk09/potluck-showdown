import React, { useState } from "react";
import { Pressable, StyleProp, Text, View, ViewStyle } from "react-native";
import { colors, radius } from "../theme";
import { Input, Label, Row } from "./ui";
import { formatTypedTime, fromMilitary, parseTypedTime, toTypedTime } from "./dateTimeValue";

interface TimeInputProps {
  label?: string;
  required?: boolean;
  value?: string | null;
  onChange: (val: string) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A time typed on the number pad ("630" shows as 6:30) with an AM/PM toggle.
 * A 24-hour time ("1300") is turned into 1:00 with PM picked.
 * Emits "HH:mm" in 24-hour time, or "" while the typed time isn't valid.
 */
export default function TimeInput({ label, required, value, onChange, disabled, style }: TimeInputProps) {
  const initial = toTypedTime(value);
  const [text, setText] = useState(initial?.text ?? "");
  const [pm, setPm] = useState(initial?.pm ?? true);
  const [touched, setTouched] = useState(false);
  // A new value from outside (like opening a draft) resets the field; our own updates don't.
  const [sent, setSent] = useState(value ?? "");
  const [seen, setSeen] = useState(value ?? "");
  if ((value ?? "") !== seen) {
    setSeen(value ?? "");
    if ((value ?? "") !== sent) {
      const next = toTypedTime(value);
      setText(next?.text ?? "");
      if (next) setPm(next.pm);
    }
  }

  const emit = (nextText: string, nextPm: boolean) => {
    const out = parseTypedTime(nextText, nextPm) ?? "";
    setSent(out);
    if (out !== (value ?? "")) onChange(out);
  };

  // Shows a 24-hour time as 12-hour with AM/PM picked for them.
  const show = (nextText: string, done: boolean) => {
    const converted = fromMilitary(nextText, done);
    const shown = converted?.text ?? nextText;
    const nextPm = converted ? converted.pm : pm;
    setText(shown);
    if (converted) setPm(nextPm);
    emit(shown, nextPm);
  };

  const type = (raw: string) => {
    let next = formatTypedTime(raw);
    // Backspacing over the ":" removes the digit before it.
    if (raw.length < text.length && next === text) next = formatTypedTime(next.replace(/\D/g, "").slice(0, -1));
    show(next, false);
  };

  const choose = (nextPm: boolean) => {
    setPm(nextPm);
    emit(text, nextPm);
  };

  const invalid = touched && Boolean(text) && !parseTypedTime(text, pm);
  return (
    <View style={style}>
      {label ? <Label required={required}>{label}</Label> : null}
      <Row gap={6}>
        <Input
          style={{ flex: 1, minWidth: 0 }}
          value={text}
          onChangeText={type}
          onBlur={() => {
            setTouched(true);
            show(text, true);
          }}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={5}
          selectTextOnFocus
          placeholder="6:30"
          editable={!disabled}
          invalid={invalid}
          accessibilityLabel={label ? `${label}, hours and minutes` : "Time"}
        />
        <View
          style={{ flexDirection: "row", borderWidth: 1, borderColor: colors.inputLine, borderRadius: radius.md, overflow: "hidden" }}
          accessibilityRole="radiogroup"
        >
          {(["AM", "PM"] as const).map((m) => {
            const on = (m === "PM") === pm;
            return (
              <Pressable
                key={m}
                disabled={disabled}
                onPress={() => choose(m === "PM")}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled }}
                style={{
                  paddingHorizontal: 10,
                  justifyContent: "center",
                  minHeight: 46,
                  backgroundColor: on ? colors.coral : colors.white,
                  opacity: disabled ? 0.55 : 1,
                }}
              >
                <Text style={{ fontWeight: "700", fontSize: 14, color: on ? colors.white : colors.muted }}>{m}</Text>
              </Pressable>
            );
          })}
        </View>
      </Row>
      {invalid ? (
        <Text style={{ color: colors.danger, fontSize: 13, marginTop: 4 }}>Enter a time like 6:30</Text>
      ) : null}
    </View>
  );
}
