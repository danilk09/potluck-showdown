import { createElement } from "react";
import { Pressable, Text, View, StyleProp, ViewStyle } from "react-native";
import { colors } from "../theme";
import { Label } from "./ui";
import { setDatePart, setTimePart, DateTimeMode } from "./dateTimeValue";

const INPUT_TYPE: Record<string, string> = { date: "date", time: "time" };

interface DateTimeFieldProps {
  label?: string;
  mode?: DateTimeMode;
  value?: string | null;
  onChange: (val: string) => void;
  disabled?: boolean;
  clearable?: boolean;
  style?: StyleProp<ViewStyle>;
  placeholder?: string;
}

/** Web build: the browser's own date/time inputs (same string values as native). */
export default function DateTimeField({
  label,
  mode = "date",
  value,
  onChange,
  disabled,
  clearable,
  style,
}: DateTimeFieldProps) {
  const input = (kind: "date" | "time", part: string | undefined, change: (v: string) => void) =>
    createElement("input", {
      type: INPUT_TYPE[kind],
      value: part ?? "",
      disabled,
      "aria-label": mode === "datetime" ? `${label} ${kind}` : label,
      onChange: (e: any) => change(e.target.value),
      style: {
        font: "inherit",
        fontSize: 16,
        padding: "10px 14px",
        borderRadius: 12,
        border: `1px solid ${colors.inputLine}`,
        background: disabled ? "#f6f0ec" : colors.white,
        color: colors.ink,
        minHeight: 48,
        boxSizing: "border-box",
        width: "100%",
        minWidth: 0,
        WebkitAppearance: "auto",
        appearance: "auto",
        colorScheme: "light",
      },
    });

  return (
    <View style={style}>
      {label ? <Label>{label}</Label> : null}
      {mode === "datetime" ? (
        <View style={{ gap: 8 }}>
          {input("date", value?.split("T")[0], (date) => onChange(setDatePart(value, date)))}
          {input("time", value?.split("T")[1], (time) => onChange(setTimePart(value, time)))}
        </View>
      ) : (
        input(mode as "date" | "time", value ?? undefined, onChange)
      )}
      {clearable && value && !disabled && (
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange("")}
          style={{ paddingVertical: 8 }}
        >
          <Text style={{ color: colors.coral }}>Clear {label}</Text>
        </Pressable>
      )}
    </View>
  );
}
