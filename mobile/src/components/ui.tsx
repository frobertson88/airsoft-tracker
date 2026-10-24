import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, useContext, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colours, display, radius, space, fonts } from '../theme';

// Lets a Field scroll itself to the top of the surrounding scroll view when
// focused, so the keyboard never hides what you're typing.
const ScrollContext = createContext<RefObject<ScrollView | null> | null>(null);

export function FocusScrollView(props: ScrollViewProps) {
  const ref = useRef<ScrollView>(null);
  return (
    <ScrollContext.Provider value={ref}>
      <ScrollView ref={ref} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets {...props} />
    </ScrollContext.Provider>
  );
}

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
        <FocusScrollView contentContainerStyle={styles.content}>{children}</FocusScrollView>
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
  return (
    <Text style={[styles.display, { fontFamily: fonts.regular, fontSize: size }, colour ? { color: colour } : null]}>
      {children}
    </Text>
  );
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
  const scroll = useContext(ScrollContext);
  const input = useRef<TextInput>(null);
  return (
    <TextInput
      ref={input}
      placeholderTextColor={colours.textSecondary}
      {...props}
      onFocus={(e) => {
        props.onFocus?.(e);
        const view = scroll?.current;
        if (!view || Platform.OS === 'web') return;
        // Wait for the keyboard to open, then bring this field to the top.
        setTimeout(() => {
          const inner = view.getInnerViewNode();
          if (!inner || !input.current) return;
          input.current.measureLayout(
            inner,
            (_x, y) => view.scrollTo({ y: Math.max(0, y - space.md), animated: true }),
            () => {},
          );
        }, 300);
      }}
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

/**
 * A bordered group of rows (docs/design-direction.md, "List rows"): the house
 * style for lists and settings. Rows are split by thin lines.
 */
export function List({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.list, style]}>
      <View style={styles.listInner}>{children}</View>
    </View>
  );
}

/**
 * One row of a List: title and detail on the left, the value on the right
 * (big for a number that matters, like a chance). With children it opens on
 * tap to show them (keep one row open at a time); with only onPress it goes
 * somewhere (chevron right). right replaces the value, e.g. with a Switch.
 */
export function ListRow({
  title,
  detail,
  value,
  big,
  valueColour,
  left,
  right,
  open,
  onPress,
  children,
}: {
  title: string;
  detail?: string;
  value?: string;
  big?: boolean;
  valueColour?: string;
  left?: ReactNode;
  right?: ReactNode;
  open?: boolean;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const opens = children !== undefined && children !== null && children !== false;
  const content = (
    <>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {!!detail && <Text style={styles.rowDetail}>{detail}</Text>}
      </View>
      {right ??
        (!!value && (
          <Text style={[big ? styles.rowBig : styles.rowValue, valueColour ? { color: valueColour } : null]}>
            {value}
          </Text>
        ))}
      {onPress && (
        <Ionicons
          name={opens ? (open ? 'chevron-up' : 'chevron-down') : 'chevron-forward'}
          size={18}
          color={colours.textSecondary}
        />
      )}
    </>
  );
  return (
    <View style={styles.listItem}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={opens ? { expanded: !!open } : undefined}
          onPress={onPress}
          style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.6 }]}
        >
          {content}
        </Pressable>
      ) : (
        <View style={styles.listRow}>{content}</View>
      )}
      {open && opens && <View style={styles.rowBody}>{children}</View>}
    </View>
  );
}

/** The last row of a List that adds an item, in the accent colour. */
export function ListAdd({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <View style={styles.listItem}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.listRow, { minHeight: 52 }, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.listAdd}>+ {title}</Text>
      </Pressable>
    </View>
  );
}

/** One open row at a time: open(key) toggles it; isOpen(key) says if it's open. */
export function useOpenRow<K extends string | number>() {
  const [openKey, setOpenKey] = useState<K | null>(null);
  return {
    isOpen: (key: K) => openKey === key,
    toggle: (key: K) => setOpenKey((k) => (k === key ? null : key)),
    setOpen: setOpenKey,
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.background },
  list: {
    backgroundColor: colours.surface,
    borderColor: colours.border,
    borderWidth: 1,
    borderRadius: radius,
    overflow: 'hidden',
  },
  // The last row's line tucks under the border.
  listInner: { marginBottom: -1 },
  listItem: { borderBottomColor: colours.border, borderBottomWidth: 1 },
  listRow: {
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  rowTitle: { color: colours.text, fontFamily: fonts.semibold, fontSize: 16 },
  rowDetail: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
  rowValue: { color: colours.textSecondary, fontFamily: fonts.medium, fontSize: 15, flexShrink: 1, textAlign: 'right' },
  rowBig: { color: colours.text, fontFamily: fonts.display, fontSize: 28 },
  rowBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  listAdd: { color: colours.accent, fontFamily: fonts.semibold, fontSize: 15 },
  content: { padding: space.lg, gap: space.md },
  title: { color: colours.text, fontSize: 28, ...display },
  display: { color: colours.text, ...display },
  label: {
    color: colours.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: 13,
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
    fontFamily: fonts.regular,
    fontSize: 17,
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
