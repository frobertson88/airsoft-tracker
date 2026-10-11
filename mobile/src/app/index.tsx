// Home: join a Game Day first, then your kit, with hosting last since only one
// person hosts each day (docs/design-direction.md).
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { OpenDays, useOpenDays } from '../components/OpenDays';
import { Body, Display, Label, Screen } from '../components/ui';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { colours, radius, space, fonts } from '../theme';

// Only route into the current day once per app launch.
let restoredOnLaunch = false;

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function KitRow({ icon, title, meta, href }: { icon: IconName; title: string; meta: string; href: string }) {
  return (
    <Pressable
      onPress={() => router.push(href as never)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.kitRow, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name={icon} size={20} color={colours.accent} />
      <View style={{ flex: 1 }}>
        <Text style={styles.kitTitle}>{title}</Text>
        <Text style={styles.kitMeta}>{meta}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colours.textSecondary} />
    </Pressable>
  );
}

export default function Home() {
  const { profile, session } = useAuth();
  const open = useOpenDays();
  const reloadOpen = open.load;

  // On launch, go straight back into a day you're still in.
  const restore = useCallback(async () => {
    if (restoredOnLaunch) return;
    restoredOnLaunch = true;
    const { data } = await supabase
      .from('day_members')
      .select('game_day_id, game_days!inner(status)')
      .eq('user_id', session!.user.id)
      .eq('status', 'active')
      .eq('game_days.status', 'open')
      .limit(1);
    const current = data?.[0];
    if (current) router.push(`/day/${current.game_day_id}`);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      restore();
      reloadOpen();
    }, [restore, reloadOpen]),
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.hello}>Ready to play,</Text>
          <Display size={30}>{profile?.callsign}</Display>
        </View>
        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel="Profile"
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{profile?.callsign?.[0]?.toUpperCase() ?? '?'}</Text>
        </Pressable>
      </View>

      <Label>Join a game day</Label>
      <Body muted>Tap a game day to join it, then pick your team.</Body>
      <OpenDays days={open.days} error={open.error} />

      <Label>Your kit</Label>
      <View style={styles.kit}>
        <KitRow icon="map-outline" title="Fields" meta="Set up a field once, reuse it" href="/fields" />
        <View style={styles.divider} />
        <KitRow icon="time-outline" title="History" meta="Game days you've played" href="/history" />
      </View>

      <View style={styles.hostBox}>
        <Body muted>Running the day?</Body>
        <Pressable
          onPress={() => router.push('/create')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.host, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="flag-outline" size={18} color={colours.accent} />
          <Text style={styles.hostText}>Host a game day</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm },
  hello: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 14 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colours.border,
    backgroundColor: colours.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colours.text, fontFamily: fonts.display, fontSize: 18 },
  kit: {
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colours.border,
    backgroundColor: colours.surface,
  },
  kitRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingHorizontal: space.md },
  kitTitle: { color: colours.text, fontFamily: fonts.semibold, fontSize: 16 },
  kitMeta: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
  divider: { height: 1, backgroundColor: colours.border, marginLeft: space.md + 20 + space.md },
  hostBox: { marginTop: space.lg, alignItems: 'center', gap: space.xs },
  host: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colours.border,
  },
  hostText: { color: colours.accent, fontFamily: fonts.semibold, fontSize: 15 },
});
