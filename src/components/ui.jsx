import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text,
  TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { loadImage } from '../data/api';
import { tapFeedback } from '../lib/platform';
import { colors, radius, shadow, type } from '../theme';

export function Icon({ name, size = 20, color = colors.ink, style }) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}

/** Goes back when there is somewhere to go, otherwise to `fallback`. */
export function goBack(fallback = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

// ---------- layout ----------

/**
 * Standard screen: safe-area padding, a centered column (so web/tablets stay
 * readable), scrolling content, and an optional pinned footer for the main action.
 */
export function Screen({ children, footer, scroll = true, inTabs = false, wide = false, contentStyle, refreshControl }) {
  const insets = useSafeAreaInsets();
  const bottom = inTabs ? 0 : insets.bottom;
  const content = <View style={[styles.page, wide && styles.pageWide, contentStyle]}>{children}</View>;
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            style={styles.flex}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: (footer ? 16 : 32) + (footer ? 0 : bottom) }}
            refreshControl={refreshControl}
          >
            {content}
          </ScrollView>
        ) : <View style={styles.flex}>{content}</View>}
        {footer && (
          <View style={[styles.footer, { paddingBottom: 12 + bottom }]}>
            <View style={[styles.footerInner, wide && styles.pageWide]}>{footer}</View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

export function Row({ children, gap = 8, align = 'center', justify, wrap, style, ...rest }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: align, gap, justifyContent: justify, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]} {...rest}>
      {children}
    </View>
  );
}

export function Stack({ children, gap = 12, style }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function PageHeader({ title, back = true, backTo, actions }) {
  return (
    <View style={styles.header}>
      {back && (
        <Pressable onPress={() => goBack(backTo)} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <Icon name="arrow-back" size={20} />
        </Pressable>
      )}
      <Text style={[type.h3, styles.flex, { fontSize: 22, fontWeight: '700' }]} numberOfLines={1}>{title}</Text>
      {actions}
    </View>
  );
}

export function SectionTitle({ children, right, style }) {
  return (
    <Row justify="space-between" style={[{ marginBottom: 8 }, style]}>
      <Text style={[type.h3, styles.flex]}>{children}</Text>
      {right}
    </Row>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.coral} />
      <Text style={type.muted}>{label}</Text>
    </View>
  );
}

/** Full-screen loading state, used while a screen's first data arrives. */
export function LoadingScreen() {
  return <Screen scroll={false}><Loading /></Screen>;
}

export function EmptyState({ emoji = '🍽️', title, children, action }) {
  return (
    <Card style={styles.empty}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text style={[type.h4, { fontSize: 18, textAlign: 'center' }]}>{title}</Text>
      {children ? <Text style={[type.body, type.muted, { textAlign: 'center', marginTop: 6 }]}>{children}</Text> : null}
      {action ? <View style={{ marginTop: 16, alignSelf: 'stretch' }}>{action}</View> : null}
    </Card>
  );
}

// ---------- surfaces ----------

export function Card({ children, style, onPress, accessibilityLabel }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

const TILES = {
  peach: { backgroundColor: colors.peachSoft, borderColor: colors.peachLine, borderWidth: 1 },
  lilac: { backgroundColor: colors.lilacSoft },
  mint: { backgroundColor: colors.mintSoft },
  gold: { backgroundColor: colors.goldSoft },
};

export function Tile({ tone = 'peach', children, style, onPress }) {
  const s = [styles.tile, TILES[tone], style];
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [...s, pressed && styles.pressed]}>{children}</Pressable>;
  return <View style={s}>{children}</View>;
}

/** Coral gradient banner used at the top of events and invites. */
export function HeroCard({ children, style }) {
  return (
    <LinearGradient colors={[colors.coral, colors.coral2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, style]}>
      {children}
    </LinearGradient>
  );
}

