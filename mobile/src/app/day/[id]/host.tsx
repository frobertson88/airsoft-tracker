// Host tab: admins manage the day here instead of an Admin Mode switch (docs/app-flow.md §12).
// Kept calm: the game first, then one card each for players and the field, with
// the rarely used day settings folded away at the bottom.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FieldPicker } from '../../../components/FieldPicker';
import { GameControls } from '../../../components/GameControls';
import { MemberRow } from '../../../components/MemberList';
import { TrackingSettings } from '../../../components/TrackingSettings';
import { Body, Button, Card, ConfirmButton, ErrorText, Label, Screen } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useCommand, useDay } from '../../../lib/day';
import { goHome } from '../../../lib/nav';
import { colours, display, space, teamColour, fonts } from '../../../theme';

export default function HostTab() {
  const { id, data, isAdmin } = useDay();
  const { run, busy, error } = useCommand();
  const [picking, setPicking] = useState(false);
  const [settings, setSettings] = useState(false);
  if (!data || !isAdmin) return null;

  const active = data.members.filter((m) => m.status === 'active');
  const incomplete = active.filter((m) => !m.day_role || !m.team_id);
  const counts = data.teams.map((t) => ({ team: t, n: active.filter((m) => m.team_id === t.id).length }));
  const playing = counts.reduce((sum, c) => sum + c.n, 0);

  return (
    <Screen>
      <GameControls />

      <Label>Players</Label>
      <Card style={{ gap: space.md }}>
        <Text style={styles.big}>{active.length} checked in</Text>
        {playing > 0 && (
          <View style={styles.bar}>
            {counts.map(({ team, n }) =>
              n > 0 ? <View key={team.id} style={{ flex: n, backgroundColor: teamColour(team.colour) }} /> : null,
            )}
          </View>
        )}
        <View style={styles.counts}>
          {counts.map(({ team, n }) => (
            <Text key={team.id} style={[styles.count, { color: teamColour(team.colour) }]}>
              {team.name} {n}
            </Text>
          ))}
        </View>
        {incomplete.length > 0 && (
          <>
            <Text style={styles.waiting}>Still choosing a team or role</Text>
            {incomplete.map((m) => (
              <MemberRow key={m.user_id} member={m} />
            ))}
          </>
        )}
        <Button title="Manage players and teams" variant="quiet" onPress={() => router.navigate(`/day/${id}/team`)} />
      </Card>

      <Label>Field</Label>
      <Card>
        {data.field ? (
          <View style={styles.between}>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.fieldName}>{data.field.name}</Text>
              {!!data.field.location && <Text style={styles.meta}>{data.field.location}</Text>}
            </View>
            <View style={styles.links}>
              <Pressable onPress={() => router.navigate(`/day/${id}/map`)} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.link}>View</Text>
              </Pressable>
              <Pressable onPress={() => setPicking(true)} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.link}>Change</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <Text style={[styles.fieldName, { color: colours.danger }]}>No field yet</Text>
            <Body muted>Pick one before the first game.</Body>
            <Button title="Choose field" onPress={() => setPicking(true)} />
          </>
        )}
      </Card>
      {picking && <FieldPicker onClose={() => setPicking(false)} />}

      <Pressable onPress={() => setSettings(!settings)} accessibilityRole="button" style={styles.fold}>
        <Text style={styles.foldText}>Day settings</Text>
        <Ionicons name={settings ? 'chevron-up' : 'chevron-down'} size={18} color={colours.textSecondary} />
      </Pressable>
      {settings && (
        <>
          <Button title="Edit your profile" variant="secondary" onPress={() => router.push('/profile')} />
          <TrackingSettings />
          <Label>Game Day</Label>
          <ConfirmButton
            title="Leave Game Day"
            confirmTitle="Tap again to leave"
            busy={busy}
            onConfirm={async () => {
              if (await run(() => api.leaveGameDay(id))) goHome();
            }}
          />
          <ConfirmButton
            title="End Game Day"
            confirmTitle="Tap again. This can’t be undone"
            busy={busy}
            onConfirm={async () => {
              if (await run(() => api.closeGameDay(id))) goHome();
            }}
          />
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  big: { color: colours.text, fontFamily: fonts.semibold, fontSize: 17 },
  link: { color: colours.accent, fontFamily: fonts.semibold, fontSize: 15 },
  links: { flexDirection: 'row', gap: space.lg },
  counts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs },
  count: { fontFamily: fonts.medium, fontSize: 14, fontVariant: ['tabular-nums'] },
  waiting: { color: colours.danger, fontFamily: fonts.regular, fontSize: 14 },
  fieldName: { color: colours.text, fontSize: 22, ...display },
  meta: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 14 },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  fold: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    marginTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colours.border,
  },
  foldText: { color: colours.textSecondary, fontFamily: fonts.semibold, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
});
