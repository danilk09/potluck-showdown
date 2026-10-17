import { Platform, StyleSheet } from 'react-native';

// Colors taken from the Figma drafts.
export const colors = {
  coral: '#f2553a',
  coralDark: '#d93d22',
  coral2: '#f0703f',
  cream: '#fff7f2',
  ink: '#221b17',
  muted: '#7a6f69',
  line: '#f0e2d9',
  inputLine: '#ead9ce',
  mint: '#2f8f5b',
  mintDark: '#287a4e',
  mintSoft: '#e2f5ea',
  gold: '#ffc64b',
  goldSoft: '#fff1cc',
  goldLine: '#f5d27a',
  lilac: '#6b4fd3',
  lilacSoft: '#eee8fd',
  peachSoft: '#ffe6dc',
  peachLine: '#f9cdbc',
  danger: '#dc3545',
  dangerSoft: '#fde8ea',
  white: '#fff',
  heroSub: '#ffe08a',
};

export const radius = { sm: 8, md: 12, lg: 20, xl: 24, pill: 999 };

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, monospace' });

export const shadow = Platform.select({
  web: { boxShadow: '0 6px 24px rgba(120, 60, 30, 0.06)' },
  default: { shadowColor: '#783c1e', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
});

export const type = StyleSheet.create({
  h1: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  h2: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  h3: { fontSize: 19, fontWeight: '800', color: colors.ink },
  h4: { fontSize: 16, fontWeight: '700', color: colors.ink },
  body: { fontSize: 16, color: colors.ink, lineHeight: 22 },
  small: { fontSize: 13.5, color: colors.ink, lineHeight: 19 },
  muted: { color: colors.muted },
  bold: { fontWeight: '700' },
  heavy: { fontWeight: '800' },
  caps: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  link: { color: colors.coral, fontWeight: '600' },
  code: { fontFamily: mono, fontWeight: '800', letterSpacing: 1.2 },
});