const CHIPS = {
  default: { bg: 'rgba(255,255,255,0.22)', fg: colors.white },
  green: { bg: colors.mintSoft, fg: colors.mintDark },
  gold: { bg: colors.gold, fg: colors.ink },
  peach: { bg: colors.peachSoft, fg: colors.coralDark },
  purple: { bg: colors.lilacSoft, fg: colors.lilac },
  plain: { bg: colors.white, fg: colors.muted, border: colors.line },
};

export function Chip({ tone = 'peach', icon, children, onPress }) {
  const c = CHIPS[tone] ?? CHIPS.peach;
  const body = (
    <View style={[styles.chip, { backgroundColor: c.bg }, c.border && { borderWidth: 1, borderColor: c.border }]}>
      {icon && <Icon name={icon} size={12} color={c.fg} />}
      <Text style={[styles.chipText, { color: c.fg }]} numberOfLines={1}>{children}</Text>
    </View>
  );
  return onPress ? <Pressable onPress={onPress} hitSlop={6}>{body}</Pressable> : body;
}

const BANNERS = {
  danger: { bg: colors.dangerSoft, fg: '#9b1c2c', icon: 'alert-circle' },
  warning: { bg: colors.goldSoft, fg: '#6b4a00', icon: 'warning' },
  success: { bg: colors.mintSoft, fg: colors.mintDark, icon: 'checkmark-circle' },
  secondary: { bg: '#efe9e5', fg: colors.muted, icon: 'information-circle' },
};

export function Banner({ tone = 'danger', children, style }) {
  const b = BANNERS[tone];
  return (
    <View style={[styles.banner, { backgroundColor: b.bg }, style]} accessibilityRole="alert">
      <Icon name={b.icon} size={18} color={b.fg} />
      <Text style={[type.small, { color: b.fg, flex: 1 }]}>{children}</Text>
    </View>
  );
}

// ---------- buttons ----------

const VARIANTS = {
  primary: { bg: colors.coral, fg: colors.white },
  outline: { bg: 'transparent', fg: colors.coral, border: colors.coral },
  outlineWhite: { bg: colors.white, fg: colors.coral, border: colors.coral },
  outlineDark: { bg: 'transparent', fg: colors.ink, border: colors.ink },
  light: { bg: '#f6eee9', fg: colors.ink },
  white: { bg: colors.white, fg: colors.ink },
  soft: { bg: colors.peachSoft, fg: colors.coralDark },
  warning: { bg: colors.gold, fg: colors.ink },
  danger: { bg: colors.danger, fg: colors.white },
  dark: { bg: colors.ink, fg: colors.white },
  link: { bg: 'transparent', fg: colors.coral },
  linkDanger: { bg: 'transparent', fg: colors.danger },
  linkMuted: { bg: 'transparent', fg: colors.muted },
};

const SIZES = {
  sm: { py: 7, px: 12, font: 13.5, icon: 15, radius: 10 },
  md: { py: 11, px: 18, font: 15, icon: 17, radius: 14 },
  lg: { py: 15, px: 20, font: 17, icon: 19, radius: 18 },
};

export function Button({
  title, icon, iconRight, onPress, variant = 'primary', size = 'md', disabled, loading, style, block, accessibilityLabel,
}) {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const isLink = variant.startsWith('link');
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      hitSlop={isLink ? 6 : 0}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: v.bg,
          paddingVertical: isLink ? 4 : s.py,
          paddingHorizontal: isLink ? 0 : s.px,
          borderRadius: s.radius,
          minHeight: isLink ? 0 : size === 'sm' ? 34 : 44,
        },
        v.border && { borderWidth: 1.5, borderColor: v.border },
        block && { alignSelf: 'stretch' },
        (disabled || loading) && { opacity: 0.55 },
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={v.fg} /> : icon && <Icon name={icon} size={s.icon} color={v.fg} />}
      {title ? <Text style={{ color: v.fg, fontSize: s.font, fontWeight: '700' }} numberOfLines={1}>{title}</Text> : null}
      {iconRight && <Icon name={iconRight} size={s.icon} color={v.fg} />}
    </Pressable>
  );
}

