import React, { useState } from "react";
import { Modal, Platform, Pressable, Text, View, StyleProp, ViewStyle } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "../theme";
import { Button, Icon, IconButton, Label, Row, styles as ui, useSinglePress } from "./ui";
import TimeInput from "./TimeInput";
import { formatValue, parseValue, setDatePart, setTypedTimePart, toValue, DateTimeMode } from "./dateTimeValue";

interface DateTimeFieldProps {
  label?: string;
  mode?: DateTimeMode;
  value?: string | null;
  onChange: (val: string) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  required?: boolean;
  /** Earliest selectable day ("YYYY-MM-DD"). */
  minDate?: string;
  style?: StyleProp<ViewStyle>;
}

/** Dates use the operating system's calendar; times are typed on the number pad. */
export default function DateTimeField({
  label,
  mode = "date",
  value,
  onChange,
  placeholder = "Not set",
  clearable,
  disabled,
  required,
  minDate,
  style,
}: DateTimeFieldProps) {
  const [iosDraft, setIosDraft] = useState<Date | null>(null);
  const insets = useSafeAreaInsets();
  const minimumDate = minDate ? parseValue("date", minDate) : undefined;
  const open = () => {
    let start = parseValue("date", value);
    if (minimumDate && start < minimumDate) start = minimumDate;
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: start,
        mode: "date",
        display: "calendar",
        minimumDate,
        onValueChange: (_, selected) => {
          if (selected) onChange(toValue("date", selected));
        },
      });
    } else {
      setIosDraft(start);
    }
  };
  // A double tap would otherwise open two Android date dialogs.
  const openOnce = useSinglePress(open);

  if (mode === "datetime") {
    const [date = "", time = ""] = (value || "").split("T");
    return (
      <View style={style}>
        {label ? <Label required={required}>{label}</Label> : null}
        <Row gap={8} align="flex-start">
          <DateTimeField
            style={{ flex: 1 }}
            label="Date"
            mode="date"
            value={date}
            disabled={disabled}
            minDate={minDate}
            placeholder="Pick date"
            onChange={(next) => onChange(setDatePart(value, next))}
          />
          <TimeInput
            style={{ flex: 1 }}
            label="Time"
            value={time}
            disabled={disabled}
            onChange={(next) => onChange(setTypedTimePart(value, next))}
          />
        </Row>
        {clearable && Boolean(value) && !disabled && (
          <Button
            variant="link"
            title={`Clear ${label}`}
            style={{ alignSelf: "flex-start", marginTop: 4 }}
            onPress={() => onChange("")}
          />
        )}
      </View>
    );
  }

  if (mode === "time") {
    return <TimeInput label={label} required={required} value={value} onChange={onChange} disabled={disabled} style={style} />;
  }

  return (
    <View style={style}>
      {label ? <Label required={required}>{label}</Label> : null}
      <Row gap={4}>
        <Pressable
          onPress={openOnce}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={label || placeholder}
          style={[
            ui.input,
            ui.select,
            { flex: 1, minWidth: 0 },
            disabled && { backgroundColor: "#f6f0ec" },
          ]}
        >
          <Icon name="calendar-outline" size={18} color={colors.muted} />
          <Text
            style={[
              type.body,
              { flex: 1 },
              !value && { color: "#b0a49c" },
              disabled && { color: colors.muted },
            ]}
            numberOfLines={1}
          >
            {value ? formatValue("date", value) : placeholder}
          </Text>
        </Pressable>
        {clearable && Boolean(value) && !disabled && (
          <IconButton
            name="close-circle"
            size={20}
            color={colors.muted}
            onPress={() => onChange("")}
            accessibilityLabel={`Clear ${label}`}
          />
        )}
      </Row>
      {Platform.OS === "ios" && (
        <Modal
          visible={Boolean(iosDraft)}
          presentationStyle="pageSheet"
          animationType="slide"
          onRequestClose={() => setIosDraft(null)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: colors.cream,
              paddingTop: 20 + insets.top,
              paddingHorizontal: 20,
              paddingBottom: 20 + insets.bottom,
            }}
          >
            <Row justify="space-between" style={{ marginBottom: 24 }}>
              <Button variant="linkMuted" title="Cancel" onPress={() => setIosDraft(null)} />
              <Text style={type.h3}>{label}</Text>
              <Button
                variant="link"
                title="Done"
                onPress={() => {
                  if (iosDraft) onChange(toValue("date", iosDraft));
                  setIosDraft(null);
                }}
              />
            </Row>
            {iosDraft && (
              <DateTimePicker
                value={iosDraft}
                mode="date"
                display="inline"
                minimumDate={minimumDate}
                themeVariant="light"
                accentColor={colors.coral}
                style={{ alignSelf: "stretch", backgroundColor: colors.cream }}
                onValueChange={(_, selected) => {
                  // Picking a day is the choice, the same as tapping Done.
                  if (selected) {
                    onChange(toValue("date", selected));
                    setIosDraft(null);
                  }
                }}
              />
            )}
          </View>
        </Modal>
      )}
    </View>
  );
}
