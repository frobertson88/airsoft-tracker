// Edit a saved game (Hosting → Games). Name, type, teams, length and
// countdown here; Patrol games also get their field, options and missions.
// Missions open as their own screens inside this one (so nothing is saved
// until Save game); Back steps out of a mission, then out of the list.
// King of the Hill and medic options are set in the Host tab and kept as saved.
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COUNTDOWNS, LENGTHS } from '../../components/GameControls';
import { MissionEditor, MissionList, PATROL_DEFAULTS, PatrolRows } from '../../components/PatrolEditor';
import { Button, Chip, ErrorText, Field, List, ListRow, Loading, Row, Screen, useOpenRow } from '../../components/ui';
import { api, friendlyError, type GameConfig } from '../../lib/api';
import { KOTH_DEFAULTS, MODE_LABEL, type GameMode } from '../../lib/game';
import type { PatrolSettings } from '../../lib/patrol';
import { supabase } from '../../lib/supabase';
import { colours, fonts, space } from '../../theme';

export default function EditGame() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const isNew = id === 'new';
  const [c, setC] = useState<GameConfig | null>(
    isNew
      ? {
          name: mode === 'patrol' ? 'Patrol' : 'Skirmish',
          length_seconds: 1800,
          countdown_seconds: 30,
          mode: mode === 'patrol' ? 'patrol' : 'free',
          settings: mode === 'patrol' ? { patrol: { ...PATROL_DEFAULTS } as PatrolSettings } : {},
        }
      : null,
  );
  const rows = useOpenRow<string>();
  // null = the game's settings, 'missions' = the mission list, else a mission id.
  const [view, setView] = useState<string | null>(null);
  const navigation = useNavigation();
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (view === null) return;
        e.preventDefault();
        setView(view === 'missions' ? null : 'missions');
      }),
    [navigation, view],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew) return;
    supabase
      .from('game_setups')
      .select('name, mode, length_seconds, countdown_seconds, settings')
      .eq('id', id)
      .single()
      .then(({ data, error: e }) => {
        if (e || !data) setError(e?.message ?? 'That saved game no longer exists.');
        else setC(data as GameConfig);
      });
  }, [id, isNew]);

  if (!c) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  const set = (patch: Partial<GameConfig>) => setC({ ...c, ...patch });
  const teamCount = c.settings.team_count ?? 2;
  const patrol = c.settings.patrol;

  const save = async () => {
    if (!c.name.trim()) return setError('Give the game a name.');
    setBusy(true);
    setError('');
    try {
      await api.saveGameSetup(isNew ? null : id, { ...c, name: c.name.trim() });
      router.back();
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  const setPatrol = (p: Partial<PatrolSettings>) => set({ settings: { ...c.settings, patrol: p as PatrolSettings } });
  if (c.mode === 'patrol' && view !== null) {
    const mission = patrol?.missions.find((m) => m.id === view);
    return (
      <Screen key={view}>
        <Stack.Screen options={{ title: view === 'missions' ? 'Missions' : mission?.name || 'Mission' }} />
        {view === 'missions' ? (
          <>
            <MissionList value={patrol} onChange={setPatrol} onOpen={setView} />
            <Button title="Back to the game" onPress={() => setView(null)} />
          </>
        ) : (
          <MissionEditor
            value={patrol}
            onChange={setPatrol}
            missionId={view}
            teamCount={teamCount}
            onOpen={setView}
            onClose={() => setView('missions')}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? 'New game' : 'Edit game' }} />
      <Field value={c.name} onChangeText={(name) => set({ name })} placeholder="Game name" maxLength={40} />
      <List>
        <ListRow title="Game type" value={MODE_LABEL[c.mode]} open={rows.isOpen('mode')} onPress={() => rows.toggle('mode')}>
          <Row style={styles.wrap}>
            {(['free', 'koth', 'patrol'] as GameMode[]).map((m) => (
              <Chip
                key={m}
                label={MODE_LABEL[m]}
                selected={c.mode === m}
                onPress={() =>
                  set({
                    mode: m,
                    settings: {
                      team_count: teamCount,
                      medic: c.settings.medic,
                      ...(m === 'koth' ? KOTH_DEFAULTS : {}),
                      ...(m === 'patrol' ? { patrol: patrol ?? ({ ...PATROL_DEFAULTS } as PatrolSettings) } : {}),
                    },
                  })
                }
              />
            ))}
          </Row>
          {c.mode === 'koth' && <Text style={styles.help}>Set the hill and medic rules in the Host tab when you pick this game.</Text>}
        </ListRow>
        <ListRow title="Teams" value={`${teamCount} teams`} open={rows.isOpen('teams')} onPress={() => rows.toggle('teams')}>
          <Row style={styles.wrap}>
            {[2, 3, 4].map((n) => (
              <Chip key={n} label={`${n} teams`} selected={teamCount === n} onPress={() => set({ settings: { ...c.settings, team_count: n } })} />
            ))}
          </Row>
        </ListRow>
        <ListRow
          title="Length"
          value={LENGTHS.find((l) => l.seconds === c.length_seconds)?.label ?? `${Math.round((c.length_seconds ?? 0) / 60)} min`}
          open={rows.isOpen('length')}
          onPress={() => rows.toggle('length')}
        >
          <Row style={styles.wrap}>
            {LENGTHS.map((l) => (
              <Chip key={l.label} label={l.label} selected={c.length_seconds === l.seconds} onPress={() => set({ length_seconds: l.seconds })} />
            ))}
          </Row>
        </ListRow>
        <ListRow
          title="Start countdown"
          value={COUNTDOWNS.find((x) => x.seconds === c.countdown_seconds)?.label ?? `${c.countdown_seconds}s`}
          open={rows.isOpen('countdown')}
          onPress={() => rows.toggle('countdown')}
        >
          <Row style={styles.wrap}>
            {COUNTDOWNS.map((x) => (
              <Chip key={x.label} label={x.label} selected={c.countdown_seconds === x.seconds} onPress={() => set({ countdown_seconds: x.seconds })} />
            ))}
          </Row>
        </ListRow>
        {c.mode === 'patrol' && (
          <PatrolRows value={patrol} rows={rows} onChange={setPatrol} onOpenMissions={() => setView('missions')} />
        )}
      </List>
      <View style={{ gap: space.sm }}>
        <Button title="Save game" busy={busy} onPress={save} />
        <Button title="Cancel" variant="quiet" onPress={() => router.back()} />
        <ErrorText>{error}</ErrorText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexWrap: 'wrap', gap: space.sm },
  help: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
});