export function IconButton({ name, onPress, color = colors.ink, size = 22, accessibilityLabel, disabled, style }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: 'rgba(0,0,0,0.06)' }, style]}>
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

/** Tappable row used in menus and lists (icon · label · chevron). */
export function ListRow({ icon, iconColor, label, sub, onPress, danger, right, last }) {
  const fg = danger ? colors.danger : colors.ink;
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [styles.listRow, !last && styles.listRowBorder, pressed && { backgroundColor: '#faf3ef' }]}>
      {icon && <Icon name={icon} size={20} color={iconColor ?? fg} />}
      <View style={styles.flex}>
        <Text style={[type.body, { color: fg }]} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={[type.small, type.muted]} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right ?? (onPress && <Icon name="chevron-forward" size={18} color={colors.muted} />)}
    </Pressable>
  );
}

// ---------- form controls ----------

export function Label({ children, style }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

export function Hint({ children }) {
  return <Text style={[type.small, type.muted, { marginTop: 4 }]}>{children}</Text>;
}

export const Input = ({ style, rows, multiline, invalid, valid, ...props }) => (
  <TextInput
    placeholderTextColor="#b0a49c"
    multiline={multiline || Boolean(rows)}
    textAlignVertical={rows ? 'top' : 'center'}
    style={[
      styles.input,
      rows && { minHeight: rows * 22 + 24 },
      invalid && { borderColor: colors.danger },
      valid && { borderColor: colors.mint },
      props.editable === false && { backgroundColor: '#f6f0ec', color: colors.muted },
      style,
    ]}
    {...props}
  />
);

export function Field({ label, hint, style, children, ...inputProps }) {
  return (
    <View style={style}>
      {label ? <Label>{label}</Label> : null}
      {children ?? <Input accessibilityLabel={label} {...inputProps} />}
      {hint ? <Hint>{hint}</Hint> : null}
    </View>
  );
}

export function Checkbox({ checked, onChange, children, style }) {
  return (
    <Pressable onPress={() => { tapFeedback(); onChange(!checked); }} accessibilityRole="checkbox" accessibilityState={{ checked }}
      style={[{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, style]}>
      <View style={[styles.checkbox, checked && { backgroundColor: colors.coral, borderColor: colors.coral }]}>
        {checked && <Icon name="checkmark" size={16} color={colors.white} />}
      </View>
      <View style={styles.flex}>{children}</View>
    </Pressable>
  );
}

/** A dropdown: shows the chosen label, opens a bottom sheet of options. */
export function SelectField({ label, value, options, onChange, placeholder = 'Choose…', size, style }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={style}>
      {label ? <Label>{label}</Label> : null}
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label ?? placeholder}
        style={[styles.input, styles.select, size === 'sm' && { paddingVertical: 8 }]}>
        <Text style={[type.body, styles.flex, !current && { color: '#b0a49c' }, size === 'sm' && { fontSize: 14 }]} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Icon name="chevron-down" size={16} color={colors.muted} />
      </Pressable>
      <OptionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        options={options.map((o) => ({ ...o, selected: o.value === value, onPress: () => onChange(o.value) }))}
      />
    </View>
  );
}

