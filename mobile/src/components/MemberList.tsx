import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDay } from '../lib/day';
import type { DayMember } from '../lib/types';
import { colours, fonts, space } from '../theme';

export function MemberRow({
  member,
  onPress,
  action,
}: {
  member: DayMember;
  onPress?: () => void;
  /** Small text button on the right, e.g. "Make lead". */
  action?: { label: string; onPress: () => void };
}) {
  const { callsign, me, sectionById } = useDay();
  const leads = !!member.section_id && sectionById(member.section_id)?.leader_id === member.user_id;
  const content = (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.name}>
          {callsign(member.user_id)}
          {member.user_id === me?.user_id ? ' (you)' : ''}
        </Text>
        <Text style={styles.meta}>
          {leads ? <Text style={styles.lead}>Section lead · </Text> : null}
          {member.day_role ?? 'No role'}
          {member.is_admin ? ' · Admin' : ''}
        </Text>
      </View>
      {action && (
        <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={8} style={styles.action}>
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 52,
    gap: space.sm,
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colours.border,
  },
  text: { flexShrink: 1, gap: 2 },
  name: { color: colours.text, fontFamily: fonts.medium, fontSize: 16 },
  meta: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
  lead: { color: colours.accent, fontFamily: fonts.semibold },
  action: {
    borderColor: colours.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: space.md,
    minHeight: 36,
    justifyContent: 'center',
  },
  actionText: { color: colours.accent, fontFamily: fonts.medium, fontSize: 14 },
});
