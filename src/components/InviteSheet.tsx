import React from "react";
import { Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { copyText, inviteLink, shareLink } from "../lib/platform";
import { colors, type } from "../theme";
import { Button, Dialog, Stack, Tile, useToast } from "./ui";

interface InviteSheetProps {
  potluck: any;
  visible: boolean;
  onClose: () => void;
  justCreated?: boolean;
}

/**
 * Invite sheet: the code, a QR code, and the share sheet. The link opens the
 * web version for people without the app (they can join as a guest).
 */
export default function InviteSheet({ potluck, visible, onClose, justCreated }: InviteSheetProps) {
  const toast = useToast();
  const url = inviteLink(potluck.inviteCode);
  const share = async () => {
    const res = await shareLink({
      title: potluck.title,
      text: `Join my potluck showdown "${potluck.title}"! Code: ${potluck.inviteCode}`,
      url,
    });
    if (res === "copied") toast("Invite link copied");
  };
  return (
    <Dialog visible={visible} onClose={onClose} title={justCreated ? "Your showdown is live! 🎉" : "Invite people"}>
      <Stack gap={12} style={{ alignItems: "center" }}>
        <Text style={[type.body, type.muted, { textAlign: "center" }]}>
          Share the code or link. Guests can join right in their browser, and no download is needed.
        </Text>
        <Tile tone="peach" style={{ alignSelf: "stretch", paddingVertical: 12, alignItems: "center" }}>
          <Text style={[type.caps, type.muted]}>Invite code</Text>
          <Text style={[type.code, { fontSize: 26, color: colors.ink }]} selectable>
            {potluck.inviteCode}
          </Text>
        </Tile>
        <View style={{ padding: 14, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line }}>
          <QRCode value={url} size={168} color={colors.ink} backgroundColor={colors.white} />
        </View>
        <Text style={[type.small, type.muted]}>Scan to join in person</Text>
        <Stack gap={8} style={{ alignSelf: "stretch" }}>
          <Button size="lg" icon="share-social-outline" title="Share invite" onPress={share} />
          <Button
            variant="outline"
            icon="link"
            title="Copy link"
            onPress={async () => {
              await copyText(url);
              toast("Link copied");
            }}
          />
        </Stack>
      </Stack>
    </Dialog>
  );
}