/** Bottom sheet with a list of actions (Android-style menus and pickers). */
export function OptionSheet({ visible, onClose, title, options }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetWrap}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: 12 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            {title ? <Text style={[type.h4, { flex: 1 }]}>{title}</Text> : <View style={{ flex: 1 }} />}
            <IconButton name="close" onPress={onClose} accessibilityLabel="Close menu" />
          </View>
          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="always">
            {options.map((o, i) => (
            <Pressable
              key={o.key ?? o.value ?? o.label ?? i}
              disabled={o.disabled}
              onPress={() => {
                onClose();
                // iOS can't present a dialog or picker while this sheet is still closing.
                if (o.onPress) setTimeout(o.onPress, Platform.OS === 'web' ? 0 : 350);
              }}
              style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: '#faf3ef' }, o.disabled && { opacity: 0.45 }]}
            >
              {o.icon && <Icon name={o.icon} size={20} color={o.danger ? colors.danger : colors.ink} />}
              <View style={styles.flex}>
                <Text style={[type.body, o.danger && { color: colors.danger }, o.selected && { color: colors.coral, fontWeight: '700' }]}>{o.label}</Text>
                {o.sub ? <Text style={[type.small, type.muted]}>{o.sub}</Text> : null}
              </View>
              {o.selected && <Icon name="checkmark" size={20} color={colors.coral} />}
            </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Centered dialog. Hardware back closes it, like any Android dialog. */
export function Dialog({ visible, onClose, title, children, footer }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.dialogWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.dialog}>
          <Row justify="space-between" align="flex-start" style={{ marginBottom: 8 }}>
            <Text style={[type.h3, styles.flex]}>{title}</Text>
            <IconButton name="close" onPress={onClose} accessibilityLabel="Close" color={colors.muted} />
          </Row>
          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer && <Row justify="flex-end" gap={8} style={{ marginTop: 16 }}>{footer}</Row>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Promise-based confirm dialog.
 * const [confirmEl, confirm] = useConfirm(); if (await confirm({ title, body })) ...
 */
export function useConfirm() {
  const [state, setState] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const close = (result) => {
    state?.resolve(result);
    setState(null);
  };
  const element = (
    <Dialog
      visible={Boolean(state)}
      onClose={() => close(false)}
      title={state?.title}
      footer={(
        <>
          <Button title="Cancel" variant="light" onPress={() => close(false)} />
          <Button title={state?.confirmLabel ?? 'Confirm'} variant={state?.danger ? 'danger' : 'primary'} onPress={() => close(true)} />
        </>
      )}
    >
      {state?.body ? <Text style={[type.body, type.muted]}>{state.body}</Text> : null}
    </Dialog>
  );
  return [element, confirm];
}

// ---------- images ----------

/** Renders an `img:` Firestore image reference or a URL, with a themed fallback. */
export function FsImage({ src, style, fallback = '🍲', contentFit = 'cover', accessibilityLabel }) {
  const [state, setState] = useState({ uri: null, for: null });
  useEffect(() => {
    let alive = true;
    if (src) {
      loadImage(src).then((uri) => alive && setState({ uri, for: src })).catch(() => alive && setState({ uri: null, for: src }));
    }
    return () => { alive = false; };
  }, [src]);
  const uri = state.for === src ? state.uri : null;
  if (!uri) {
    return (
      <View style={[styles.fallback, style]} accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
        <Text style={{ fontSize: 38 }}>{fallback}</Text>
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.fill, style]} resizeMode={contentFit} accessibilityLabel={accessibilityLabel} />;
}

// ---------- chips, stars, progress ----------

