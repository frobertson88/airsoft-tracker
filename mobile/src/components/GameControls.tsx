// Host tab game controls: set up a game, then run it through countdown, live,
// pause and end (plans/current.md, Stage 3).
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { api, type GameConfig, type TeamFill } from '../lib/api';
import { useCommand, useDay } from '../lib/day';
import {
  clockFor,
  describeSettings,
  formatLength,
  KOTH_DEFAULTS,
  MODE_LABEL,
  useServerNow,
  type Game,
  type GameMode,
  type KothSettings,
} from '../lib/game';
import { BLEED_CHOICES, helperText, isRandom, rulesSummary, settingsFor, useMedicRulesets, type MedicSettings } from '../lib/medic';
import { supabase } from '../lib/supabase';
import { colours, fonts, space } from '../theme';
import { GameClock } from './GameClock';
import { Body, Button, Chip, ConfirmButton, ErrorText, Field, Label, List, ListRow, Row, useOpenRow } from './ui';

const LENGTHS: { label: string; seconds: number | null }[] = [
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
  { label: '20 min', seconds: 1200 },
  { label: '30 min', seconds: 1800 },
  { label: '45 min', seconds: 2700 },
  { label: '60 min', seconds: 3600 },
  { label: 'Unlimited', seconds: null },
];
const COUNTDOWNS = [
  { label: 'Off', seconds: 0 },
  { label: '10s', seconds: 10 },
  { label: '30s', seconds: 30 },
  { label: '1 min', seconds: 60 },
  { label: '2 min', seconds: 120 },
  { label: '5 min', seconds: 300 },
];

const HILL_SIZES = [15, 25, 40, 60];
const MOVES: { label: string; minutes: number | null }[] = [
  { label: 'Fixed', minutes: null },
  { label: 'Every 5 min', minutes: 5 },
  { label: 'Every 10 min', minutes: 10 },
  { label: 'Every 15 min', minutes: 15 },
];

const FILLS: { fill: TeamFill; label: string; help: string }[] = [
  { fill: 'keep', label: 'Keep teams', help: 'Players stay on their teams. Anyone on a team that’s no longer used picks again.' },
  { fill: 'shuffle', label: 'Shuffle', help: 'Everyone playing is put on random, even teams. Sections reset.' },
  { fill: 'clear', label: 'Everyone picks', help: 'Everyone chooses a team again before the game.' },
];

const DEFAULT_CONFIG: GameConfig = {
  name: 'Skirmish',
  length_seconds: 1200,
  countdown_seconds: 30,
  mode: 'free',
  settings: {},
};

const configOf = (g: Pick<Game, 'name' | 'length_seconds' | 'countdown_seconds' | 'mode' | 'settings'>): GameConfig => ({
  name: g.name,
  length_seconds: g.length_seconds,
  countdown_seconds: g.countdown_seconds,
  mode: g.mode,
  // Saved games and setups leave medic out when it was off.
  settings: { medic: null, ...g.settings },
});

interface SavedSetup extends GameConfig {
  id: string;
}

function useSavedSetups() {
  const [setups, setSetups] = useState<SavedSetup[]>([]);
  const load = useCallback(() => {
    supabase
      .from('game_setups')
      .select('id, name, mode, length_seconds, countdown_seconds, settings')
      .order('name')
      .then(({ data }) => setSetups((data ?? []) as SavedSetup[]));
  }, []);
  useEffect(load, [load]);
  return { setups, reload: load };
}

