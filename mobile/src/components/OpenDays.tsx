// The public list of open Game Days with Join (docs/app-flow.md §2–3).
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, friendlyError } from '../lib/api';
import { requestLocationForJoin, type LocationAccess } from '../lib/location';
import { supabase } from '../lib/supabase';
import type { OpenDay } from '../lib/types';
import { colours, display, radius, space, fonts } from '../theme';
import { Body, Button, Card, ErrorText } from './ui';

export function useOpenDays() {
  const [days, setDays] = useState<OpenDay[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setDays(await api.listOpenDays());
      setError('');
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

  useEffect(() => {
    api.listOpenDays().then(setDays, (e) => setError(friendlyError(e)));
    // New/closed days appear without refreshing.
    const channel = supabase
      .channel('open-days')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_days' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { days, error, load };
}

export function OpenDays({ days, error: loadError }: { days: OpenDay[] | null; error: string }) {
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [location, setLocation] = useState<LocationAccess | null>(null);

  const join = async (day: OpenDay) => {
    setError('');
    if (day.my_status === 'active') {
      router.push(`/day/${day.id}`);
      return;
    }
    setJoining(day.id);
    try {
      const access = await requestLocationForJoin();
      setLocation(access);
      if (access !== 'granted') return;
      await api.joinGameDay(day.id);
      router.push(`/day/${day.id}`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setJoining(null);
    }
  };

  return (
    <>
      {location && location !== 'granted' && (
        <Card style={{ borderColor: colours.danger }}>
          <Body>Location is required to join a Game Day. Your team sees your position.</Body>
          {location === 'ask' ? (
            <Button title="Allow location" onPress={() => requestLocationForJoin().then(setLocation)} />
          ) : (
            <Button title="Open settings" onPress={() => Linking.openSettings()} />
          )}
        </Card>
      )}
      <ErrorText>{error || loadError}</ErrorText>
      {days?.length === 0 && <Body muted>No open Game Days right now. Host one below.</Body>}
      {days?.map((d, i) => {
        const removed = d.my_status === 'removed';
        const joined = d.my_status === 'active';
        return (
          <Pressable
            key={d.id}
            onPress={() => join(d)}
            disabled={!!joining || removed}
            accessibilityRole="button"
            accessibilityLabel={`${joined ? 'Open' : 'Join'} ${d.name}`}
            style={[styles.card, i === 0 && styles.cardFirst, joining === d.id && { opacity: 0.6 }]}
          >
            <View style={styles.top}>
              <Text style={styles.name}>{d.name}</Text>
              {joined && <Text style={styles.badge}>Joined</Text>}
            </View>
            <Text style={styles.meta}>
              Hosted by {d.host_callsign ?? '—'} · {d.player_count}{' '}
              {d.player_count === 1 ? 'player' : 'players'}
            </Text>
            {removed ? (
              <Text style={[styles.meta, { color: colours.danger }]}>Removed. Ask an admin to readmit you.</Text>
            ) : (
              <Text style={[styles.cta, i === 0 ? styles.ctaFirst : null]}>{joined ? 'Open' : 'Join'}</Text>
            )}
          </Pressable>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colours.surface,
    borderColor: colours.border,
    borderWidth: 1,
    borderRadius: radius + 2,
    padding: space.lg,
    gap: space.sm,
  },
  cardFirst: { borderColor: colours.accent },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.sm },
  name: { color: colours.text, fontSize: 22, flexShrink: 1, ...display },
  badge: {
    color: colours.actionText,
    backgroundColor: colours.actionFill,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    fontFamily: fonts.semibold, fontSize: 12,
    overflow: 'hidden',
  },
  meta: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 14 },
  cta: {
    marginTop: space.xs,
    textAlign: 'center',
    paddingVertical: 12,
    borderRadius: radius - 2,
    overflow: 'hidden',
    backgroundColor: colours.actionFill,
    color: colours.actionText,
    fontFamily: fonts.semibold, fontSize: 15,
  },
  ctaFirst: { backgroundColor: colours.accent, color: colours.onAccent },
});
