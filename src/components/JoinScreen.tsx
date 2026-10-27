import React, { useCallback, useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { router } from "expo-router";
import { authErrorMessage, useAuth } from "../hooks/AuthContext";
import { friendlyError, joinPotluck, lookupInvite } from "../data/api";
import { normalizeInviteCode } from "../lib/inviteCode";
import { formatInfo } from "../lib/formats";
import { formatTime, formatWhen } from "../lib/dates";
import { PHASE_LABEL, phaseOf } from "../lib/phase";
import { androidAppUrl, isWeb } from "../lib/platform";
import { AuthorLine } from "./Avatar";
import {
  Banner,
  Button,
  Card,
  Chip,
  HeroCard,
  Input,
  Label,
  LoadingScreen,
  PageHeader,
  Row,
  Screen,
  Stack,
  Tile,
} from "./ui";
import { colors, type } from "../theme";

/** Shown to signed-out visitors (usually opening an invite link). */
function InviteGate({ code }: { code: string }) {
  const { signInGuest } = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = code ? `/join/${code}` : "/join";
  const appUrl = androidAppUrl();

  const joinAsGuest = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await signInGuest(name.trim());
    } catch (err: any) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Stack gap={16}>
      <HeroCard>
        <Chip tone="default">You’re invited</Chip>
        <Text style={[type.h2, { color: colors.white, marginTop: 8, marginBottom: 4 }]}>
          Join the potluck showdown
        </Text>
        <Text style={[type.body, { color: colors.white }]}>
          {code ? (
            <>
              Invite code <Text style={type.code}>{code}</Text>
            </>
          ) : (
            "Enter your invite code after you continue."
          )}
        </Text>
      </HeroCard>

      <Card style={{ padding: 16 }}>
        <Text style={[type.h4, { marginBottom: 4 }]}>Continue as a guest</Text>
        <Text style={[type.small, type.muted, { marginBottom: 12 }]}>
          No account needed. Join as a guest to claim a dish, browse recipes, and vote.
        </Text>
        {error ? <Banner style={{ marginBottom: 10 }}>{error}</Banner> : null}
        <Label>Your name</Label>
        <Row gap={8}>
          <Input
            style={{ flex: 1 }}
            maxLength={40}
            value={name}
            onChangeText={setName}
            placeholder="How others will see you"
            accessibilityLabel="Your name"
            returnKeyType="go"
            onSubmitEditing={joinAsGuest}
          />
          <Button title="Continue" loading={busy} disabled={!name.trim()} onPress={joinAsGuest} />
        </Row>
        <Text style={[type.small, type.muted, { marginTop: 8 }]}>
          Guest passes live on this device. Save an account from your profile any time to keep them.
        </Text>
      </Card>

      <Button
        variant="outline"
        title="I have an account"
        onPress={() => router.push({ pathname: "/signin", params: { next } } as any)}
      />
      {isWeb && appUrl && typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent) && (
        <Button
          variant="dark"
          icon="logo-android"
          title="Get the Android app instead"
          onPress={() => Linking.openURL(appUrl)}
        />
      )}
    </Stack>
  );
}

