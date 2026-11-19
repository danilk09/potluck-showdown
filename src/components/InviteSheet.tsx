import React from "react";
import { Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { copyText, inviteLink, shareLink } from "../lib/platform";
import { inviteMessage } from "../lib/inviteMessage";
import { useAuth } from "../hooks/AuthContext";
import { colors, type } from "../theme";
import { Button, Dialog, Stack, Tile, useToast } from "./ui";

interface InviteSheetProps {
  potluck: any;
  visible: boolean;
  onClose: () => void;
  justCreated?: boolean;
}

/** Opens the share sheet with a ready-to-send invite for a potluck. */
export function useShareInvite() {
  const toast = useToast();
  const { user } = useAuth();
  return async (potluck: any) => {
    const res = await shareLink({
      title: `Join ${potluck.title} on Potluck Showdown`,
      text: inviteMessage(potluck),
      url: inviteLink(potluck.inviteCode, user?.uid),
    });
    if (res === "copied") toast("Invite copied. Paste it into a message.");
  };
}

/**
 * Invite sheet: the code, a QR code, and the share sheet. The link opens the
 * web version for people without the app (they can join as a guest).
 */
export default function InviteSheet({ potluck, visible, onClose, justCreated }: InviteSheetProps) {
  const toast = useToast();
  const shareInvite = useShareInvite();
  const { user } = useAuth();
  const url = inviteLink(potluck.inviteCode, user?.uid);
  const share = () => shareInvite(potluck);
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
