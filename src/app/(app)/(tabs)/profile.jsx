import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { authErrorMessage, useAuth } from '../../../hooks/AuthContext';
import { useMyPotlucks } from '../../../hooks/useFirestore';
import { friendlyError, updateMyProfile } from '../../../data/api';
import { FRAMES, FRAME_ORDER, earnedFrames, winCount } from '../../../lib/frames';
import { compressImage, pickImage } from '../../../lib/images';
import { formatDate } from '../../../lib/dates';
import { toMillis } from '../../../lib/scoring';
import { androidAppUrl, isNative } from '../../../lib/platform';
import { usingEmulators } from '../../../firebase';
import Avatar from '../../../components/Avatar';
import {
  Banner, Button, Card, Chip, Dialog, Icon, IconButton, Input, ListRow, OptionSheet, PageHeader, Row, Screen, Stack, Tile, useConfirm, useToast,
} from '../../../components/ui';
import { colors, shadow, type } from '../../../theme';

function UpgradeGuest() {
  const { upgradeGuest } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (password.length < 8) return setError('Use at least 8 characters.');
    setBusy(true);
    setError('');
    try {
      await upgradeGuest(email.trim(), password);
      toast('Account saved! You can now sign in anywhere.');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
    return undefined;
  };
  return (
    <Tile tone="gold" style={{ padding: 16, marginBottom: 16 }}>
      <Text style={[type.body, type.bold]}>You’re using a guest pass</Text>
      <Text style={[type.small, { marginTop: 4, marginBottom: 10 }]}>
        It only lives on this device. Save it as an account to keep your potlucks and recipes, sign in anywhere, and host your own showdowns.
      </Text>
      <Stack gap={8}>
        {error ? <Banner>{error}</Banner> : null}
        <Input placeholder="Email" accessibilityLabel="Email" value={email} onChangeText={setEmail} autoComplete="email"
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <Input placeholder="Password (8+ characters)" accessibilityLabel="Password" value={password} onChangeText={setPassword}
          secureTextEntry autoComplete="new-password" />
        <Button title={busy ? 'Saving…' : 'Save my account'} loading={busy} disabled={!email.trim()} onPress={submit} />
      </Stack>
    </Tile>
  );
}

function DeleteAccountDialog({ visible, onClose }) {
  const { deleteAccount, isGuest } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteAccount(password);
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Dialog visible={visible} onClose={onClose} title="Delete your account?" footer={(
      <>
        <Button variant="light" title="Cancel" onPress={onClose} />
        <Button variant="danger" title={busy ? 'Deleting…' : 'Delete account'} loading={busy} disabled={!isGuest && !password} onPress={submit} />
      </>
    )}>
      <Stack gap={10}>
        <Text style={[type.body, type.muted]}>Your profile and sign-in are permanently deleted. Dishes you shared stay in past potlucks as “Former guest.”</Text>
        {error ? <Banner>{error}</Banner> : null}
        {!isGuest && (
          <Input placeholder="Confirm your password" accessibilityLabel="Password" value={password} onChangeText={setPassword}
            secureTextEntry autoComplete="current-password" />
        )}
      </Stack>
    </Dialog>
  );
}

