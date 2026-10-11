// Game Days you've played in that have since closed.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Body, Card, Screen } from '../components/ui';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import type { DayStatus } from '../lib/types';
import { colours, display, space } from '../theme';

interface PastDay {
  game_day_id: string;
  joined_at: string;
  game_days: { name: string; status: DayStatus; created_at: string } | null;
}

export default function History() {
  const { session } = useAuth();
  const [days, setDays] = useState<PastDay[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('day_members')
        .select('game_day_id, joined_at, game_days(name, status, created_at)')
        .eq('user_id', session!.user.id)
        .order('joined_at', { ascending: false })
        .limit(100)
        .then(({ data }) =>
          setDays(((data ?? []) as unknown as PastDay[]).filter((d) => d.game_days?.status === 'closed')),
        );
    }, [session]),
  );

  return (
    <Screen>
      {days?.length === 0 && <Body muted>No finished Game Days yet. They show here once a host ends the day.</Body>}
      {days?.map((d) => (
        <Card key={d.game_day_id}>
          <View style={styles.row}>
            <Text style={styles.name}>{d.game_days?.name ?? 'Game Day'}</Text>
            <Body muted>{new Date(d.game_days?.created_at ?? d.joined_at).toLocaleDateString()}</Body>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  name: { color: colours.text, fontSize: 20, flexShrink: 1, ...display },
});
