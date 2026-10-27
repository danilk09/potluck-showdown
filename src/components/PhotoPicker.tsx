import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { compressImage, pickImage } from "../lib/images";
import { isNative } from "../lib/platform";
import { colors, radius, type } from "../theme";
import { Button, FsImage, Icon, OptionSheet } from "./ui";

interface PhotoPickerProps {
  current?: string | null;
  pending?: string | null;
  onPick: (dataUrl: string) => void;
  onRemove: () => void;
  title: string;
  hint?: string;
  compact?: boolean;
}

/**
 * Photo input: camera or gallery. Photos are compressed on-device; the parent
 * receives a data URL (`onPick`) to upload on save, or `onRemove` when removed.
 */
export default function PhotoPicker({
  current,
  pending,
  onPick,
  onRemove,
  title,
  hint = "Optional · JPG or PNG",
  compact = false,
}: PhotoPickerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState(false);

  const choose = async (camera: boolean) => {
    setError("");
    try {
      const asset = await pickImage({ camera });
      if (!asset) return;
      setBusy(true);
      onPick(await compressImage(asset));
    } catch (err: any) {
      setError(err?.message || "Failed to pick image");
    } finally {
      setBusy(false);
    }
  };

  const open = () => (isNative ? setSheet(true) : choose(false));

  const hasPhoto = pending || current;
  return (
    <View>
      <OptionSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title={title}
        options={[
          { label: "Take a photo", icon: "camera-outline", onPress: () => choose(true) },
          { label: "Choose from gallery", icon: "images-outline", onPress: () => choose(false) },
        ]}
      />
      {hasPhoto ? (
        <View style={[s.preview, { aspectRatio: compact ? 4 / 3 : 16 / 10 }]}>
          {pending ? <Image source={{ uri: pending }} style={s.fill} /> : <FsImage src={current} />}
          <View style={s.actions}>
            <Button size="sm" variant="white" icon="refresh" title="Replace" onPress={open} />
            <Button size="sm" variant="white" icon="trash-outline" onPress={onRemove} accessibilityLabel="Remove photo" />
          </View>
        </View>
      ) : compact ? (
        <Pressable onPress={open} style={s.compact} accessibilityRole="button">
          {busy ? <ActivityIndicator color={colors.coral} /> : <Icon name="camera-outline" size={22} color={colors.coral} />}
          <Text style={[type.small, { color: colors.coral, fontWeight: "600" }]}>{title}</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={open}
          style={({ pressed }) => [s.drop, pressed && { borderColor: colors.coral }]}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color={colors.coral} /> : <Icon name="camera-outline" size={30} color={colors.coral} />}
          <Text style={[type.body, type.bold, { marginTop: 4 }]}>{title}</Text>
          <Text style={[type.small, type.muted]}>{hint}</Text>
        </Pressable>
      )}
      {error ? <Text style={[type.small, { color: colors.danger, marginTop: 4 }]}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  preview: { borderRadius: radius.lg, overflow: "hidden", maxHeight: 320, backgroundColor: colors.peachSoft },
  fill: { width: "100%", height: "100%" },
  actions: { position: "absolute", right: 8, bottom: 8, flexDirection: "row", gap: 8 },
  compact: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  drop: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#f1c4b3",
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: 24,
    alignItems: "center",
  },
});