function GameSetup({ game, onDone }: { game: Game | null; onDone?: () => void }) {
  const { id, data } = useDay();
  const { run, busy, error, setError } = useCommand();
  const saved = useSavedSetups();
  const medicSets = useMedicRulesets();
  const currentTeams = data?.day.team_count ?? 2;
  const editing = game?.state === 'ready';
  const [c, setC] = useState<GameConfig>(() =>
    game ? configOf(game) : { ...DEFAULT_CONFIG },
  );
  const [teamCount, setTeamCount] = useState<number>(game?.settings.team_count ?? currentTeams);
  // One setting open at a time (docs/design-direction.md, List rows).
  const rows = useOpenRow<string>();
  // Changing the number of teams shuffles by default (Fraser, 12 October 2026).
  const [fill, setFill] = useState<TeamFill | null>(null);
  const fillChoice: TeamFill = fill ?? (teamCount === currentTeams ? 'keep' : 'shuffle');
  const [setupId, setSetupId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const koth = { ...KOTH_DEFAULTS, ...c.settings };
  const set = (patch: Partial<GameConfig>) => {
    setNote('');
    setC((prev) => ({ ...prev, ...patch }));
  };
  const setKoth = (patch: Partial<KothSettings>) => set({ settings: { ...koth, ...patch } });
  // Medic rules: undefined means not chosen yet, so a new game uses your default set.
  const medic: MedicSettings | null =
    c.settings.medic === undefined
      ? medicSets.preferred
        ? settingsFor(medicSets.preferred)
        : null
      : c.settings.medic;
  const setMedic = (m: MedicSettings | null) => set({ settings: { ...c.settings, medic: m } });
  // A game whose rules no longer match a saved set (renamed or deleted) keeps its own chip.
  const medicMissing = !!medic && !medicSets.sets?.some((x) => x.name === medic.name);
  const withMedic = (settings: Partial<KothSettings>) => ({ ...settings, team_count: teamCount, medic });

  const save = async () => {
    if (!c.name.trim()) return setError('Give the game a name.');
    const config = { ...c, name: c.name.trim(), settings: withMedic(c.settings) };
    const ok = await run(async () => {
      if (teamCount !== currentTeams || fillChoice !== 'keep') await api.arrangeTeams(id, teamCount, fillChoice);
      await (editing ? api.updateGame(game.id, config) : api.createGame(id, config));
    });
    if (ok) onDone?.();
  };

  const saveSetup = async () => {
    if (!c.name.trim()) return setError('Give the game a name.');
    // Saving under the name of a setup you picked updates it; a new name makes a new one.
    const same = saved.setups.find((x) => x.id === setupId && x.name === c.name.trim());
    let newId: string | null = null;
    const ok = await run(async () => {
      newId = await api.saveGameSetup(same ? same.id : null, {
        ...c,
        name: c.name.trim(),
        settings: withMedic(c.settings),
      });
    });
    if (ok) {
      setSetupId(newId);
      setNote(same ? 'Setup updated.' : 'Saved to your setups.');
      saved.reload();
    }
  };

  const deleteSetup = async (sid: string) => {
    if (await run(() => api.deleteGameSetup(sid))) {
      setSetupId(null);
      setNote('Setup deleted.');
      saved.reload();
    }
  };

  return (
    <View style={{ gap: space.md }}>
      <Field value={c.name} onChangeText={(name) => set({ name })} placeholder="Game name" maxLength={40} />

      <List>
        {saved.setups.length > 0 && (
          <ListRow
            title="Your setups"
            value={saved.setups.find((x) => x.id === setupId)?.name ?? 'None'}
            open={rows.isOpen('setups')}
            onPress={() => rows.toggle('setups')}
          >
            <Row style={styles.wrap}>
              {saved.setups.map((x) => (
                <Chip
                  key={x.id}
                  label={x.name}
                  selected={setupId === x.id}
                  onPress={() => {
                    setSetupId(x.id);
                    set(configOf(x));
                    setTeamCount(x.settings.team_count ?? 2);
                    setFill(null);
                  }}
                />
              ))}
            </Row>
          </ListRow>
        )}

        <ListRow
          title="Game type"
          value={MODE_LABEL[c.mode]}
          open={rows.isOpen('mode')}
          onPress={() => rows.toggle('mode')}
        >
          <Row style={styles.wrap}>
            {(['free', 'koth'] as GameMode[]).map((m) => (
              <Chip
                key={m}
                label={MODE_LABEL[m]}
                selected={c.mode === m}
                onPress={() =>
                  set({ mode: m, settings: { ...(m === 'koth' ? KOTH_DEFAULTS : {}), medic: c.settings.medic } })
                }
              />
            ))}
          </Row>
          {c.mode === 'koth' && (
            <Text style={styles.help}>
              A hill appears at a random spot on the field. The team with the most players inside holds it and scores
              points. Equal numbers mean contested and nobody scores.
            </Text>
          )}
        </ListRow>

        <ListRow
          title="Teams"
          value={`${teamCount} teams`}
          open={rows.isOpen('teams')}
          onPress={() => rows.toggle('teams')}
        >
          <Row style={styles.wrap}>
            {[2, 3, 4].map((n) => (
              <Chip
                key={n}
                label={`${n} teams`}
                selected={teamCount === n}
                onPress={() => {
                  setTeamCount(n);
                  setFill(null);
                }}
              />
            ))}
          </Row>
        </ListRow>

        <ListRow
          title="Players on teams"
          value={FILLS.find((f) => f.fill === fillChoice)?.label}
          open={rows.isOpen('fill')}
          onPress={() => rows.toggle('fill')}
        >
          <Row style={styles.wrap}>
            {FILLS.map((f) => (
              <Chip key={f.fill} label={f.label} selected={fillChoice === f.fill} onPress={() => setFill(f.fill)} />
            ))}
          </Row>
          <Text style={styles.help}>{FILLS.find((f) => f.fill === fillChoice)?.help}</Text>
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

        {c.mode === 'koth' && (
          <>
            <ListRow
              title="Hill size"
              detail="Radius"
              value={`${koth.radius} m`}
              open={rows.isOpen('hill')}
              onPress={() => rows.toggle('hill')}
            >
              <Row style={styles.wrap}>
                {HILL_SIZES.map((r) => (
                  <Chip key={r} label={`${r} m`} selected={koth.radius === r} onPress={() => setKoth({ radius: r })} />
                ))}
              </Row>
            </ListRow>
            <ListRow
              title="Hill moves"
              value={MOVES.find((m) => m.minutes === koth.relocate_minutes)?.label}
              open={rows.isOpen('moves')}
              onPress={() => rows.toggle('moves')}
            >
              <Row style={styles.wrap}>
                {MOVES.map((m) => (
                  <Chip
                    key={m.label}
                    label={m.label}
                    selected={koth.relocate_minutes === m.minutes}
                    onPress={() => setKoth({ relocate_minutes: m.minutes })}
                  />
                ))}
              </Row>
            </ListRow>
            <ListRow
              title="Scoring"
              detail="1 point per second for the team holding the hill. Highest score wins."
              right={
                <Switch
                  value={koth.scoring}
                  onValueChange={(scoring) => setKoth({ scoring })}
                  trackColor={{ true: colours.actionFill, false: colours.border }}
                  thumbColor={koth.scoring ? colours.accent : colours.textSecondary}
                />
              }
            />
          </>
        )}

        <ListRow
          title="Medic rules"
          detail={
            medic
              ? isRandom(medic)
                ? rulesSummary(medic)
                : medic.hits.map((h) => `${h.name}: ${helperText(h.helpers).toLowerCase()}`).join(' · ')
              : 'No I’m hit button or scanning this game'
          }
          value={medic?.name ?? 'Off'}
          open={rows.isOpen('medic')}
          onPress={() => rows.toggle('medic')}
        >
          <Row style={styles.wrap}>
            <Chip label="Off" selected={!medic} onPress={() => setMedic(null)} />
            {medicMissing && <Chip label={medic.name} selected />}
            {medicSets.sets?.map((x) => (
              <Chip
                key={x.id}
                label={x.name}
                selected={!!medic && medic.name === x.name}
                onPress={() => setMedic(settingsFor(x, medic?.bleed_minutes ?? 10))}
              />
            ))}
          </Row>
          <Text style={styles.help}>Change the sets in Hosting, Medic rules.</Text>
        </ListRow>

        {medic && (
          <ListRow
            title="Bleed-out"
            detail={
              medic.expiry === 'dead'
                ? 'An untreated wound becomes dead when it runs out'
                : 'An untreated player waits for help when it runs out'
            }
            value={`${medic.bleed_minutes} min`}
            open={rows.isOpen('bleed')}
            onPress={() => rows.toggle('bleed')}
          >
            <Row style={styles.wrap}>
              {BLEED_CHOICES.map((m) => (
                <Chip
                  key={m}
                  label={`${m} min`}
                  selected={medic.bleed_minutes === m}
                  onPress={() => setMedic({ ...medic, bleed_minutes: m })}
                />
              ))}
            </Row>
          </ListRow>
        )}
      </List>

      <Button title={editing ? 'Save settings' : 'Set up game'} busy={busy} onPress={save} />
      <Button title="Save to your setups" variant="quiet" busy={busy} onPress={saveSetup} />
      {setupId && (
        <ConfirmButton title="Delete this saved setup" confirmTitle="Tap again to delete" busy={busy} onConfirm={() => deleteSetup(setupId)} />
      )}
      {editing && <Button title="Cancel" variant="quiet" onPress={() => onDone?.()} />}
      {!!note && <Body muted>{note}</Body>}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

export function GameControls() {
  const { data } = useDay();
  const { run, busy, error } = useCommand();
  const [editing, setEditing] = useState(false);
  const [newGame, setNewGame] = useState(false);
  const now = useServerNow(500);
  if (!data) return null;

  const game = data.game;
  const state = game ? clockFor(game, now).state : null;

  if (!game || (state === 'complete' && newGame)) {
    return (
      <>
        <Label>Next game</Label>
        <GameSetup key={game?.id ?? 'new'} game={null} onDone={() => setNewGame(false)} />
        {game && <Button title="Back" variant="quiet" onPress={() => setNewGame(false)} />}
      </>
    );
  }

  if (state === 'ready' && editing) {
    return (
      <>
        <Label>Game settings</Label>
        <GameSetup key={game.id} game={game} onDone={() => setEditing(false)} />
      </>
    );
  }

  const g = game.id;
  const timed = game.length_seconds !== null;
  // Admins without a team may be hosting, so only players are counted.
  const noTeam = data.members.filter((m) => m.status === 'active' && !m.team_id && !m.is_admin).length;
  const running = state === 'countdown' || state === 'live' || state === 'paused' || state === 'resuming';
  return (
    <>
      <Label>{state === 'complete' ? 'Last game' : 'Game'}</Label>
      <GameClock game={game} />
      <View style={styles.actions}>
        {state === 'ready' && (
          <>
            {noTeam > 0 && (
              <Body muted>
                {noTeam} {noTeam === 1 ? 'player has' : 'players have'} no team yet and will sit this game out unless
                they pick one.
              </Body>
            )}
            {data.field ? (
              <Button
                title={game.countdown_seconds ? 'Start countdown' : 'Start game'}
                busy={busy}
                onPress={() => run(() => api.startGame(g))}
              />
            ) : (
              <Body muted>Pick a field for the day before starting.</Body>
            )}
            {data.field && game.countdown_seconds > 0 && (
              <Button title="Start now, no countdown" variant="secondary" busy={busy} onPress={() => run(() => api.startGame(g).then(() => api.forceStart(g)))} />
            )}
            <Button title="Change settings" variant="quiet" onPress={() => setEditing(true)} />
          </>
        )}
        {state === 'countdown' && (
          <>
            <Button title="Force start" busy={busy} onPress={() => run(() => api.forceStart(g))} />
            <Button title="Cancel countdown" variant="secondary" busy={busy} onPress={() => run(() => api.cancelCountdown(g))} />
          </>
        )}
        {state === 'resuming' && (
          <Button title="Cancel resume" variant="secondary" busy={busy} onPress={() => run(() => api.cancelCountdown(g))} />
        )}
        {running && game.mode === 'koth' && (
          <>
            <Button title="Move hill now" variant="secondary" busy={busy} onPress={() => run(() => api.moveHill(g))} />
            <Text style={styles.help}>Or press and hold on the Map to pick the spot.</Text>
          </>
        )}
        {(state === 'live' || state === 'paused') && (
          <View style={styles.pair}>
            <View style={{ flex: 1 }}>
              {state === 'live' ? (
                <Button title="Pause" busy={busy} onPress={() => run(() => api.pauseGame(g))} />
              ) : (
                <Button title="Resume" busy={busy} onPress={() => run(() => api.resumeGame(g))} />
              )}
            </View>
            {timed && (
              <View style={{ flex: 1 }}>
                <Button title="+5 min" variant="secondary" busy={busy} onPress={() => run(() => api.addTime(g, 300))} />
              </View>
            )}
          </View>
        )}
        {(state === 'live' || state === 'paused' || state === 'resuming') && (
          <>
            <ConfirmButton
              title="End game"
              confirmTitle="Tap again to end the game"
              busy={busy}
              onConfirm={() => run(() => api.endGame(g))}
            />
          </>
        )}
        {state === 'complete' && (
          <>
            <Body muted>{describeSettings(game.mode, game.settings)}</Body>
            <Button title={`Play again · ${formatLength(game)}`} busy={busy} onPress={() => run(() => api.playAgain(g))} />
            <Button title="Set up a new game" variant="secondary" onPress={() => setNewGame(true)} />
          </>
        )}
      </View>
      <ErrorText>{error}</ErrorText>
    </>
  );
}

const styles = StyleSheet.create({
  small: { color: colours.textSecondary, fontFamily: fonts.medium, fontSize: 14 },
  wrap: { flexWrap: 'wrap', gap: space.sm },
  actions: { gap: space.sm },
  help: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
  label: { color: colours.text, fontFamily: fonts.medium, fontSize: 16 },
  pair: { flexDirection: 'row', gap: space.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
});
