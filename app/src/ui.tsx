import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const colors = {
  primary: '#1F5FAD',
  danger: '#B3261E',
  ok: '#1E7D32',
  warn: '#8A5A00',
  text: '#1B1B1F',
  muted: '#5F6368',
  border: '#C9CED6',
  background: '#F6F7F9',
  white: '#FFFFFF',
};

// Android draws the app behind the status and navigation bars, so the screen is padded by their size.
export function Screen({ banner, children }: { banner: string | null; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {banner ? <Text style={styles.banner}>{banner}</Text> : null}
      <View style={styles.content}>{children}</View>
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
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  body: { fontSize: 16, color: colors.text },
  hint: { fontSize: 14, color: colors.muted },
  error: { fontSize: 15, color: colors.danger },
  warn: { fontSize: 15, color: colors.warn },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    color: colors.text,
  },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  banner: { backgroundColor: colors.warn, color: colors.white, padding: 8, textAlign: 'center', fontSize: 14 },
  content: { flex: 1, padding: 20 },
  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  secondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.primary },
  off: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  buttonText: { color: colors.white, fontSize: 17, fontWeight: '600' },
  secondaryText: { color: colors.primary },
});
