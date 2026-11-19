import { createElement } from "react";
import { Pressable, Text, View, StyleProp, ViewStyle } from "react-native";
import { colors } from "../theme";
import { Label } from "./ui";
import TimeInput from "./TimeInput";
import { setDatePart, setTypedTimePart, DateTimeMode } from "./dateTimeValue";

interface DateTimeFieldProps {
  label?: string;
  mode?: DateTimeMode;
  value?: string | null;
  onChange: (val: string) => void;
  disabled?: boolean;
  clearable?: boolean;
  required?: boolean;
  /** Earliest selectable day ("YYYY-MM-DD"). */
  minDate?: string;
  style?: StyleProp<ViewStyle>;
  placeholder?: string;
}

/** Web build: the browser's calendar for dates, typed times (same string values as native). */
export default function DateTimeField({
  label,
  mode = "date",
  value,
  onChange,
  disabled,
  clearable,
  required,
  minDate,
  style,
}: DateTimeFieldProps) {
  if (mode === "time") {
    return <TimeInput label={label} required={required} value={value} onChange={onChange} disabled={disabled} style={style} />;
  }

  const dateInput = (part: string | undefined, change: (v: string) => void) =>
    createElement("input", {
      type: "date",
      value: part ?? "",
      min: minDate,
      disabled,
      "aria-label": mode === "datetime" ? `${label} date` : label,
      onChange: (e: any) => change(e.target.value),
      // Open the calendar on any click, not just on the small icon.
      onClick: (e: any) => {
        try {
          e.currentTarget.showPicker?.();
        } catch {
          // Some browsers only allow it from certain gestures; the field still works.
        }
      },
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
        cursor: disabled ? "default" : "pointer",
      },
    });

  return (
    <View style={style}>
      {label ? <Label required={required}>{label}</Label> : null}
      {mode === "datetime" ? (
        <View style={{ gap: 8 }}>
          {dateInput(value?.split("T")[0], (date) => onChange(setDatePart(value, date)))}
          <TimeInput value={value?.split("T")[1]} disabled={disabled} onChange={(time) => onChange(setTypedTimePart(value, time))} />
        </View>
      ) : (
        dateInput(value ?? undefined, onChange)
      )}
      {clearable && Boolean(value) && !disabled && (
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
