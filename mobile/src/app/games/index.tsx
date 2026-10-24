// Saved games (Hosting → Games): set a game up before the day, then pick it
// under Your setups in the Host tab. Patrol games are built here.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Body, Button, ErrorText, List, ListAdd, ListRow, Row, Screen, useOpenRow } from '../../components/ui';
import type { GameConfig } from '../../lib/api';
import { api, friendlyError } from '../../lib/api';
import { describeSettings, formatLength, MODE_LABEL } from '../../lib/game';
import { supabase } from '../../lib/supabase';

type Setup = GameConfig & { id: string };

export default function Games() {
  const [setups, setSetups] = useState<Setup[] | null>(null);
  const rows = useOpenRow<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('game_setups')
      .select('id, name, mode, length_seconds, countdown_seconds, settings')
      .order('name');
    if (e) setError(e.message);
    setSetups((data ?? []) as Setup[]);
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const remove = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      await api.deleteGameSetup(id);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Body muted>Set games up before the day. In the Host tab, pick one under Your setups.</Body>
      <ErrorText>{error}</ErrorText>
      <List>
        {setups?.map((s) => (
          <ListRow
            key={s.id}
            title={s.name}
            detail={`${describeSettings(s.mode, s.settings)}\n${formatLength(s)}`}
            value={MODE_LABEL[s.mode]}
            open={rows.isOpen(s.id)}
            onPress={() => rows.toggle(s.id)}
          >
            <Row>
              <Button title="Edit" variant="secondary" onPress={() => router.push(`/games/${s.id}`)} />
              <Button title="Delete" variant="secondary" busy={busy} onPress={() => remove(s.id)} />
            </Row>
          </ListRow>
        ))}
        <ListAdd title="New Patrol game" onPress={() => router.push('/games/new?mode=patrol')} />
        <ListAdd title="New game" onPress={() => router.push('/games/new')} />
      </List>
      {setups && setups.length === 0 && <Body muted>No saved games yet.</Body>}
    </Screen>
  );
}
