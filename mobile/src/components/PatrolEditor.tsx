// Patrol settings and mission builder for a saved game (Hosting → Games).
// Missions are built on one of your fields and use its numbered points. The
// game's settings list has one Missions row; that opens the mission list, and
// each mission opens on its own screen of rows, like the medic rules editor.
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { pointName, type FieldPoint, type SavedField } from '../lib/field';
import {
  DONE_HELP,
  DONE_LABEL,
  ENDING_LABEL,
  generateMissions,
  HOLD_MINUTES,
  MISSION_MINUTES,
  MISSION_TYPES,
  missionOf,
  missionProblem,
  newMission,
  newMissionId,
  ORDER_HELP,
  ORDER_LABEL,
  pointTitle,
  REWARDS,
  routeText,
  typeLabel,
  type MissionDone,
  type PatrolEnding,
  type PatrolMission,
  type PatrolOrder,
  type PatrolSettings,
} from '../lib/patrol';
import { supabase } from '../lib/supabase';
import { colours, fonts, space } from '../theme';
import { Body, Button, Chip, ConfirmButton, ErrorText, Field, Label, List, ListAdd, ListRow, Row, useOpenRow } from './ui';

type FieldRow = Pick<SavedField, 'id' | 'name' | 'data'>;

export const PATROL_DEFAULTS: Omit<PatrolSettings, 'field'> = {
  order: 'list',
  ending: 'time',
  scoring: true,
  hidden: [],
  missions: [],
};

const TEAM_NAMES = ['Blue', 'Red', 'Yellow', 'Purple'];

/** Your fields, and the picked one's numbered points. */
export function usePatrolField(fieldId: string | undefined) {
  const { session } = useAuth();
  const [fields, setFields] = useState<FieldRow[] | null>(null);
  const [error, setError] = useState('');
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
  const field = fields?.find((f) => f.id === fieldId);
  // Fields saved before points had numbers get them the first time they're used.
  useEffect(() => {
    if (!field || !field.data.points.length || field.data.points.every((x) => x.id)) return;
    api
      .pointTags(field.id)
      .then(load)
      .catch((e) => setError(friendlyError(e)));
  }, [field, load]);
  const points = [...(field?.data.points ?? [])].filter((x) => x.id).sort((a, b) => (a.num ?? 0) - (b.num ?? 0));
  return { fields, field, points, error };
}

/** The Patrol rows of a game's settings list; renders inside the caller's List. */
export function PatrolRows({
  value,
  onChange,
  rows,
  onOpenMissions,
}: {
  value: Partial<PatrolSettings> | undefined;
  onChange: (p: Partial<PatrolSettings>) => void;
  rows: ReturnType<typeof useOpenRow<string>>;
  onOpenMissions: () => void;
}) {
  const p = { ...PATROL_DEFAULTS, ...value };
  const { fields, field, points, error } = usePatrolField(p.field);
  const set = (patch: Partial<PatrolSettings>) => onChange({ ...p, ...patch });
  const problems = p.missions.filter((m) => missionProblem(m, p.order)).length;

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
        title="Missions"
        detail={
          !field
            ? 'Pick a field first'
            : problems
              ? `${problems} ${problems === 1 ? 'needs' : 'need'} finishing`
              : p.missions.length
                ? p.missions.map((m) => m.name).slice(0, 3).join(', ') + (p.missions.length > 3 ? '…' : '')
                : 'Add the missions teams play'
        }
        value={String(p.missions.length)}
        big
        valueColour={!p.missions.length || problems ? colours.danger : undefined}
        onPress={field ? onOpenMissions : () => rows.toggle('field')}
      />

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
        right={<Toggle value={p.scoring} onChange={(scoring) => set({ scoring })} />}
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
    </>
  );
}

