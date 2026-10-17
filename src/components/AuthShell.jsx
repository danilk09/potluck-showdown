import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { emulatorHost, emulatorsReachable, usingEmulators } from '../firebase';
import { Banner, Screen } from './ui';
import { type } from '../theme';

/** Explains the most common testing mistake: the local Firebase emulators aren't running. */
function EmulatorNotice() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    if (!usingEmulators) return undefined;
    let alive = true;
    const check = () => emulatorsReachable().then((ok) => alive && setDown(!ok));
    check();
    const t = setInterval(check, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!down) return null;
  return (
    <Banner tone="warning" style={{ marginBottom: 12 }}>
      <Text style={type.bold}>Can’t reach the local Firebase emulators</Text> at {emulatorHost}. On your computer, run{' '}
      <Text style={type.code}>npm run emulators</Text> in the project folder, and make sure your phone is on the same Wi-Fi.
    </Banner>
  );
}

/** Layout for the signed-out screens (welcome, sign in, sign up, reset). */
export default function AuthShell({ children, footer }) {
  return (
    <Screen footer={footer} contentStyle={{ maxWidth: 460, paddingTop: 16 }}>
      <EmulatorNotice />
      {children}
    </Screen>
  );
}
