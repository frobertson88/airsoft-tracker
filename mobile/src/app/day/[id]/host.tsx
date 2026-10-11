// Host tab: admins manage the day here instead of an Admin Mode switch (docs/app-flow.md §12).
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FieldPicker } from '../../../components/FieldPicker';
import { GameControls } from '../../../components/GameControls';
import { TrackingSettings } from '../../../components/TrackingSettings';
import { MemberRow } from '../../../components/MemberList';
import { Body, Button, Card, ConfirmButton, ErrorText, Label, Screen } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useCommand, useDay } from '../../../lib/day';
import { goHome } from '../../../lib/nav';
import { colours, display, space, teamColour, fonts } from '../../../theme';

export default function HostTab() {
  const { id, data, isAdmin } = useDay();
  const { profile } = useAuth();
  const { run, busy, error } = useCommand();
  const [picking, setPicking] = useState(false);
  if (!data || !isAdmin) return null;

  const active = data.members.filter((m) => m.status === 'active');
  const incomplete = active.filter((m) => !m.day_role || !m.team_id);
  const counts = data.teams.map((t) => ({ team: t, n: active.filter((m) => m.team_id === t.id).length }));
  const playing = counts.reduce((sum, c) => sum + c.n, 0);

  return (
    <Screen>
      <GameControls />

      <Label>Lobby</Label>
      <Card style={{ padding: space.lg, gap: space.md }}>
        <View style={styles.between}>
          <Body muted>Lobby</Body>
          <Text style={styles.mono}>{active.length} checked in</Text>
        </View>
        {playing > 0 && (
          <View style={styles.bar}>
            {counts.map(({ team, n }) =>
              n > 0 ? <View key={team.id} style={{ flex: n, backgroundColor: teamColour(team.colour) }} /> : null,
            )}
          </View>
        )}
        <View style={styles.between}>
          {counts.map(({ team, n }) => (
            <Text key={team.id} style={{ color: teamColour(team.colour), fontFamily: fonts.regular, fontSize: 14 }}>
              {team.name} {n}
            </Text>
          ))}
        </View>
      </Card>

      <Label>Still choosing a team or role</Label>
      <Card>
        {incomplete.length === 0 ? (
          <Body muted>Everyone is checked in.</Body>
        ) : (
          incomplete.map((m) => <MemberRow key={m.user_id} member={m} />)
        )}
      </Card>

      <Button
        title="Manage players and teams"
        variant="quiet"
        onPress={() => router.navigate(`/day/${id}/team`)}
      />

      <Label>Field</Label>
      <Card>
        {data.field ? (
          <>
            <Text style={styles.fieldName}>{data.field.name}</Text>
            <Body muted>
              {[data.field.location, `${data.field.data.areas.length} areas`, `${data.field.data.points.length} points`]
                .filter(Boolean)
                .join(' · ')}
            </Body>
            <Button title="Review on map" variant="quiet" onPress={() => router.navigate(`/day/${id}/map`)} />
            <Button title="Change field" variant="secondary" onPress={() => setPicking(true)} />
          </>
        ) : (
          <>
            <Text style={[styles.fieldName, { color: colours.danger }]}>Field not selected</Text>
            <Body muted>Pick a field before the first game. Players see it on the Map tab.</Body>
            <Button title="Choose field" onPress={() => setPicking(true)} />
          </>
        )}
      </Card>
      {picking && <FieldPicker onClose={() => setPicking(false)} />}


      <Label>You</Label>
      <Card>
        <Body>{profile?.callsign}</Body>
        <Button title="Edit profile" variant="secondary" onPress={() => router.push('/profile')} />
      </Card>
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
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mono: { color: colours.text, fontFamily: fonts.regular, fontSize: 14, fontVariant: ['tabular-nums'] },
  fieldName: { color: colours.text, fontSize: 22, ...display },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
});