export default function Profile() {
  const { user, profile, isGuest, signOut } = useAuth();
  const toast = useToast();
  const [confirmEl, confirm] = useConfirm();
  const { data: potlucks } = useMyPotlucks();
  const [name, setName] = useState(null);
  const [busy, setBusy] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);

  const earned = useMemo(() => earnedFrames(user.uid, potlucks), [user.uid, potlucks]);
  // Most recent potluck backing each tier (rules verify the claim).
  const bestByTier = useMemo(() => {
    const map = {};
    for (const f of [...earned].sort((a, b) => toMillis(b.potluck.startsAt) - toMillis(a.potluck.startsAt))) {
      map[f.tier] ??= f;
    }
    return map;
  }, [earned]);
  const trophies = earned.filter((f) => f.tier !== 'host');
  const attended = potlucks.filter((p) => p.status === 'closed').length;

  const run = async (key, fn, success) => {
    setBusy(key);
    try {
      await fn();
      if (success) toast(success);
      return true;
    } catch (err) {
      toast(friendlyError(err), 'danger');
      return false;
    } finally {
      setBusy('');
    }
  };

  const pickPhoto = async (camera) => {
    let asset;
    try {
      asset = await pickImage({ camera, square: true });
    } catch (err) {
      toast(err.message, 'danger');
      return;
    }
    if (!asset) return;
    run('photo', async () => {
      const photoURL = await compressImage(asset, { maxDim: 256, maxChars: 100_000, crop: true });
      await updateMyProfile({ photoURL });
    }, 'Profile photo updated');
  };

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (await run('name', () => updateMyProfile({ displayName: trimmed.slice(0, 40) }), 'Name updated')) setName(null);
  };

  const chooseFrame = (tier) => {
    const frame = tier ? { tier, potluckId: bestByTier[tier].potluckId } : null;
    run(`frame-${tier}`, () => updateMyProfile({ frame }), tier ? `${FRAMES[tier].label} frame equipped` : 'Frame removed');
  };

  const onSignOut = async () => {
    if (!isGuest || await confirm({
      title: 'Sign out of your guest pass?',
      body: 'Guest passes can’t be recovered after signing out. Save an account first to keep your potlucks.',
      confirmLabel: 'Sign out anyway',
      danger: true,
    })) {
      signOut();
    }
  };

  const frameOptions = [{ tier: null }, ...FRAME_ORDER.map((tier) => ({ tier }))];

  return (
    <Screen inTabs>
      {confirmEl}
      <DeleteAccountDialog visible={showDelete} onClose={() => setShowDelete(false)} />
      <OptionSheet visible={photoSheet} onClose={() => setPhotoSheet(false)} title="Profile photo" options={[
        ...(isNative ? [{ label: 'Take a photo', icon: 'camera-outline', onPress: () => pickPhoto(true) }] : []),
        { label: 'Choose from gallery', icon: 'images-outline', onPress: () => pickPhoto(false) },
        ...(profile?.photoURL ? [{ label: 'Remove photo', icon: 'trash-outline', danger: true, onPress: () => run('photo', () => updateMyProfile({ photoURL: null }), 'Photo removed') }] : []),
      ]} />
      <PageHeader title="Profile" back={false} />

      <Card style={{ padding: 24, alignItems: 'center', marginBottom: 16 }}>
        <View style={{ marginBottom: 10 }}>
          <Avatar uid={user.uid} profile={profile} size={112} />
          <Pressable onPress={() => setPhotoSheet(true)} accessibilityRole="button" accessibilityLabel="Change photo" style={s.camera}>
            {busy === 'photo' ? <ActivityIndicator size="small" color={colors.white} /> : <Icon name="camera" size={18} color={colors.white} />}
          </Pressable>
        </View>
        {name === null ? (
          <Row gap={4}>
            <Text style={type.h2}>{profile?.displayName ?? '…'}</Text>
            <IconButton name="pencil" size={16} color={colors.coral} accessibilityLabel="Edit name" onPress={() => setName(profile?.displayName ?? '')} />
          </Row>
        ) : (
          <Row gap={8} style={{ alignSelf: 'stretch', maxWidth: 360 }}>
            <Input style={{ flex: 1 }} autoFocus maxLength={40} value={name} onChangeText={setName} accessibilityLabel="Display name"
              returnKeyType="done" onSubmitEditing={saveName} />
            <Button title="Save" loading={busy === 'name'} onPress={saveName} />
          </Row>
        )}
        <Text style={[type.small, type.muted, { marginTop: 2 }]}>{isGuest ? 'Guest' : user.email}</Text>
        {profile?.frame && (
          <View style={{ marginTop: 8 }}>
            <Chip tone="gold">{`${FRAMES[profile.frame.tier]?.medal} ${FRAMES[profile.frame.tier]?.label}`}</Chip>
          </View>
        )}
        <Row gap={8} style={{ marginTop: 16, alignSelf: 'stretch' }}>
          {[
            ['Showdowns', attended],
            ['Wins', winCount(user.uid, potlucks)],
            ['Podiums', trophies.length],
          ].map(([label, value]) => (
            <Tile key={label} tone="peach" style={{ flex: 1, paddingVertical: 10, alignItems: 'center' }}>
              <Text style={[type.h2, { fontSize: 22 }]}>{value}</Text>
              <Text style={[type.small, type.muted]}>{label}</Text>
            </Tile>
          ))}
        </Row>
      </Card>

      {isGuest && <UpgradeGuest />}

      <Text style={[type.h3, { marginBottom: 4 }]}>Profile frame</Text>
      <Text style={[type.small, type.muted, { marginBottom: 10 }]}>
        Profiles are private, but everyone sees your picture in feeds and guest lists. Win a showdown to unlock a frame and show it off.
      </Text>
      <View style={s.frames}>
        {frameOptions.map(({ tier }) => {
          const unlocked = !tier || Boolean(bestByTier[tier]);
          const active = (profile?.frame?.tier ?? null) === tier;
          return (
            <Pressable
              key={tier ?? 'none'}
              onPress={() => unlocked && !active && chooseFrame(tier)}
              disabled={!unlocked || Boolean(busy)}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: !unlocked }}
              style={[s.frame, active && s.frameActive, !unlocked && { opacity: 0.55 }]}
            >
              <Avatar uid={user.uid} profile={{ ...profile, frame: tier ? { tier } : null }} size={56} />
              <Text style={[type.small, type.bold, { marginTop: 8, textAlign: 'center' }]}>
                {tier ? FRAMES[tier].label : 'No frame'}{!unlocked ? ' 🔒' : ''}
              </Text>
              {tier && (
                <Text style={[type.small, type.muted, { textAlign: 'center' }]}>
                  {unlocked ? (active ? 'Equipped' : 'Tap to equip') : FRAMES[tier].desc}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {trophies.length > 0 && (
        <>
          <Text style={[type.h3, { marginBottom: 8 }]}>Trophy case</Text>
          <Card style={{ marginBottom: 24, overflow: 'hidden' }}>
            {trophies.map((t, i) => (
              <ListRow
                key={`${t.potluckId}-${t.tier}`}
                last={i === trophies.length - 1}
                label={`${FRAMES[t.tier].medal}  ${t.potluck.title}`}
                sub={`${FRAMES[t.tier].label} · ${formatDate(t.potluck.startsAt)}`}
                onPress={() => router.push(`/potlucks/${t.potluckId}/results`)}
              />
            ))}
          </Card>
        </>
      )}

      <Text style={[type.h3, { marginBottom: 8 }]}>Account</Text>
      <Card style={{ marginBottom: 12, overflow: 'hidden' }}>
        {!isNative && androidAppUrl() && (
          <ListRow icon="logo-android" iconColor={colors.mint} label="Get the Android app" onPress={() => Linking.openURL(androidAppUrl())} />
        )}
        <ListRow icon="log-out-outline" label="Sign out" onPress={onSignOut} right={null} />
        <ListRow icon="person-remove-outline" label="Delete account" danger onPress={() => setShowDelete(true)} right={null} last />
      </Card>
      <Text style={[type.small, type.muted, { textAlign: 'center' }]}>
        Passwords are stored and verified by Firebase Authentication. Potluck Showdown never sees them.
        {usingEmulators ? '\nConnected to local Firebase emulators.' : ''}
      </Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  camera: {
    position: 'absolute', top: 0, right: 0, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.coral,
    alignItems: 'center', justifyContent: 'center', ...shadow,
  },
  frames: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  frame: {
    flexGrow: 1, flexBasis: '30%', minWidth: 100, alignItems: 'center', padding: 14, backgroundColor: colors.white,
    borderRadius: 20, borderWidth: 1, borderColor: colors.line,
  },
  frameActive: { borderColor: colors.coral, borderWidth: 2 },
});
