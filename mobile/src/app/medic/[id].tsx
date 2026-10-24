// Medic rules editor: one list of wound cards (name, instruction, who can help)
// then Dead, and what happens at bleed-out. In order, each card is the next hit;
// Random, each card also has a chance (adding up to 100%) and a fatal switch,
// and you pick which hit is always dead. id "new" starts from Standard; a
// built-in set opens as a copy, since built-ins can't be changed.
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
  const [expiry, setExpiry] = useState(source.rules.expiry);
  // In order: the wounds before Dead. Random: the wound list and the hit that's
  // always dead. Both lists are kept while you switch; only one is saved.
  const [ordered, setOrdered] = useState<Wound[]>(source.rules.hits.slice(0, -1));
  const [dead, setDead] = useState<Wound>(source.rules.hits[source.rules.hits.length - 1]);
  const [random, setRandom] = useState(isRandom(source.rules));
  const [wounds, setWounds] = useState<Wound[]>(() =>
    toPercents(source.rules.wounds?.length ? source.rules.wounds : starterWounds(source.rules)),
  );
  const [deadOn, setDeadOn] = useState(source.rules.dead_on ?? 3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const list = random ? wounds : ordered;
  const setList = random ? setWounds : setOrdered;
  const max = random ? 12 : 5;
  const total = wounds.reduce((n, w) => n + (w.chance ?? 0), 0);
  const edit = (index: number, patch: Partial<Wound>) =>
    setList((ws) => ws.map((w, i) => (i === index ? { ...w, ...patch } : w)));

  const save = async () => {
    if (!name.trim()) return setError('Give the rules a name.');
    if (list.some((w) => !w.name.trim() || (!w.fatal && w.helpers.length === 0))) {
      return setError('Each wound needs a name and at least one person who can treat it.');
    }
    if (!dead.name.trim() || dead.helpers.length === 0) {
      return setError('Dead needs a name and someone who can bring them back.');
    }
    if (random && total !== 100) return setError(`The chances add up to ${total}%. Make them 100%.`);
    // A random set still saves in-order hits, for the published app to show.
    const hits = [...(ordered.length ? ordered : wounds.filter((w) => !w.fatal).slice(0, 1)), dead].map(
      ({ name, instruction, helpers }) => ({ name, instruction, helpers }),
    );
    setBusy(true);
    setError('');
    try {
      await api.saveMedicRuleset(
        copy ? null : source.id,
        name.trim(),
        random ? { hits, expiry, wounds, dead_on: deadOn } : { hits, expiry },
      );
      router.back();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: copy ? 'New medic rules' : 'Edit medic rules' }} />
      {copy && !isNew && <Body muted>Built-in rules can’t be changed, so saving makes your own copy.</Body>}
      <Field value={name} onChangeText={setName} placeholder="Name, e.g. Sunday skirmish" maxLength={40} />

      <Label>Wounds</Label>
      <Row>
        <Chip label="In order" selected={!random} onPress={() => setRandom(false)} />
        <Chip label="Random" selected={random} onPress={() => setRandom(true)} />
      </Row>
      <Text style={styles.help}>
        {random
          ? 'Each hit picks a wound from the list by its chance. The player only finds out when someone scans them.'
          : 'The same wounds in the same order every life, then dead.'}
      </Text>

      {list.map((w, i) => (
        <Card key={i}>
          <Text style={styles.kicker}>{random ? `Wound ${i + 1}` : `${ORDINAL[i + 1]} hit`}</Text>
          <WoundFields wound={w} onChange={(patch) => edit(i, patch)} />
          {random && (
            <>
              <Text style={styles.small}>Chance</Text>
              <View style={styles.chance}>
                <Button
                  title="−"
                  variant="secondary"
                  onPress={() => edit(i, { chance: (w.chance ?? 0) > 5 ? (w.chance ?? 0) - 5 : w.chance })}
                />
                <Text style={styles.percent}>{w.chance ?? 0}%</Text>
                <Button
                  title="+"
                  variant="secondary"
                  onPress={() => edit(i, { chance: Math.min(100, (w.chance ?? 0) + 5) })}
                />
              </View>
              <Row>
                <Chip label="Fatal" selected={!!w.fatal} onPress={() => edit(i, { fatal: !w.fatal })} />
              </Row>
            </>
          )}
          <Row>
            {list.length < max && (
              <Button
                title="Duplicate"
                variant="quiet"
                onPress={() => setList((ws) => [...ws.slice(0, i + 1), { ...w }, ...ws.slice(i + 1)])}
              />
            )}
            {list.length > 1 && (
              <Button title="Remove" variant="quiet" onPress={() => setList((ws) => ws.filter((_, j) => j !== i))} />
            )}
          </Row>
        </Card>
      ))}
      {list.length < max && (
        <Button
          title={random ? 'Add wound' : 'Add hit'}
          variant="secondary"
          onPress={() =>
            setList((ws) => [
              ...ws,
              { name: '', instruction: '', helpers: ['medic'], ...(random ? { chance: 10, fatal: false } : {}) },
            ])
          }
        />
      )}
      {random && (
        <Row>
          <Text style={[styles.percent, total !== 100 && { color: colours.danger }]}>Total {total}%</Text>
          <Button title="Split evenly" variant="quiet" onPress={() => setWounds((ws) => toPercents(ws, true))} />
        </Row>
      )}

      <Card>
        <Text style={styles.kicker}>
          {random ? `${ORDINAL[deadOn]} hit · Dead` : `${ORDINAL[list.length + 1]} hit · Dead`}
        </Text>
        <WoundFields wound={dead} onChange={(patch) => setDead((d) => ({ ...d, ...patch }))} dead />
        {random && (
          <>
            <Text style={styles.small}>Dead on hit</Text>
            <Row>
              {DEAD_ON_CHOICES.map((n) => (
                <Chip key={n} label={ORDINAL[n]} selected={deadOn === n} onPress={() => setDeadOn(n)} />
              ))}
            </Row>
            <Text style={styles.help}>A fatal wound is dead sooner, and follows these rules too.</Text>
          </>
        )}
      </Card>
      <Text style={styles.help}>Medic means players whose role today is Medic, on the same team.</Text>

      <Label>When bleed-out runs out</Label>
      <Row>
        <Chip label="Dead" selected={expiry === 'dead'} onPress={() => setExpiry('dead')} />
        <Chip label="Wait for help" selected={expiry === 'wait'} onPress={() => setExpiry('wait')} />
      </Row>
      <Text style={styles.help}>
        {expiry === 'dead'
          ? 'An untreated wound becomes dead, and they need bringing back.'
          : 'They stay out of play until someone treats them.'}
      </Text>

      <Button title="Save" busy={busy} onPress={save} />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

/** Name, instruction and helpers: the same for a hit, a random wound and Dead. */
function WoundFields({
  wound,
  onChange,
  dead,
}: {
  wound: Wound;
  onChange: (patch: Partial<Wound>) => void;
  dead?: boolean;
}) {
  return (
    <>
      <Field
        value={wound.name}
        onChangeText={(v) => onChange({ name: v })}
        placeholder={dead ? 'Dead' : 'Wound name, e.g. Leg wound'}
        maxLength={30}
      />
      <Text style={styles.small}>What the player does</Text>
      <Field
        value={wound.instruction}
        onChangeText={(v) => onChange({ instruction: v })}
        placeholder={dead ? 'Go back to respawn with your hand up.' : 'Bandage the leg. Walk only until treated.'}
        maxLength={200}
        multiline
        style={styles.multi}
      />
      {wound.fatal ? (
        <Text style={styles.help}>Fatal: dead at once. The Dead card says who can bring them back.</Text>
      ) : (
        <>
          <Text style={styles.small}>{dead ? 'Who can bring them back' : 'Who can treat it'}</Text>
          <Row>
            {HELPERS.map((h) => (
              <Chip
                key={h.helper}
                label={h.label}
                selected={wound.helpers.includes(h.helper)}
                onPress={() =>
                  onChange({
                    helpers: wound.helpers.includes(h.helper)
                      ? wound.helpers.filter((x) => x !== h.helper)
                      : [...wound.helpers, h.helper],
                  })
                }
              />
            ))}
          </Row>
        </>
      )}
    </>
  );
}

/** A first wound list when switching an in-order set to Random: its wounds. */
const starterWounds = (r: MedicRules): Wound[] => r.hits.slice(0, -1).map((h) => ({ ...h, fatal: false }));

/**
 * Chances as whole percentages adding up to 100 (older sets saved free
 * weights). even: split equally. Rounding leftovers go to the first wounds.
 */
function toPercents(wounds: Wound[], even = false): Wound[] {
  const pc = even ? wounds.map(() => Math.floor(100 / wounds.length)) : chancePercents(wounds);
  let left = 100 - pc.reduce((a, b) => a + b, 0);
  return wounds.map((w, i) => {
    const extra = left > 0 ? 1 : left < 0 ? -1 : 0;
    left -= extra;
    return { ...w, chance: Math.max(1, pc[i] + extra) };
  });
}

const styles = StyleSheet.create({
  kicker: {
    color: colours.accent,
    fontFamily: fonts.semibold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  small: { color: colours.textSecondary, fontFamily: fonts.medium, fontSize: 14 },
  help: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
  multi: { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' },
  chance: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  percent: { color: colours.text, fontFamily: fonts.semibold, fontSize: 17, minWidth: 56, textAlign: 'center' },
});
