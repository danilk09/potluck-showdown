import React, { useState } from "react";
import { Modal, Platform, Pressable, Text, View, StyleProp, ViewStyle } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "../theme";
import { Button, Icon, IconButton, Label, Row, styles as ui } from "./ui";
import { formatValue, parseValue, setDatePart, setTimePart, toValue, DateTimeMode } from "./dateTimeValue";

interface DateTimeFieldProps {
  label?: string;
  mode?: DateTimeMode;
  value?: string | null;
  onChange: (val: string) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Use the operating system's date and time controls on iOS and Android. */
export default function DateTimeField({
  label,
  mode = "date",
  value,
  onChange,
  placeholder = "Not set",
  clearable,
  disabled,
  style,
}: DateTimeFieldProps) {
  const [iosDraft, setIosDraft] = useState<Date | null>(null);
  const insets = useSafeAreaInsets();

  if (mode === "datetime") {
    const [date = "", time = ""] = (value || "").split("T");
    return (
      <View style={style}>
        {label ? <Label>{label}</Label> : null}
        <Row gap={8} align="flex-start">
          <DateTimeField
            style={{ flex: 1 }}
            label="Date"
            mode="date"
            value={date}
            disabled={disabled}
            placeholder="Pick date"
            onChange={(next) => onChange(setDatePart(value, next))}
          />
          <DateTimeField
            style={{ flex: 1 }}
            label="Time"
            mode="time"
            value={time}
            disabled={disabled}
            placeholder="Pick time"
            onChange={(next) => onChange(setTimePart(value, next))}
          />
        </Row>
        {clearable && value && !disabled && (
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

  const open = () => {
    const start = parseValue(mode, value);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: start,
        mode,
        display: "default",
        onValueChange: (_, selected) => {
          if (selected) onChange(toValue(mode, selected));
        },
      });
    } else {
      setIosDraft(start);
    }
  };

  return (
    <View style={style}>
      {label ? <Label>{label}</Label> : null}
      <Row gap={4}>
        <Pressable
          onPress={open}
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
          <Icon name={mode === "time" ? "time-outline" : "calendar-outline"} size={18} color={colors.muted} />
          <Text
            style={[
              type.body,
              { flex: 1 },
              !value && { color: "#b0a49c" },
              disabled && { color: colors.muted },
            ]}
            numberOfLines={1}
          >
            {value ? formatValue(mode, value) : placeholder}
          </Text>
        </Pressable>
        {clearable && value && !disabled && (
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
                  if (iosDraft) onChange(toValue(mode, iosDraft));
                  setIosDraft(null);
                }}
              />
            </Row>
            {iosDraft && (
              <DateTimePicker
                value={iosDraft}
                mode={mode}
                display="spinner"
                themeVariant="light"
                textColor={colors.ink}
                style={{ height: 240, alignSelf: "stretch", backgroundColor: colors.cream }}
                onValueChange={(_, selected) => {
                  if (selected) setIosDraft(selected);
                }}
              />
            )}
          </View>
        </Modal>
      )}
    </View>
  );
}
