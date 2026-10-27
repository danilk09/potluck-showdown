import React, { useState } from "react";
import { Linking, Text, View } from "react-native";
import { androidAppUrl, isWeb } from "../lib/platform";
import { colors, radius, type } from "../theme";
import { Button, Icon, IconButton } from "./ui";

let dismissed = false;

/** Web-only nudge for invitees who joined from an Android browser. */
export default function GetAppBanner() {
  const [hidden, setHidden] = useState(dismissed);
  const url = androidAppUrl();
  const isAndroidBrowser = isWeb && typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  if (!url || hidden || !isAndroidBrowser) return null;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: colors.ink,
        borderRadius: radius.lg,
        padding: 10,
        paddingLeft: 14,
        marginBottom: 12,
      }}
    >
      <Icon name="logo-android" size={24} color="#3ddc84" />
      <Text style={[type.small, { color: colors.white, flex: 1 }]}>
        <Text style={type.bold}>Get the Android app</Text> for photo uploads, sharing, and more.
      </Text>
      <Button size="sm" variant="white" title="Install" onPress={() => Linking.openURL(url)} />
      <IconButton
        name="close"
        color={colors.white}
        accessibilityLabel="Dismiss"
        onPress={() => {
          dismissed = true;
          setHidden(true);
        }}
      />
    </View>
  );
}