/** The mission list: one row per mission, tap to open it on its own screen. */
export function MissionList({
  value,
  onChange,
  onOpen,
}: {
  value: Partial<PatrolSettings> | undefined;
  onChange: (p: Partial<PatrolSettings>) => void;
  onOpen: (id: string) => void;
}) {
  const p = { ...PATROL_DEFAULTS, ...value };
  const { field, points } = usePatrolField(p.field);
  const add = () => {
    const m = newMission(p.missions.length + 1);
    onChange({ ...p, missions: [...p.missions, m] });
    onOpen(m.id);
  };
  const generate = () => {
    const made = generateMissions(points, 5, p.missions.length + 1).map((m) =>
      p.order === 'search' ? { ...m, start: points.find((x) => !m.steps.includes(x.id!))?.id ?? null } : m,
    );
    onChange({ ...p, missions: [...p.missions, ...made] });
  };

  return (
    <>
      <Text style={styles.help}>
        {p.order === 'search'
          ? 'Scan to get: teams find each mission by scanning its start point.'
          : `${ORDER_LABEL[p.order]}: ${ORDER_HELP[p.order]}`}
      </Text>
      <List>
        {p.missions.map((raw, i) => {
          const m = missionOf(raw);
          const problem = missionProblem(m, p.order);
          return (
            <ListRow
              key={m.id}
              left={<Text style={[styles.num, m.start ? styles.numLocked : null]}>{m.start ? 'L' : i + 1}</Text>}
              title={m.name || 'Mission'}
              detail={
                problem ??
                [
                  typeLabel(m.type),
                  routeText(field?.data, m),
                  m.start ? `starts at ${pointTitle(field?.data, m.start)}` : null,
                  m.minutes ? `${m.minutes} min` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              }
              value={String(m.reward)}
              big
              valueColour={problem ? colours.danger : undefined}
              onPress={() => onOpen(m.id)}
            />
          );
        })}
        <ListAdd title="Add a mission" onPress={add} />
      </List>
      <Text style={styles.help}>Points on the right. L is a mission locked to a point: scanning it hands the mission out.</Text>
      {points.length > 0 && <Button title="Add 5 random missions" variant="quiet" onPress={generate} />}
    </>
  );
}

/** One mission on its own screen: short groups of rows (the mission, where,
 * how it ends, score), every row closed until tapped, and Previous / Next. */
export function MissionEditor({
  value,
  onChange,
  missionId,
  teamCount,
  onOpen,
  onClose,
}: {
  value: Partial<PatrolSettings> | undefined;
  onChange: (p: Partial<PatrolSettings>) => void;
  missionId: string;
  teamCount: number;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const p = { ...PATROL_DEFAULTS, ...value };
  const { field, points } = usePatrolField(p.field);
  const rows = useOpenRow<string>();
  const index = p.missions.findIndex((x) => x.id === missionId);
  if (index < 0) return <Body muted>That mission was removed.</Body>;
  const m = missionOf(p.missions[index]);
  const data = field?.data;
  const edit = (patch: Partial<PatrolMission>) =>
    onChange({ ...p, missions: p.missions.map((x) => (x.id === m.id ? { ...m, ...patch } : x)) });
  const move = (to: number) => {
    const list = [...p.missions];
    const [it] = list.splice(index, 1);
    list.splice(to, 0, it);
    onChange({ ...p, missions: list });
  };
  const toggleStep = (id: string) =>
    edit({ steps: m.steps.includes(id) ? m.steps.filter((s) => s !== id) : [...m.steps, id].slice(0, 4) });
  const reports = m.done === 'leader' || m.done === 'host';
  const problem = missionProblem(m, p.order);
  const pick = MISSION_TYPES.find((t) => t.type === m.type) ?? MISSION_TYPES[MISSION_TYPES.length - 1];

  return (
    <>
      <Label>
        Mission {index + 1} of {p.missions.length}
      </Label>
      <List>
        <ListRow
          title={m.name || 'Name this mission'}
          detail={m.brief || 'Add a briefing for the team'}
          valueColour={!m.name.trim() ? colours.danger : undefined}
          open={rows.isOpen('name')}
          onPress={() => rows.toggle('name')}
        >
          <Field value={m.name} onChangeText={(name) => edit({ name })} placeholder="Mission name" maxLength={40} />
          <Field
            value={m.brief}
            onChangeText={(brief) => edit({ brief })}
            placeholder="Briefing, e.g. Grab the laptop from the shed and get it to HQ"
            maxLength={200}
            multiline
          />
        </ListRow>
        <ListRow title="Type" value={pick.label} open={rows.isOpen('type')} onPress={() => rows.toggle('type')}>
          <Row style={styles.wrap}>
            {MISSION_TYPES.map((t) => (
              <Chip
                key={t.type}
                label={t.label}
                selected={m.type === t.type}
                onPress={() =>
                  edit({
                    type: t.type,
                    ...t.preset,
                    // A courier, hold or find uses one point.
                    ...(t.type === 'courier' || t.type === 'hold' || t.type === 'find' ? { steps: m.steps.slice(0, 1) } : {}),
                    finish: t.preset.done === 'finish' ? (m.finish ?? null) : null,
                  })
                }
              />
            ))}
          </Row>
          <Text style={styles.help}>{pick.help} A type fills in the rules below; you can still change any of them.</Text>
        </ListRow>
        <ListRow
          title="Teams"
          value={m.teams.length ? m.teams.map((n) => TEAM_NAMES[n - 1]).join(', ') : 'Every team'}
          open={rows.isOpen('teams')}
          onPress={() => rows.toggle('teams')}
        >
          <Row style={styles.wrap}>
            <Chip label="Every team" selected={m.teams.length === 0} onPress={() => edit({ teams: [] })} />
            {TEAM_NAMES.slice(0, teamCount).map((name, i) => (
              <Chip
                key={name}
                label={`Team ${i + 1} (${name})`}
                selected={m.teams.includes(i + 1)}
                onPress={() =>
                  edit({ teams: m.teams.includes(i + 1) ? m.teams.filter((n) => n !== i + 1) : [...m.teams, i + 1].sort() })
                }
              />
            ))}
          </Row>
        </ListRow>

      </List>

      <Label>Where</Label>
      <List>
        <ListRow
          title={m.type === 'courier' ? 'Pick-up point' : 'Points to scan'}
          detail={reports && !m.steps.length ? 'None: nothing to scan' : m.in_order ? 'In this order' : 'Any order'}
          value={m.steps.length ? routeSteps(data, m) : 'None'}
          valueColour={!m.steps.length && !reports ? colours.danger : undefined}
          open={rows.isOpen('steps')}
          onPress={() => rows.toggle('steps')}
        >
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
          <Text style={styles.help}>Up to 4 points. Tap in the order teams should go.</Text>
          <View style={styles.between}>
            <Text style={styles.label}>In order</Text>
            <Toggle value={m.in_order} onChange={(in_order) => edit({ in_order })} />
          </View>
        </ListRow>

        <ListRow
          title="Starts"
          value={m.start ? pointTitle(data, m.start) : p.order === 'search' ? 'Pick a point' : 'Next in list'}
          valueColour={p.order === 'search' && !m.start ? colours.danger : undefined}
          open={rows.isOpen('start')}
          onPress={() => rows.toggle('start')}
        >
          <Row style={styles.wrap}>
            {p.order !== 'search' && <Chip label="Next in list" selected={!m.start} onPress={() => edit({ start: null })} />}
            {points.map((x) => (
              <Chip key={x.id} label={pointName(x)} selected={m.start === x.id} onPress={() => edit({ start: x.id! })} />
            ))}
          </Row>
          <Text style={styles.help}>
            A mission locked to a point jumps ahead of the list when a team scans it.
            {p.order === 'search' ? ' Scan to get games need one on every mission.' : ''}
          </Text>
        </ListRow>

      </List>

      <Label>How it ends</Label>
      <List>
        <ListRow
          title="Done when"
          value={m.done === 'finish' ? (m.finish ? `Scan ${pointTitle(data, m.finish)}` : 'Pick a point') : DONE_LABEL[m.done]}
          valueColour={problem === 'Needs a finish point' ? colours.danger : undefined}
          open={rows.isOpen('done')}
          onPress={() => rows.toggle('done')}
        >
          <Row style={styles.wrap}>
            {(Object.keys(DONE_LABEL) as MissionDone[]).map((d) => (
              <Chip
                key={d}
                label={DONE_LABEL[d]}
                selected={m.done === d}
                onPress={() =>
                  edit({
                    done: d,
                    finish: d === 'finish' ? m.finish : null,
                    hold: d === 'leader' || d === 'host' ? m.hold : null,
                  })
                }
              />
            ))}
          </Row>
          <Text style={styles.help}>{DONE_HELP[m.done]}</Text>
          {m.done === 'finish' && (
            <>
              <Text style={styles.sub}>Finish point</Text>
              <Row style={styles.wrap}>
                {points
                  .filter((x) => !m.steps.includes(x.id!))
                  .map((x) => (
                    <Chip key={x.id} label={pointName(x)} selected={m.finish === x.id} onPress={() => edit({ finish: x.id! })} />
                  ))}
              </Row>
            </>
          )}
          {reports && (
            <>
              <Text style={styles.sub}>Hold before reporting</Text>
              <Row style={styles.wrap}>
                <Chip label="None" selected={!m.hold} onPress={() => edit({ hold: null })} />
                {HOLD_MINUTES.map((n) => (
                  <Chip key={n} label={`${n} min`} selected={m.hold === n} onPress={() => edit({ hold: n })} />
                ))}
              </Row>
              <Text style={styles.help}>The Report done button unlocks once the points are scanned and the hold is up.</Text>
            </>
          )}
        </ListRow>

        <ListRow
          title="Fails when"
          detail="Or failed by hand by the lead or host"
          value={m.minutes ? `${m.minutes} min` : 'Only by hand'}
          open={rows.isOpen('fails')}
          onPress={() => rows.toggle('fails')}
        >
          <Text style={styles.sub}>Time limit</Text>
          <Row style={styles.wrap}>
            {MISSION_MINUTES.map((n) => (
              <Chip key={n ?? 'none'} label={n ? `${n} min` : 'None'} selected={m.minutes === n} onPress={() => edit({ minutes: n })} />
            ))}
          </Row>
        </ListRow>

      </List>

      <Label>Score and card</Label>
      <List>
        <ListRow title="Reward" value={String(m.reward)} big open={rows.isOpen('reward')} onPress={() => rows.toggle('reward')}>
          <Row style={styles.wrap}>
            {REWARDS.map((n) => (
              <Chip key={n} label={`${n} pts`} selected={m.reward === n} onPress={() => edit({ reward: n })} />
            ))}
          </Row>
          <Text style={styles.help}>Paid once, when the mission is done. A failed or skipped mission pays nothing.</Text>
        </ListRow>

        <ListRow
          title="Clue and grid refs"
          detail={m.clue || 'Shown on the team’s mission card'}
          value={m.grid ? 'Grid on' : 'Grid off'}
          open={rows.isOpen('clue')}
          onPress={() => rows.toggle('clue')}
        >
          <Field value={m.clue} onChangeText={(clue) => edit({ clue })} placeholder="Clue (optional), e.g. By the water tank" maxLength={200} />
          <View style={styles.between}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Show grid references</Text>
              <Text style={styles.help}>The card gives each point’s grid reference</Text>
            </View>
            <Toggle value={m.grid} onChange={(grid) => edit({ grid })} />
          </View>
        </ListRow>
      </List>
      {!!problem && <Text style={[styles.help, { color: colours.danger }]}>{problem}</Text>}

      <Row>
        <View style={{ flex: 1 }}>
          <Button
            title="‹ Previous"
            variant="secondary"
            disabled={index === 0}
            onPress={() => onOpen(p.missions[index - 1].id)}
          />
        </View>
        <View style={{ flex: 1 }}>
          {index < p.missions.length - 1 ? (
            <Button title="Next ›" variant="secondary" onPress={() => onOpen(p.missions[index + 1].id)} />
          ) : (
            <Button title="All missions" variant="secondary" onPress={onClose} />
          )}
        </View>
      </Row>
      <Row style={styles.wrap}>
        {index > 0 && <Button title="Move up" variant="quiet" onPress={() => move(index - 1)} />}
        {index < p.missions.length - 1 && <Button title="Move down" variant="quiet" onPress={() => move(index + 1)} />}
        <Button
          title="Duplicate"
          variant="quiet"
          onPress={() => {
            const list = [...p.missions];
            const copy = { ...m, id: newMissionId(), name: `${m.name} 2`.slice(0, 40), start: null };
            list.splice(index + 1, 0, copy);
            onChange({ ...p, missions: list });
            onOpen(copy.id);
          }}
        />
        <ConfirmButton
          title="Delete"
          confirmTitle="Tap again to delete"
          onConfirm={() => {
            onChange({ ...p, missions: p.missions.filter((x) => x.id !== m.id) });
            onClose();
          }}
        />
      </Row>
    </>
  );
}

const routeSteps = (data: SavedField['data'] | undefined, m: PatrolMission) => {
  const nums = m.steps.map((s) => String(data?.points.find((x: FieldPoint) => x.id === s)?.num ?? '?'));
  return m.in_order ? nums.join(' → ') : nums.join(', ');
};

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: colours.actionFill, false: colours.border }}
      thumbColor={value ? colours.accent : colours.textSecondary}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { flexWrap: 'wrap', gap: space.sm },
  help: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
  sub: { color: colours.text, fontFamily: fonts.medium, fontSize: 14, marginTop: space.xs },
  label: { color: colours.text, fontFamily: fonts.medium, fontSize: 15 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  num: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: colours.actionFill,
    color: colours.actionText,
    fontFamily: fonts.display,
    fontSize: 16,
    lineHeight: 26,
    textAlign: 'center',
  },
  numLocked: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colours.accent, color: colours.accent },
});
