// Home: open Game Days first, then hosting and your history (docs/design-direction.md).
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { OpenDays, useOpenDays } from '../components/OpenDays';
import { Body, Card, Display, Label, Screen } from '../components/ui';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import type { DayStatus, MemberStatus } from '../lib/types';
import { colours, radius, space, fonts } from '../theme';

interface MyDay {
  game_day_id: string;
  status: MemberStatus;
  joined_at: string;
  game_days: { name: string; status: DayStatus; created_at: string } | null;
}

// Only route into the current day once per app launch.
let restoredOnLaunch = false;

export default function Home() {
  const { profile, session } = useAuth();
  const [days, setDays] = useState<MyDay[]>([]);
  const open = useOpenDays();
  const reloadOpen = open.load;

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('day_members')
      .select('game_day_id, status, joined_at, game_days(name, status, created_at)')
      .eq('user_id', session!.user.id)
      .order('joined_at', { ascending: false })
      .limit(20);
    const rows = (data ?? []) as unknown as MyDay[];
    setDays(rows);

    if (!restoredOnLaunch) {
      restoredOnLaunch = true;
      const current = rows.find((d) => d.status === 'active' && d.game_days?.status === 'open');
      if (current) router.push(`/day/${current.game_day_id}`);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
      reloadOpen();
    }, [load, reloadOpen]),
  );

  // Days you've been in that are no longer open (open ones are in the list above).
  const history = days.filter((d) => d.game_days?.status !== 'open');

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Display size={30}>{profile?.callsign}</Display>
        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel="Profile"
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{profile?.callsign?.[0]?.toUpperCase() ?? '?'}</Text>
        </Pressable>
      </View>

      <Label>Open game days</Label>
      <OpenDays days={open.days} error={open.error} />

      <Pressable
        onPress={() => router.push('/create')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.host, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="add" size={20} color={colours.accent} />
        <Text style={styles.hostText}>Host a game day</Text>
      </Pressable>

      {history.length > 0 && <Label>History</Label>}
      {history.map((d) => (
        <Card key={d.game_day_id}>
          <Body>{d.game_days?.name ?? 'Game Day'}</Body>
          <Body muted>Closed · {new Date(d.game_days?.created_at ?? d.joined_at).toLocaleDateString()}</Body>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm },
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
  host: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 52,
    borderRadius: radius,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colours.border,
  },
  hostText: { color: colours.accent, fontFamily: fonts.semibold, fontSize: 16 },
});
