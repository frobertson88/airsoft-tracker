// Medic rules library: built-in starters and your own sets (plans/medic-proposal.md §1).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, ConfirmButton, ErrorText, Label, Row, Screen } from '../../components/ui';
import { api, friendlyError } from '../../lib/api';
import { EXPIRY_LABEL, helperText, rulesSummary, useMedicRulesets, type MedicRuleset } from '../../lib/medic';
import { colours, display, fonts, space } from '../../theme';

export default function MedicLibrary() {
  const { sets, defaultId, error: loadError, load } = useMedicRulesets();
  const [busy, setBusy] = useState<string | null>(null);
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

  const card = (s: MedicRuleset) => (
    <Card key={s.id}>
      <Pressable onPress={() => router.push(`/medic/${s.id}`)} accessibilityRole="button">
        <View style={styles.between}>
          <Text style={styles.name}>{s.name}</Text>
          {s.id === defaultId && <Text style={styles.badge}>Default</Text>}
        </View>
        <Text style={styles.meta}>{rulesSummary(s.rules)}</Text>
        <Text style={styles.meta}>
          {EXPIRY_LABEL[s.rules.expiry]} · {firstWound(s).name}: {helperText(firstWound(s).helpers)}
        </Text>
      </Pressable>
      <Row>
        {s.owner_id && <Button title="Edit" variant="quiet" onPress={() => router.push(`/medic/${s.id}`)} />}
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
    </Card>
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
      {own.map(card)}
      <Label>Built in</Label>
      <Body muted>These can’t be changed. Duplicate one to make your own.</Body>
      {builtIn.map(card)}
    </Screen>
  );
}

/** The wound shown on the card: the first random wound, else the 1st hit. */
const firstWound = (s: MedicRuleset) => s.rules.wounds?.[0] ?? s.rules.hits[0];

const styles = StyleSheet.create({
  name: { color: colours.text, fontSize: 22, ...display, flexShrink: 1 },
  meta: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 14, marginTop: 2 },
  badge: { color: colours.accent, fontFamily: fonts.semibold, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
});