function Preview({ potluck, onJoin, busy }: { potluck: any; onJoin: () => void; busy: boolean }) {
  const { user } = useAuth();
  const fmt = formatInfo(potluck.format);
  const phase = phaseOf(potluck);
  const isMember = potluck.memberIds?.includes(user?.uid);
  const full = potluck.maxGuests && potluck.memberIds?.length >= potluck.maxGuests;
  const totalWeight = potluck.scoring?.reduce((s: number, c: any) => s + c.weight, 0) || 1;

  return (
    <Stack gap={12}>
      <Card style={{ overflow: "hidden" }}>
        <HeroCard style={{ borderRadius: 0 }}>
          <Chip tone="default">{`${fmt.emoji} ${fmt.label}`}</Chip>
          <Text style={[type.h2, { color: colors.white, marginTop: 8, marginBottom: 4 }]}>{potluck.title}</Text>
          <Text style={[type.body, type.bold, { color: colors.heroSub }]}>{potluck.theme || fmt.blurb}</Text>
        </HeroCard>
        <Stack gap={14} style={{ padding: 16 }}>
          <Row justify="space-between" align="flex-start">
            <AuthorLine uid={potluck.hostId} sub="Host" />
            <View style={{ alignItems: "flex-end", maxWidth: "50%" }}>
              <Text style={[type.small, type.bold]}>{formatWhen(potluck.startsAt)}</Text>
              <Text style={[type.small, type.muted]} numberOfLines={1}>
                {potluck.location}
              </Text>
            </View>
          </Row>
          <Row wrap gap={6}>
            <Chip tone="green">{`${potluck.memberIds?.length || 0} attending`}</Chip>
            <Chip tone="peach">{`${potluck.dishCategories?.length || 0} dish categories`}</Chip>
            {potluck.formatDetail ? <Chip tone="plain">{potluck.formatDetail}</Chip> : null}
          </Row>
          <Row wrap gap={8}>
            {potluck.scoring?.map((c: any) => (
              <View
                key={c.id}
                style={{
                  flexGrow: 1,
                  flexBasis: "45%",
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 12,
                  padding: 10,
                }}
              >
                <Row justify="space-between">
                  <Text style={[type.small, type.bold]}>{c.name}</Text>
                  <Text style={[type.small, type.heavy, { color: colors.coral }]}>
                    {Math.round((c.weight / totalWeight) * 100)}%
                  </Text>
                </Row>
                <Text style={[type.small, type.muted]} numberOfLines={1}>
                  {c.description}
                </Text>
              </View>
            ))}
          </Row>
          <Tile
            tone="lilac"
            style={{
              paddingVertical: 10,
              paddingHorizontal: 14,
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Text style={[type.small, { flex: 1 }]}>
              {potluck.votingOpensAt
                ? `Voting opens at ${formatTime(potluck.votingOpensAt)}`
                : "Host opens voting at the event"}
            </Text>
            <Text style={[type.small, type.bold, { color: colors.mint }]}>{PHASE_LABEL[phase].toUpperCase()}</Text>
          </Tile>
        </Stack>
      </Card>
      {isMember ? (
        <Button
          size="lg"
          title="You’re in! Open event"
          onPress={() => router.replace(`/potlucks/${potluck.id}` as any)}
        />
      ) : phase === "closed" ? (
        <Banner tone="secondary">This showdown has already ended.</Banner>
      ) : full ? (
        <Banner tone="warning">This potluck is full.</Banner>
      ) : (
        <>
          <Tile tone="mint" style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
            <Text style={[type.small, { color: colors.mintDark }]}>
              🥗 Join now, then claim the dish you want to bring.
            </Text>
          </Tile>
          <Button size="lg" title={busy ? "Joining…" : "Join Challenge"} loading={busy} onPress={onJoin} />
        </>
      )}
    </Stack>
  );
}

export default function JoinScreen({ codeParam }: { codeParam?: string }) {
  const { user, loading } = useAuth();
  const [code, setCode] = useState(normalizeInviteCode(codeParam ?? ""));
  const [potluck, setPotluck] = useState<any>(null);
  const [status, setStatus] = useState<"idle" | "looking" | "found" | "missing">(
    codeParam ? "looking" : "idle"
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const lookup = useCallback(async (c: string) => {
    try {
      const p = await lookupInvite(c);
      setPotluck(p);
      setStatus(p ? "found" : "missing");
    } catch (err: any) {
      setError(friendlyError(err));
      setStatus("idle");
    }
  }, []);

  useEffect(() => {
    if (user && codeParam) {
      const t = setTimeout(() => lookup(codeParam), 0);
      return () => clearTimeout(t);
    }
  }, [user, codeParam, lookup]);

  const find = () => {
    setStatus("looking");
    setError("");
    lookup(code);
  };

  const join = async () => {
    if (!potluck) return;
    setBusy(true);
    try {
      await joinPotluck(potluck.id);
      router.replace(`/potlucks/${potluck.id}` as any);
    } catch (err: any) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <Screen>
      <PageHeader title="Join Potluck" backTo={user ? "/" : "/welcome"} />
      {!user ? (
        <InviteGate code={normalizeInviteCode(codeParam ?? "")} />
      ) : (
        <Stack gap={12}>
          <View>
            <Text style={[type.h2, { marginBottom: 4 }]}>Join the Potluck Competition</Text>
            <Text style={[type.body, type.muted]}>
              Enter your invite code to preview the food competition before you join.
            </Text>
          </View>
          <View>
            <Label>Invite code</Label>
            <Row gap={8}>
              <Input
                style={[{ flex: 1 }, type.code]}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                placeholder="HARVEST-7K2Q"
                accessibilityLabel="Invite code"
                value={code}
                onChangeText={(t) => {
                  setCode(normalizeInviteCode(t));
                  setStatus("idle");
                }}
                valid={status === "found"}
                invalid={status === "missing"}
                returnKeyType="search"
                onSubmitEditing={() => code.length >= 4 && find()}
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
          {status === "found" && potluck && <Preview potluck={potluck} onJoin={join} busy={busy} />}
        </Stack>
      )}
    </Screen>
  );
}
