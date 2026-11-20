import { useState, type ComponentPropsWithRef, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Every colour is set here, never left to the phone's theme, so the app reads the same in dark mode.
export const colors = {
  primary: '#1F5FAD',
  primarySoft: '#E8F0FB',
  danger: '#B3261E',
  dangerSoft: '#FDECEA',
  ok: '#1E7D32',
  okSoft: '#E6F4E7',
  warn: '#8A5A00',
  warnSoft: '#FFF3DC',
  text: '#1B1B1F',
  muted: '#5F6368',
  border: '#C9CED6',
  divider: '#E3E6EB',
  background: '#F2F4F7',
  white: '#FFFFFF',
};

export type Tone = 'ok' | 'warn' | 'danger' | 'info';

const tones: Record<Tone, { color: string; backgroundColor: string }> = {
  ok: { color: colors.ok, backgroundColor: colors.okSoft },
  warn: { color: colors.warn, backgroundColor: colors.warnSoft },
  danger: { color: colors.danger, backgroundColor: colors.dangerSoft },
  info: { color: colors.primary, backgroundColor: colors.primarySoft },
};

type ScreenProps = { status: { label: string; tone: Tone }; banner: string | null; children: ReactNode };

// Every screen: a header with the sync status, an optional banner, then the content. Android draws
// the app behind the status and navigation bars, so the screen is padded by their size.
export function Screen({ status, banner, children }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.headerTitle}>Truck Entry</Text>
        <Pill label={status.label} tone={status.tone} />
      </View>
      {banner ? <Text style={styles.banner}>{banner}</Text> : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

type FieldProps = { label: string; error?: string | null; hint?: string | null; children: ReactNode };

// A label, the input, and one line under it: the error if there is one, otherwise the hint.
export function Field({ label, error, hint, children }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={text.label}>{label}</Text>
      {children}
      {error ? <Text style={text.error}>{error}</Text> : hint ? <Text style={text.hint}>{hint}</Text> : null}
    </View>
  );
}

// A text box with our colours: in dark mode Android's default placeholder is almost white.
export function Input({ style, editable = true, ...props }: ComponentPropsWithRef<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      selectionColor={colors.primary}
      cursorColor={colors.primary}
      editable={editable}
      {...props}
      style={[styles.input, !editable && styles.inputDisabled, style]}
    />
  );
}

type Option = { value: string; label: string };
type DropdownProps = { placeholder: string; options: Option[]; value: string; onChange: (value: string) => void };

// Tap to open the list under the field, tap a choice to close it. Built from plain views instead of
// Android's native picker, which follows the phone's dark mode (white text on our white box).
export function Dropdown({ placeholder, options, value, onChange }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={[styles.select, open && styles.selectOpen]}
      >
        <Text style={[styles.selectText, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open && (
        <View style={styles.options}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.option,
                  index > 0 && styles.optionDivider,
                  isSelected && styles.optionSelected,
                  pressed && styles.optionPressed,
                ]}
              >
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option.label}</Text>
                {isSelected && <Text style={styles.check}>✓</Text>}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function Pill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <View style={[styles.pill, { backgroundColor: tones[tone].backgroundColor }]}>
      <Text style={[styles.pillText, { color: tones[tone].color }]}>{label}</Text>
    </View>
  );
}

// A coloured message box (location status, sync status).
export function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <View style={[styles.notice, { backgroundColor: tones[tone].backgroundColor }]}>
      <Text style={[styles.noticeText, { color: tones[tone].color }]}>{children}</Text>
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
};

export function Button({ title, onPress, disabled = false, busy = false, secondary = false }: ButtonProps) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [styles.button, secondary && styles.secondary, off && styles.off, pressed && styles.pressed]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? colors.primary : colors.white} />
      ) : (
        <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>
      )}
    </Pressable>
  );
}

export const text = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: 4 },
  section: { fontSize: 17, fontWeight: '700', color: colors.text },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  body: { fontSize: 16, color: colors.text },
  hint: { fontSize: 14, color: colors.muted },
  error: { fontSize: 14, color: colors.danger },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: '700' },
  banner: { backgroundColor: colors.warn, color: colors.white, paddingVertical: 8, paddingHorizontal: 12, textAlign: 'center', fontSize: 14 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  card: { backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.divider, padding: 16, gap: 14 },
  field: { gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
    fontSize: 18,
    color: colors.text,
  },
  inputDisabled: { backgroundColor: colors.background, color: colors.muted },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  selectOpen: { borderColor: colors.primary, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  selectText: { flex: 1, fontSize: 18, color: colors.text },
  placeholder: { color: colors.muted },
  chevron: { fontSize: 13, color: colors.muted, marginLeft: 8 },
  options: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.primary,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, minHeight: 48 },
  optionDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  optionSelected: { backgroundColor: colors.primarySoft },
  optionPressed: { backgroundColor: colors.divider },
  optionText: { fontSize: 18, color: colors.text },
  optionTextSelected: { color: colors.primary, fontWeight: '600' },
  check: { fontSize: 18, fontWeight: '700', color: colors.primary },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 13, fontWeight: '600' },
  notice: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  noticeText: { fontSize: 15 },
  button: { backgroundColor: colors.primary, borderRadius: 8, minHeight: 50, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  secondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.primary },
  off: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  buttonText: { color: colors.white, fontSize: 17, fontWeight: '600' },
  secondaryText: { color: colors.primary },
});
