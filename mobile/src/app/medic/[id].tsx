// Medic rules editor: a tab per hit (wound name, instruction, who can help) and
// what happens at bleed-out. A random set has a Wounds tab instead (each with a
// chance and a fatal switch) and picks which hit is always dead. id "new"
// starts from Standard; a built-in set opens as a copy, since built-ins can't
// be changed.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, Chip, ErrorText, Field, Label, Loading, Row, Screen } from '../../components/ui';
import { api, friendlyError } from '../../lib/api';
import {
  chancePercents,
  DEAD_ON_CHOICES,
  HELPERS,
  isRandom,
  ORDINAL,
  useMedicRulesets,
  type Helper,
  type MedicRules,
  type MedicRuleset,
  type Wound,
} from '../../lib/medic';
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
  const [rules, setRules] = useState<MedicRules>({ hits: source.rules.hits, expiry: source.rules.expiry });
  // Random sets: the wound list and the hit that's always dead. Kept while you
  // switch back and forth; only saved when Random is picked.
  const [random, setRandom] = useState(isRandom(source.rules));
  const [wounds, setWounds] = useState<Wound[]>(
    source.rules.wounds?.length ? source.rules.wounds : starterWounds(source.rules),
  );
  const [deadOn, setDeadOn] = useState(source.rules.dead_on ?? 3);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tabs = random
    ? ['Wounds', 'Dead']
    : rules.hits.map((_, i) => (i === rules.hits.length - 1 ? 'Dead' : `${ORDINAL[i + 1]} hit`));
  const dead = tab === tabs.length - 1;
  const hitIndex = dead ? rules.hits.length - 1 : tab;
  const setHit = (patch: Partial<Wound>) =>
    setRules((r) => ({ ...r, hits: r.hits.map((h, i) => (i === hitIndex ? { ...h, ...patch } : h)) }));
  const setWound = (index: number, patch: Partial<Wound>) =>
    setWounds((ws) => ws.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  // In order: 1–5 wounds before Dead. A new hit starts as a copy of this one.
  const addHit = () => {
    setRules((r) => ({ ...r, hits: [...r.hits.slice(0, tab + 1), { ...r.hits[tab] }, ...r.hits.slice(tab + 1)] }));
    setTab(tab + 1);
  };
  const removeHit = () => {
    setRules((r) => ({ ...r, hits: r.hits.filter((_, i) => i !== tab) }));
    setTab(Math.max(0, tab - 1));
  };
  const pickMode = (r: boolean) => {
    setRandom(r);
    setTab(0);
  };

  const save = async () => {
    if (!name.trim()) return setError('Give the rules a name.');
    const empty = rules.hits.findIndex(
      (h, i) => (!random || i === rules.hits.length - 1) && (!h.name.trim() || h.helpers.length === 0),
    );
    if (empty >= 0) {
      setTab(random ? 1 : empty);
      return setError('Each hit needs a name and at least one person who can help.');
    }
    if (random && wounds.some((w) => !w.name.trim() || (!w.fatal && w.helpers.length === 0) || !w.chance)) {
      setTab(0);
      return setError('Each wound needs a name, a chance of 1 to 100, and someone who can treat it.');
    }
    setBusy(true);
    setError('');
    try {
      await api.saveMedicRuleset(
        copy ? null : source.id,
        name.trim(),
        random ? { ...rules, wounds, dead_on: deadOn } : rules,
      );
      router.back();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const pc = chancePercents(wounds);
  return (
    <Screen>
      <Stack.Screen options={{ title: copy ? 'New medic rules' : 'Edit medic rules' }} />
      {copy && !isNew && <Body muted>Built-in rules can’t be changed, so saving makes your own copy.</Body>}
      <Field value={name} onChangeText={setName} placeholder="Name, e.g. Sunday skirmish" maxLength={40} />

      <Label>Wounds</Label>
      <Row>
        <Chip label="In order" selected={!random} onPress={() => pickMode(false)} />
        <Chip label="Random" selected={random} onPress={() => pickMode(true)} />
      </Row>
      <Text style={styles.help}>
        {random
          ? 'Each hit picks a wound from your list by its chance. The player only finds out when someone scans them.'
          : 'Leg, then arm, then dead: the same order every life.'}
      </Text>

      <Row>
        {tabs.map((t, i) => (
          <Chip key={t} label={t} selected={tab === i} onPress={() => setTab(i)} />
        ))}
      </Row>

      {random && !dead ? (
        <>
          {wounds.map((w, i) => (
            <Card key={i}>
              <Text style={styles.small}>Wound name</Text>
              <Field
                value={w.name}
                onChangeText={(v) => setWound(i, { name: v })}
                placeholder="Head shot"
                maxLength={30}
              />
              <Text style={styles.small}>What the player does</Text>
              <Field
                value={w.instruction}
                onChangeText={(v) => setWound(i, { instruction: v })}
                placeholder="Bandage the leg. Walk only until treated."
                maxLength={200}
                multiline
                style={styles.multi}
              />
              <Text style={styles.small}>Chance</Text>
              <View style={styles.chance}>
                <Field
                  value={w.chance ? String(w.chance) : ''}
                  onChangeText={(v) => setWound(i, { chance: Math.min(100, Number(v.replace(/[^0-9]/g, '')) || 0) })}
                  keyboardType="number-pad"
                  maxLength={3}
                  placeholder="1"
                  style={styles.chanceField}
                />
                <Text style={styles.percent}>{pc[i]}% of hits</Text>
              </View>
              <Row>
                <Chip label="Fatal" selected={!!w.fatal} onPress={() => setWound(i, { fatal: !w.fatal })} />
              </Row>
              {w.fatal ? (
                <Text style={styles.help}>Dead at once. The Dead tab says who can bring them back.</Text>
              ) : (
                <>
                  <Text style={styles.small}>Who can treat it</Text>
                  <HelperChips helpers={w.helpers} onChange={(helpers) => setWound(i, { helpers })} />
                </>
              )}
              <Row>
                {wounds.length < 12 && (
                  <Button
                    title="Duplicate"
                    variant="quiet"
                    onPress={() => setWounds((ws) => [...ws.slice(0, i + 1), { ...w }, ...ws.slice(i + 1)])}
                  />
                )}
                {wounds.length > 1 && (
                  <Button
                    title="Remove"
                    variant="quiet"
                    onPress={() => setWounds((ws) => ws.filter((_, j) => j !== i))}
                  />
                )}
              </Row>
            </Card>
          ))}
          {wounds.length < 12 && (
            <Button
              title="Add wound"
              variant="secondary"
              onPress={() =>
                setWounds((ws) => [...ws, { name: '', instruction: '', helpers: ['medic'], chance: 10, fatal: false }])
              }
            />
          )}
          <Text style={styles.help}>Chances are weighed against each other, so they don’t need to add up to 100.</Text>
        </>
      ) : (
        <Card>
          <Text style={styles.small}>
            {dead ? (random ? 'Dead' : `${ORDINAL[rules.hits.length]} hit`) : 'Wound name'}
          </Text>
          <Field
            value={rules.hits[hitIndex].name}
            onChangeText={(v) => setHit({ name: v })}
            placeholder={dead ? 'Dead' : 'Leg wound'}
            maxLength={30}
          />
          <Text style={styles.small}>What the player does</Text>
          <Field
            value={rules.hits[hitIndex].instruction}
            onChangeText={(v) => setHit({ instruction: v })}
            placeholder={dead ? 'Go back to respawn with your hand up.' : 'Bandage the leg. Walk only until treated.'}
            maxLength={200}
            multiline
            style={styles.multi}
          />
          <Text style={styles.small}>{dead ? 'Who can bring them back' : 'Who can treat it'}</Text>
          <HelperChips helpers={rules.hits[hitIndex].helpers} onChange={(helpers) => setHit({ helpers })} />
          <Text style={styles.help}>Medic means players whose role today is Medic, on the same team.</Text>
          {!random && !dead && (
            <Row>
              {rules.hits.length < 6 && <Button title="Add a hit after this" variant="quiet" onPress={addHit} />}
              {rules.hits.length > 2 && <Button title="Remove this hit" variant="quiet" onPress={removeHit} />}
            </Row>
          )}
          {random && (
            <>
              <Text style={styles.small}>Dead on hit</Text>
              <Row>
                {DEAD_ON_CHOICES.map((n) => (
                  <Chip key={n} label={ORDINAL[n]} selected={deadOn === n} onPress={() => setDeadOn(n)} />
                ))}
              </Row>
              <Text style={styles.help}>
                The {ORDINAL[deadOn]} hit in one life is dead, whatever the earlier wounds were. A fatal wound is dead
                sooner.
              </Text>
            </>
          )}
        </Card>
      )}

      <Label>When bleed-out runs out</Label>
      <Row>
        <Chip label="Dead" selected={rules.expiry === 'dead'} onPress={() => setRules({ ...rules, expiry: 'dead' })} />
        <Chip
          label="Wait for help"
          selected={rules.expiry === 'wait'}
          onPress={() => setRules({ ...rules, expiry: 'wait' })}
        />
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

function HelperChips({ helpers, onChange }: { helpers: Helper[]; onChange: (helpers: Helper[]) => void }) {
  return (
    <Row>
      {HELPERS.map((h) => (
        <Chip
          key={h.helper}
          label={h.label}
          selected={helpers.includes(h.helper)}
          onPress={() =>
            onChange(helpers.includes(h.helper) ? helpers.filter((x) => x !== h.helper) : [...helpers, h.helper])
          }
        />
      ))}
    </Row>
  );
}

/** A first wound list when switching an in-order set to Random: its two wounds, evenly. */
const starterWounds = (r: MedicRules): Wound[] => r.hits.slice(0, -1).map((h) => ({ ...h, chance: 50, fatal: false }));

const styles = StyleSheet.create({
  small: { color: colours.textSecondary, fontFamily: fonts.medium, fontSize: 14 },
  help: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
  multi: { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' },
  chance: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chanceField: { width: 80 },
  percent: { color: colours.text, fontFamily: fonts.semibold, fontSize: 15 },
});
