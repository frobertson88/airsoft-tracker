// Host tab: admins manage the day here instead of an Admin Mode switch (docs/app-flow.md §12).
// Kept calm: the game first, then one card each for players and the field, with
// day settings at the bottom.
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FieldPicker } from '../../../components/FieldPicker';
import { GameControls } from '../../../components/GameControls';
import { MemberRow } from '../../../components/MemberList';
import { TrackingRows } from '../../../components/TrackingSettings';
import { Button, Card, ConfirmButton, ErrorText, Label, List, ListRow, Screen } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useCommand, useDay } from '../../../lib/day';
import { goHome } from '../../../lib/nav';
import { colours, space, teamColour, fonts } from '../../../theme';

export default function HostTab() {
  const { id, data, isAdmin } = useDay();
  const { run, busy, error } = useCommand();
  const [picking, setPicking] = useState(false);
  if (!data || !isAdmin) return null;

  const active = data.members.filter((m) => m.status === 'active');
  const incomplete = active.filter((m) => !m.day_role || !m.team_id);
  const counts = data.teams.map((t) => ({ team: t, n: active.filter((m) => m.team_id === t.id).length }));
  const gameState = data.game?.state ?? null;
  const gameRunning = !!gameState && gameState !== 'ready' && gameState !== 'complete';
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
      <List>
        {data.field ? (
          <ListRow
            title={data.field.name}
            detail={gameRunning ? 'Change it between games' : undefined}
            value={gameRunning ? undefined : 'Change'}
            valueColour={colours.accent}
            onPress={gameRunning ? undefined : () => setPicking(true)}
          />
        ) : (
          <ListRow
            title="No field yet"
            detail="Pick one before the first game"
            value="Choose"
            valueColour={colours.danger}
            onPress={() => setPicking(true)}
          />
        )}
      </List>
      {picking && <FieldPicker onClose={() => setPicking(false)} />}

      <Label>Day settings</Label>
      <List>
        <ListRow title="Your profile" detail="Callsign and sign out" onPress={() => router.push('/profile')} />
        <TrackingRows />
      </List>
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
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  big: { color: colours.text, fontFamily: fonts.semibold, fontSize: 17 },
  counts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs },
  count: { fontFamily: fonts.medium, fontSize: 14, fontVariant: ['tabular-nums'] },
  waiting: { color: colours.danger, fontFamily: fonts.regular, fontSize: 14 },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
});
