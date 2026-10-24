// Patrol settings and mission builder for a saved game (Hosting → Games).
// Missions are built on one of your fields and use its numbered points.
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { pointName, type FieldPoint, type SavedField } from '../lib/field';
import {
  ENDING_LABEL,
  generateMissions,
  MISSION_MINUTES,
  newMission,
  ORDER_HELP,
  ORDER_LABEL,
  REWARDS,
  routeText,
  pointTitle,
  type PatrolEnding,
  type PatrolMission,
  type PatrolOrder,
  type PatrolSettings,
} from '../lib/patrol';
import { supabase } from '../lib/supabase';
import { colours, fonts, space } from '../theme';
import { Body, Button, Chip, ConfirmButton, ErrorText, Field, ListAdd, ListRow, Row, type useOpenRow } from './ui';

type FieldRow = Pick<SavedField, 'id' | 'name' | 'data'>;

export const PATROL_DEFAULTS: Omit<PatrolSettings, 'field'> = {
  order: 'list',
  ending: 'time',
  scoring: true,
  hidden: [],
  missions: [],
};

const TEAM_NAMES = ['Blue', 'Red', 'Yellow', 'Purple'];

/** The Patrol rows of a game's settings list; renders inside the caller's List. */
export function PatrolRows({
  value,
  onChange,
  teamCount,
  rows,
}: {
  value: Partial<PatrolSettings> | undefined;
  onChange: (p: Partial<PatrolSettings>) => void;
  teamCount: number;
  rows: ReturnType<typeof useOpenRow<string>>;
}) {
  const { session } = useAuth();
  const [fields, setFields] = useState<FieldRow[] | null>(null);
  const [error, setError] = useState('');
  const p = { ...PATROL_DEFAULTS, ...value };
  const field = fields?.find((f) => f.id === p.field);
  const points = [...(field?.data.points ?? [])].filter((x) => x.id).sort((a, b) => (a.num ?? 0) - (b.num ?? 0));
  const set = (patch: Partial<PatrolSettings>) => onChange({ ...p, ...patch });

  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('fields')
      .select('id, name, data')
      .eq('owner_id', session!.user.id)
      .eq('archived', false)
      .order('name');
    if (e) setError(e.message);
    setFields((data ?? []) as FieldRow[]);
  }, [session]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Fields saved before points had numbers get them the first time they're used.
  useEffect(() => {
    if (!field || !field.data.points.length || field.data.points.every((x) => x.id)) return;
    api
      .pointTags(field.id)
      .then(load)
      .catch((e) => setError(friendlyError(e)));
  }, [field, load]);

  const setMission = (id: string, patch: Partial<PatrolMission>) =>
    set({ missions: p.missions.map((m) => (m.id === id ? { ...m, ...patch } : m)) });

  const addMission = () => {
    const m = newMission(p.missions.length + 1);
    set({ missions: [...p.missions, m] });
    rows.setOpen(`m:${m.id}`);
  };

  const generate = () => {
    const made = generateMissions(points, 5, p.missions.length + 1).map((m) =>
      p.order === 'search' ? { ...m, start: points.find((x) => !m.steps.includes(x.id!))?.id ?? null } : m,
    );
    set({ missions: [...p.missions, ...made] });
  };

  return (
    <>
      <ListRow
        title="Field"
        detail={field ? `${points.length} numbered points` : 'Missions use this field’s points'}
        value={field?.name ?? 'Pick one'}
        valueColour={field ? undefined : colours.danger}
        open={rows.isOpen('field')}
        onPress={() => rows.toggle('field')}
      >
        {fields && fields.length === 0 && <Body muted>Make a field with points in Hosting, Fields first.</Body>}
        <Row style={styles.wrap}>
          {fields?.map((f) => (
            <Chip
              key={f.id}
              label={f.name}
              selected={f.id === p.field}
              onPress={() => set({ field: f.id, hidden: [], missions: f.id === p.field ? p.missions : [] })}
            />
          ))}
        </Row>
        {!!p.field && p.missions.length > 0 && (
          <Text style={styles.help}>Picking another field clears the missions, since they use this field’s points.</Text>
        )}
        <ErrorText>{error}</ErrorText>
      </ListRow>

      <ListRow
        title="Mission order"
        detail={ORDER_HELP[p.order]}
        value={ORDER_LABEL[p.order]}
        open={rows.isOpen('order')}
        onPress={() => rows.toggle('order')}
      >
        <Row style={styles.wrap}>
          {(Object.keys(ORDER_LABEL) as PatrolOrder[]).map((o) => (
            <Chip key={o} label={ORDER_LABEL[o]} selected={p.order === o} onPress={() => set({ order: o })} />
          ))}
        </Row>
      </ListRow>

      <ListRow
        title="Game ends"
        value={ENDING_LABEL[p.ending]}
        open={rows.isOpen('ending')}
        onPress={() => rows.toggle('ending')}
      >
        <Row style={styles.wrap}>
          {(Object.keys(ENDING_LABEL) as PatrolEnding[]).map((e) => (
            <Chip key={e} label={ENDING_LABEL[e]} selected={p.ending === e} onPress={() => set({ ending: e })} />
          ))}
        </Row>
        <Text style={styles.help}>The time limit and the End button always work too.</Text>
      </ListRow>

      <ListRow
        title="Scoring"
        detail="Missions pay their points. Highest score wins."
        right={
          <Switch
            value={p.scoring}
            onValueChange={(scoring) => set({ scoring })}
            trackColor={{ true: colours.actionFill, false: colours.border }}
            thumbColor={p.scoring ? colours.accent : colours.textSecondary}
          />
        }
      />

      {field && (
        <ListRow
          title="Points on players’ maps"
          detail="Hidden points are found from grid references and clues"
          value={`${points.filter((x) => !p.hidden.includes(x.id!)).length} of ${points.length}`}
          big
          open={rows.isOpen('shown')}
          onPress={() => rows.toggle('shown')}
        >
          <Row style={styles.wrap}>
            {points.map((x) => (
              <Chip
                key={x.id}
                label={pointName(x)}
                selected={!p.hidden.includes(x.id!)}
                onPress={() =>
                  set({ hidden: p.hidden.includes(x.id!) ? p.hidden.filter((h) => h !== x.id) : [...p.hidden, x.id!] })
                }
              />
            ))}
          </Row>
          <Text style={styles.help}>Highlighted points show on the map. Tap to hide or show.</Text>
        </ListRow>
      )}

      {field &&
        p.missions.map((m) => (
          <MissionRow
            key={m.id}
            mission={m}
            points={points}
            order={p.order}
            teamCount={teamCount}
            data={field.data}
            open={rows.isOpen(`m:${m.id}`)}
            onPress={() => rows.toggle(`m:${m.id}`)}
            onChange={(patch) => setMission(m.id, patch)}
            onDelete={() => set({ missions: p.missions.filter((x) => x.id !== m.id) })}
          />
        ))}
      {field && <ListAdd title="Add a mission" onPress={addMission} />}
      {field && points.length > 0 && (
        <View style={styles.generate}>
          <Button title="Add 5 random missions" variant="quiet" onPress={generate} />
        </View>
      )}
    </>
  );
}

