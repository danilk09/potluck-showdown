import React, { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../hooks/AuthContext";
import { friendlyError, joinPotluck, lookupInvite } from "../data/api";
import { normalizeInviteCode } from "../lib/inviteCode";
import { formatInfo } from "../lib/formats";
import { formatWhen } from "../lib/dates";
import { PHASE_CHIP, PHASE_LABEL, phaseOf } from "../lib/phase";
import { AuthorLine } from "./Avatar";
import { Banner, Button, Chip, Dialog, Icon, Input, Label, Row, Stack, Tile } from "./ui";
import { colors, type } from "../theme";

/**
 * "Join a potluck" popup for signed-in people: type the invite code, preview
 * the potluck, join. (Invite links open the full /join/CODE page instead.)
 */
export default function JoinDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [potluck, setPotluck] = useState<any>(null);
  const [status, setStatus] = useState<"idle" | "looking" | "found" | "missing">("idle");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setCode("");
    setPotluck(null);
    setStatus("idle");
    setError("");
    setBusy(false);
    onClose();
  };

  const find = async () => {
    if (code.length < 4 || status === "looking") return;
    setStatus("looking");
    setError("");
    try {
      const p = await lookupInvite(code);
      setPotluck(p);
      setStatus(p ? "found" : "missing");
    } catch (err) {
      setError(friendlyError(err));
      setStatus("idle");
    }
  };

  const open = (id: string) => {
    close();
    router.push(`/potlucks/${id}` as any);
  };

  const join = async () => {
    if (!potluck || busy) return;
    setBusy(true);
    setError("");
    try {
      await joinPotluck(potluck.id);
      open(potluck.id);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  const found = status === "found" && potluck;
  const phase = found ? phaseOf(potluck) : null;
  const isMember = found && potluck.memberIds?.includes(user?.uid);
  const full = found && potluck.maxGuests > 0 && potluck.memberIds?.length >= potluck.maxGuests;
  const fmt = found ? formatInfo(potluck.format) : null;

  return (
    <Dialog visible={visible} onClose={close} title="Join a potluck">
      <Stack gap={12}>
        <Text style={[type.body, type.muted]}>Enter the invite code from your host to preview the potluck before you join.</Text>
        <View>
          <Label required>Invite code</Label>
          <Row gap={8}>
            <Input
              style={[{ flex: 1 }, type.code]}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              autoFocus
              placeholder="HARVEST-7K2Q"
              accessibilityLabel="Invite code"
              value={code}
              onChangeText={(t) => {
                setCode(normalizeInviteCode(t));
                setStatus("idle");
                setPotluck(null);
              }}
              valid={status === "found"}
              invalid={status === "missing"}
              returnKeyType="search"
              onSubmitEditing={find}
            />
            <Button title="Find" loading={status === "looking"} disabled={code.length < 4} onPress={find} />
          </Row>
          {status === "missing" && (
            <Text style={[type.small, { color: colors.danger, marginTop: 4 }]}>
              No potluck uses that code. Check the spelling with your host.
            </Text>
          )}
        </View>
        {error ? <Banner>{error}</Banner> : null}

        {found && (
          <Tile tone="peach" style={{ padding: 14, gap: 10 }}>
            <Row wrap gap={6}>
              <Chip tone="plain">{`${fmt!.emoji} ${fmt!.label}`}</Chip>
              <Chip tone={PHASE_CHIP[phase!] as any}>{PHASE_LABEL[phase!]}</Chip>
            </Row>
            <View>
              <Text style={type.h3}>{potluck.title}</Text>
              {potluck.theme ? <Text style={[type.small, { color: colors.coral, fontWeight: "700" }]}>{potluck.theme}</Text> : null}
            </View>
            <AuthorLine uid={potluck.hostId} sub="Host" size={32} />
            <Stack gap={4}>
              <Row gap={6}>
                <Icon name="calendar-outline" size={16} color={colors.muted} />
                <Text style={[type.small, { flex: 1 }]}>{formatWhen(potluck.startsAt)}</Text>
              </Row>
              {potluck.location ? (
                <Row gap={6}>
                  <Icon name="location-outline" size={16} color={colors.muted} />
                  <Text style={[type.small, { flex: 1 }]} numberOfLines={2}>{potluck.location}</Text>
                </Row>
              ) : null}
              <Row gap={6}>
                <Icon name="people-outline" size={16} color={colors.muted} />
                <Text style={[type.small, { flex: 1 }]}>
                  {potluck.memberIds?.length || 0} going
                  {potluck.maxGuests > 0 ? ` · ${Math.max(0, potluck.maxGuests - (potluck.memberIds?.length || 0))} spots left` : ""}
                </Text>
              </Row>
            </Stack>
          </Tile>
        )}

        {found &&
          (isMember ? (
            <Button size="lg" title="You’re in! Open event" onPress={() => open(potluck.id)} />
          ) : phase === "closed" ? (
            <Banner tone="secondary">This showdown has already ended.</Banner>
          ) : full ? (
            <Banner tone="warning">This potluck is full.</Banner>
          ) : (
            <Button size="lg" icon="enter-outline" title={busy ? "Joining…" : "Join potluck"} loading={busy} onPress={join} />
          ))}
      </Stack>
    </Dialog>
  );
}
