// Medic rules editor: a tab per hit (wound name, instruction, who can help) and
// what happens at bleed-out. id "new" starts from Standard; a built-in set
// opens as a copy, since built-ins can't be changed.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Body, Button, Card, Chip, ErrorText, Field, Label, Loading, Row, Screen } from '../../components/ui';
import { api, friendlyError } from '../../lib/api';
import { HELPERS, HIT_TABS, useMedicRulesets, type Helper, type MedicRules, type MedicRuleset, type Wound } from '../../lib/medic';
import { colours, fonts } from '../../theme';

export default function MedicEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sets } = useMedicRulesets();
  if (!sets) return <Loading />;
  const found = sets.find((s) => s.id === id);
  // New sets start from Standard (the first built-in).
  const source = found ?? sets.find((s) => !s.owner_id);
  if (!source || (id !== 'new' && !found)) {
    return (
      <Screen>
        <Body>Those medic rules no longer exist.</Body>
      </Screen>
    );
  }
  return <Editor key={source.id} source={source} copy={id === 'new' || !source.owner_id} isNew={id === 'new'} />;
}

function Editor({ source, copy, isNew }: { source: MedicRuleset; copy: boolean; isNew: boolean }) {
  const [name, setName] = useState(isNew ? '' : copy ? `${source.name} copy`.slice(0, 40) : source.name);
  const [rules, setRules] = useState<MedicRules>(source.rules);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const wound = rules.hits[tab];
  const setWound = (patch: Partial<Wound>) =>
    setRules((r) => ({ ...r, hits: r.hits.map((h, i) => (i === tab ? { ...h, ...patch } : h)) }));
  const toggle = (helper: Helper) =>
    setWound({
      helpers: wound.helpers.includes(helper) ? wound.helpers.filter((x) => x !== helper) : [...wound.helpers, helper],
    });

  const save = async () => {
    if (!name.trim()) return setError('Give the rules a name.');
    const empty = rules.hits.findIndex((h) => !h.name.trim() || h.helpers.length === 0);
    if (empty >= 0) {
      setTab(empty);
      return setError('Each hit needs a name and at least one person who can help.');
    }
    setBusy(true);
    setError('');
    try {
      await api.saveMedicRuleset(copy ? null : source.id, name.trim(), rules);
      router.back();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const dead = tab === HIT_TABS.length - 1;
  return (
    <Screen>
      <Stack.Screen options={{ title: copy ? 'New medic rules' : 'Edit medic rules' }} />
      {copy && !isNew && <Body muted>Built-in rules can’t be changed, so saving makes your own copy.</Body>}
      <Field value={name} onChangeText={setName} placeholder="Name, e.g. Sunday skirmish" maxLength={40} />

      <Row>
        {HIT_TABS.map((t, i) => (
          <Chip key={t} label={t} selected={tab === i} onPress={() => setTab(i)} />
        ))}
      </Row>

      <Card>
        <Text style={styles.small}>{dead ? 'Third hit' : 'Wound name'}</Text>
        <Field value={wound.name} onChangeText={(v) => setWound({ name: v })} placeholder={dead ? 'Dead' : 'Leg wound'} maxLength={30} />
        <Text style={styles.small}>What the player does</Text>
        <Field
          value={wound.instruction}
          onChangeText={(v) => setWound({ instruction: v })}
          placeholder={dead ? 'Go back to respawn with your hand up.' : 'Bandage the leg. Walk only until treated.'}
          maxLength={200}
          multiline
          style={styles.multi}
        />
        <Text style={styles.small}>{dead ? 'Who can bring them back' : 'Who can treat it'}</Text>
        <Row>
          {HELPERS.map((h) => (
            <Chip key={h.helper} label={h.label} selected={wound.helpers.includes(h.helper)} onPress={() => toggle(h.helper)} />
          ))}
        </Row>
        <Text style={styles.help}>Medic means players whose role today is Medic, on the same team.</Text>
      </Card>

      <Label>When bleed-out runs out</Label>
      <Row>
        <Chip label="Dead" selected={rules.expiry === 'dead'} onPress={() => setRules({ ...rules, expiry: 'dead' })} />
        <Chip label="Wait for help" selected={rules.expiry === 'wait'} onPress={() => setRules({ ...rules, expiry: 'wait' })} />
      </Row>
      <Text style={styles.help}>
        {rules.expiry === 'dead'
          ? 'An untreated wound becomes dead, and they need bringing back.'
          : 'They stay out of play until someone treats them.'}
      </Text>

      <Button title="Save" busy={busy} onPress={save} />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  small: { color: colours.textSecondary, fontFamily: fonts.medium, fontSize: 14 },
  help: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
  multi: { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' },
});
