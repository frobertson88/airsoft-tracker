// Medic rules library: built-in starters and your own sets (plans/medic-proposal.md §1).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Body,
  Button,
  ConfirmButton,
  ErrorText,
  Label,
  List,
  ListRow,
  Row,
  Screen,
  useOpenRow,
} from '../../components/ui';
import { api, friendlyError } from '../../lib/api';
import { EXPIRY_LABEL, helperText, rulesSummary, useMedicRulesets, type MedicRuleset } from '../../lib/medic';
import { colours } from '../../theme';

export default function MedicLibrary() {
  const { sets, defaultId, error: loadError, load } = useMedicRulesets();
  const [busy, setBusy] = useState<string | null>(null);
  const rows = useOpenRow<string>();
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const duplicate = (s: MedicRuleset) =>
    act(s.id, () => api.saveMedicRuleset(null, `${s.name} copy`.slice(0, 40), s.rules));

  const builtIn = sets?.filter((s) => !s.owner_id) ?? [];
  const own = sets?.filter((s) => s.owner_id) ?? [];

  // One row per set: the summary underneath, Default on the right. Tap to open its actions.
  const row = (s: MedicRuleset) => (
    <ListRow
      key={s.id}
      title={s.name}
      detail={`${rulesSummary(s.rules)}\n${EXPIRY_LABEL[s.rules.expiry]} · ${firstWound(s).name}: ${helperText(firstWound(s).helpers)}`}
      value={s.id === defaultId ? 'Default' : undefined}
      valueColour={colours.accent}
      open={rows.isOpen(s.id)}
      onPress={() => rows.toggle(s.id)}
    >
      <Row>
        <Button
          title={s.owner_id ? 'Edit' : 'View'}
          variant="secondary"
          onPress={() => router.push(`/medic/${s.id}`)}
        />
        <Button title="Duplicate" variant="secondary" busy={busy === s.id} onPress={() => duplicate(s)} />
        {s.id !== defaultId && (
          <Button
            title="Make default"
            variant="secondary"
            busy={busy === s.id}
            onPress={() => act(s.id, () => api.setDefaultMedicRuleset(s.id))}
          />
        )}
      </Row>
      {s.owner_id && (
        <ConfirmButton
          title="Delete"
          confirmTitle="Tap again to delete"
          busy={busy === s.id}
          onConfirm={() => act(s.id, () => api.deleteMedicRuleset(s.id))}
        />
      )}
    </ListRow>
  );

  return (
    <Screen>
      <Body muted>
        What each hit means, who can treat it, and what happens when bleed-out runs out. Pick a set when you set up a
        game.
      </Body>
      <Button title="Create medic rules" onPress={() => router.push('/medic/new')} />
      <ErrorText>{error || loadError}</ErrorText>

      {own.length > 0 && <Label>Your rules</Label>}
      {own.length > 0 && <List>{own.map(row)}</List>}
      <Label>Built in</Label>
      <Body muted>These can’t be changed. Duplicate one to make your own.</Body>
      <List>{builtIn.map(row)}</List>
    </Screen>
  );
}

/** The wound shown in the row: the first random wound, else the 1st hit. */
const firstWound = (s: MedicRuleset) => s.rules.wounds?.[0] ?? s.rules.hits[0];