export function ChipToggleGroup({ options, value, onChange, warn = false, scroll = false }) {
  const toggle = (opt) => {
    tapFeedback();
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  };
  const chips = options.map((opt) => {
    const on = value.includes(opt);
    return (
      <Pressable
        key={opt}
        onPress={() => toggle(opt)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        style={[styles.toggle, on && { backgroundColor: warn ? colors.coral : colors.mint, borderColor: warn ? colors.coral : colors.mint }]}
      >
        {on && <Icon name="checkmark" size={14} color={colors.white} />}
        <Text style={[styles.toggleText, on && { color: colors.white }]}>{opt}</Text>
      </Pressable>
    );
  });
  if (scroll) {
    return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{chips}</ScrollView>;
  }
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{chips}</View>;
}

export function StarRating({ value, onChange, label }) {
  return (
    <View style={styles.starRow} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {[1, 2, 3, 4, 5].map((n) => {
        const lit = n <= value;
        return (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === n }}
            accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
            onPress={() => { tapFeedback(); onChange(n); }}
            style={({ pressed }) => [
              styles.star,
              lit && { backgroundColor: colors.gold },
              n === value && { borderColor: colors.coral },
              pressed && { transform: [{ scale: 0.94 }] },
            ]}
          >
            <Icon name="star" size={26} color={lit ? '#c0392b' : '#b4a79f'} />
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stars({ value, small }) {
  if (value == null) return <Text style={[type.small, type.muted]}>No votes</Text>;
  return (
    <Row gap={4} accessibilityLabel={`${value.toFixed(1)} out of 5`}>
      <Icon name="star" size={small ? 14 : 16} color={colors.gold} />
      <Text style={[small ? type.small : type.body, type.heavy]}>{value.toFixed(1)}<Text style={type.muted}>/5</Text></Text>
    </Row>
  );
}

export function ProgressBar({ value, color = colors.gold }) {
  return (
    <View style={styles.progress}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}

// ---------- toasts ----------
const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const show = useCallback((message, variant = 'dark') => {
    const id = ++nextId.current;
    setToasts((t) => [...t, { id, message, variant }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 2800);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <View pointerEvents="none" style={[styles.toastWrap, { top: insets.top + 8 }]}>
        {toasts.map((t) => <Toast key={t.id} {...t} />)}
      </View>
    </ToastContext.Provider>
  );
}

function Toast({ message, variant }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }),
      Animated.delay(2300),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [opacity]);
  return (
    <Animated.View style={[styles.toast, variant === 'danger' && { backgroundColor: colors.danger }, { opacity }]} accessibilityLiveRegion="polite">
      <Text style={{ color: colors.white, fontWeight: '600' }}>{message}</Text>
    </Animated.View>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  screen: { flex: 1, backgroundColor: colors.cream },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 12 },
  pageWide: { maxWidth: 1140 },
  footer: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: 'rgba(255,247,242,0.96)', borderTopWidth: 1, borderTopColor: colors.line },
  footerInner: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, minHeight: 44 },
  backBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  loading: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 44, marginBottom: 8 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, ...shadow },
  tile: { borderRadius: radius.lg },
  hero: { borderRadius: radius.xl, padding: 20, overflow: 'hidden' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill, alignSelf: 'flex-start' },
  chipText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  banner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: radius.md },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  iconBtn: { padding: 6, borderRadius: 20 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, minHeight: 52 },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  label: { fontSize: 15, fontWeight: '600', color: colors.ink, marginBottom: 6 },
  input: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.inputLine, borderRadius: radius.md,
    paddingVertical: 11, paddingHorizontal: 14, fontSize: 16, color: colors.ink,
  },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#d9c8bd', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(34,27,23,0.45)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2d6ce', marginBottom: 10 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 20, minHeight: 52 },
  dialogWrap: { flex: 1, backgroundColor: 'rgba(34,27,23,0.45)', justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 20, width: '100%', maxWidth: 480, maxHeight: '90%', alignSelf: 'center' },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.peachSoft, width: '100%', height: '100%' },
  fill: { width: '100%', height: '100%' },
  toggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: '#e2d3c9', backgroundColor: colors.white,
    borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14, minHeight: 38,
  },
  toggleText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  starRow: { flexDirection: 'row', gap: 10 },
  star: { flex: 1, aspectRatio: 1, maxHeight: 64, borderRadius: 14, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#f4ece6', alignItems: 'center', justifyContent: 'center' },
  progress: { height: 8, borderRadius: 4, backgroundColor: '#f2e9e3', overflow: 'hidden' },
  toastWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 8, zIndex: 2000 },
  toast: { backgroundColor: colors.ink, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 14, maxWidth: 480, ...shadow },
});