function MissionRow({
  mission: m,
  points,
  order,
  teamCount,
  data,
  open,
  onPress,
  onChange,
  onDelete,
}: {
  mission: PatrolMission;
  points: FieldPoint[];
  order: PatrolOrder;
  teamCount: number;
  data: SavedField['data'];
  open: boolean;
  onPress: () => void;
  onChange: (patch: Partial<PatrolMission>) => void;
  onDelete: () => void;
}) {
  const detail = [
    routeText(data, m),
    m.start ? `starts at ${pointTitle(data, m.start)}` : order === 'search' ? 'needs a start point' : null,
    m.minutes ? `${m.minutes} min` : null,
    m.teams.length ? m.teams.map((n) => TEAM_NAMES[n - 1]).join(', ') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const toggleStep = (id: string) =>
    onChange({ steps: m.steps.includes(id) ? m.steps.filter((s) => s !== id) : [...m.steps, id].slice(0, 4) });

  return (
    <ListRow
      title={m.name || 'Mission'}
      detail={detail}
      value={`${m.reward} pts`}
      big
      valueColour={m.steps.length === 0 || (order === 'search' && !m.start) ? colours.danger : undefined}
      open={open}
      onPress={onPress}
    >
      <Field value={m.name} onChangeText={(name) => onChange({ name })} placeholder="Mission name" maxLength={40} />
      <Field
        value={m.brief}
        onChangeText={(brief) => onChange({ brief })}
        placeholder="Briefing, e.g. Check the north bunkers"
        maxLength={200}
        multiline
      />

      <Text style={styles.sub}>Points to scan (up to 4){m.in_order ? ', in this order' : ''}</Text>
      <Row style={styles.wrap}>
        {points.map((x) => {
          const i = m.steps.indexOf(x.id!);
          return (
            <Chip
              key={x.id}
              label={i >= 0 && m.in_order ? `${i + 1}. ${pointName(x)}` : pointName(x)}
              selected={i >= 0}
              onPress={() => toggleStep(x.id!)}
            />
          );
        })}
      </Row>
      <View style={styles.between}>
        <Text style={styles.label}>In order</Text>
        <Switch
          value={m.in_order}
          onValueChange={(in_order) => onChange({ in_order })}
          trackColor={{ true: colours.actionFill, false: colours.border }}
          thumbColor={m.in_order ? colours.accent : colours.textSecondary}
        />
      </View>

      <Text style={styles.sub}>Locked to a point{order === 'search' ? ' (needed for Scan to get)' : ''}</Text>
      <Row style={styles.wrap}>
        <Chip label="None" selected={!m.start} onPress={() => onChange({ start: null })} />
        {points.map((x) => (
          <Chip key={x.id} label={pointName(x)} selected={m.start === x.id} onPress={() => onChange({ start: x.id! })} />
        ))}
      </Row>
      <Text style={styles.help}>A locked mission is handed out when a team scans that point.</Text>

      <Text style={styles.sub}>Time limit</Text>
      <Row style={styles.wrap}>
        {MISSION_MINUTES.map((n) => (
          <Chip key={n ?? 'none'} label={n ? `${n} min` : 'None'} selected={m.minutes === n} onPress={() => onChange({ minutes: n })} />
        ))}
      </Row>

      <Text style={styles.sub}>Reward</Text>
      <Row style={styles.wrap}>
        {REWARDS.map((n) => (
          <Chip key={n} label={`${n} pts`} selected={m.reward === n} onPress={() => onChange({ reward: n })} />
        ))}
      </Row>

      <Text style={styles.sub}>Teams</Text>
      <Row style={styles.wrap}>
        <Chip label="Every team" selected={m.teams.length === 0} onPress={() => onChange({ teams: [] })} />
        {TEAM_NAMES.slice(0, teamCount).map((name, i) => (
          <Chip
            key={name}
            label={`Team ${i + 1} (${name})`}
            selected={m.teams.includes(i + 1)}
            onPress={() =>
              onChange({ teams: m.teams.includes(i + 1) ? m.teams.filter((n) => n !== i + 1) : [...m.teams, i + 1].sort() })
            }
          />
        ))}
      </Row>

      <View style={styles.between}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Show grid references</Text>
          <Text style={styles.help}>The card gives each point’s 4-figure reference</Text>
        </View>
        <Switch
          value={m.grid}
          onValueChange={(grid) => onChange({ grid })}
          trackColor={{ true: colours.actionFill, false: colours.border }}
          thumbColor={m.grid ? colours.accent : colours.textSecondary}
        />
      </View>
      <Field value={m.clue} onChangeText={(clue) => onChange({ clue })} placeholder="Clue (optional), e.g. By the water tank" maxLength={200} />

      <ConfirmButton title="Delete mission" confirmTitle="Tap again to delete" onConfirm={onDelete} />
    </ListRow>
  );
}

const styles = StyleSheet.create({
  wrap: { flexWrap: 'wrap', gap: space.sm },
  help: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
  sub: { color: colours.text, fontFamily: fonts.medium, fontSize: 14, marginTop: space.xs },
  label: { color: colours.text, fontFamily: fonts.medium, fontSize: 15 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  generate: { paddingHorizontal: space.md, paddingBottom: space.sm },
});
