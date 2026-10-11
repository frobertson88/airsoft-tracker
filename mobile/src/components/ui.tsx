import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colours, display, radius, space, fonts } from '../theme';

export function Screen({
  children,
  scroll = true,
  edges = ['bottom'],
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

/** Big uppercase heading for names, teams and modes. */
export function Display({ children, size = 28, colour }: { children: ReactNode; size?: number; colour?: string }) {
  return <Text style={[styles.display, { fontFamily: fonts.regular, fontSize: size }, colour ? { color: colour } : null]}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && { color: colours.textSecondary }]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  disabled,
  busy,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'quiet' | 'secondary' | 'danger';
}) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        variant === 'quiet' && styles.buttonQuiet,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        (pressed || off) && { opacity: 0.6 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? colours.onAccent : colours.actionText} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === 'primary' && { color: colours.onAccent },
            variant === 'danger' && { color: colours.danger },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

/** Two-step button for destructive actions (works the same on web and phones). */
export function ConfirmButton({
  title,
  confirmTitle,
  onConfirm,
  busy,
}: {
  title: string;
  confirmTitle: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <Button
      title={armed ? confirmTitle : title}
      variant="danger"
      busy={busy}
      onPress={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    />
  );
}

export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colours.textSecondary}
      {...props}
      style={[styles.field, props.style]}
    />
  );
}

export function Chip({
  label,
  selected,
  onPress,
  colour,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  colour?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, colour ? { color: colour } : null, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Loading() {
  return (
    <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={colours.accent} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.background },
  content: { padding: space.lg, gap: space.md },
  title: { color: colours.text, fontSize: 28, ...display },
  display: { color: colours.text, ...display },
  label: {
    color: colours.textSecondary,
    fontFamily: fonts.semibold, fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: space.sm,
  },
  body: { color: colours.text, fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  error: { color: colours.danger, fontFamily: fonts.regular, fontSize: 15 },
  card: {
    backgroundColor: colours.surface,
    borderColor: colours.border,
    borderWidth: 1,
    borderRadius: radius,
    padding: space.md,
    gap: space.sm,
  },
  button: {
    backgroundColor: colours.accent,
    borderRadius: radius,
    minHeight: 52,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonQuiet: { backgroundColor: colours.actionFill },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colours.border,
  },
  buttonDanger: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colours.danger,
  },
  buttonText: { color: colours.actionText, fontFamily: fonts.semibold, fontSize: 16 },
  field: {
    backgroundColor: colours.surface,
    borderColor: colours.border,
    borderWidth: 1,
    borderRadius: radius,
    color: colours.text,
    fontFamily: fonts.regular, fontSize: 17,
    minHeight: 48,
    paddingHorizontal: space.md,
  },
  chip: {
    borderColor: colours.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: space.md,
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colours.surface,
  },
  chipSelected: { backgroundColor: colours.actionFill, borderColor: colours.accent },
  chipTextSelected: { color: colours.actionText, fontFamily: fonts.semibold },
  chipText: { color: colours.text, fontFamily: fonts.regular, fontSize: 15 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
});
