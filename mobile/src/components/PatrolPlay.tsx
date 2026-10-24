// Patrol during play: team scores on the game card, your team's mission on
// the Game tab, and every team's progress for the host.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api, friendlyError } from '../lib/api';
import { useDay } from '../lib/day';
import { formatClock, type Clock, type Game } from '../lib/game';
import { finished, missionView, patrolOf, patrolWinner, type PatrolTeam } from '../lib/patrol';
import { colours, fonts, radius, space, teamColour } from '../theme';
import { Body, Button, Card, ConfirmButton, Display, ErrorText, List, ListRow, Row, useOpenRow } from './ui';

/** Runs a Patrol action with a busy flag and a friendly error. */
function useAction() {
  const { reload } = useDay();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await fn();
      reload();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
}

const teamsOf = (data: ReturnType<typeof useDay>['data'], game: Game): PatrolTeam[] =>
  data?.patrol.filter((t) => t.game_id === game.id && t.total > 0) ?? [];

/** Scores and the result, under the game clock. */
export function PatrolScores({ game, clock }: { game: Game; clock: Clock }) {
  const { data, teamById } = useDay();
  const s = patrolOf(game);
  const teams = teamsOf(data, game);
  if (!s || !teams.length) return null;
  const done = clock.state === 'complete';
  const win = done ? patrolWinner(teams, s) : null;
  const winner = win?.team ? teamById(win.team) : undefined;
  return (
    <View style={styles.panel}>
      {done && (
        <Text style={[styles.headline, winner ? { color: teamColour(winner.colour) } : null]}>
          {winner ? `${winner.name} wins` : win?.draw ? 'Draw' : 'Finished'}
        </Text>
      )}
      <View style={styles.scores}>
        {teams.map((t) => {
          const team = teamById(t.team_id);
          if (!team) return null;
          return (
            <View key={t.team_id} style={styles.score}>
              <Text style={[styles.scoreValue, { color: teamColour(team.colour) }]}>{s.scoring ? t.score : '–'}</Text>
              <Text style={styles.caption}>
                {team.name} · {Object.keys(t.outcome).length}/{t.total}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Your team's current mission, for the Game tab. Section leads (and admins on
 * the team) can report it done or abort it. */
export function PatrolCard({ game, clock }: { game: Game; clock: Clock }) {
  const { data, me, isAdmin } = useDay();
  const action = useAction();
  const s = patrolOf(game);
  const t = teamsOf(data, game).find((x) => x.team_id === me?.team_id);
  if (!s || !data || clock.state === 'ready') return null;
  if (!t) return <Body muted>Your team isn’t playing this Patrol game.</Body>;

  const raw = t.current ? s.missions.find((x) => x.id === t.current) : undefined;
  if (!raw) {
    return (
      <Card style={styles.card}>
        <Text style={styles.kicker}>Patrol</Text>
        <Display size={28}>{finished(t) ? 'All missions done' : 'No mission yet'}</Display>
        <Body muted>
          {finished(t)
            ? `Your team finished with ${t.score} points.`
            : 'Find a point and scan its code on the Scan tab to get a mission.'}
        </Body>
      </Card>
    );
  }

  const v = missionView(data.field, raw, t, clock.elapsed);
  const m = v.mission;
  const lead =
    isAdmin || data.sections.some((x) => x.team_id === me?.team_id && x.leader_id === me?.user_id);
  const live = clock.state === 'live';
  const reports = m.done === 'leader' || m.done === 'host';
  const status = v.reported
    ? 'Reported. Waiting for the host to confirm.'
    : !v.ready
      ? m.in_order
        ? 'Scan the points in this order.'
        : 'Scan the points in any order.'
      : m.done === 'finish'
        ? 'All points done. Scan the finish point.'
        : v.holdLeft !== null && v.holdLeft > 0
          ? `Hold for ${formatClock(v.holdLeft)}, then report it done.`
          : reports
            ? lead
              ? 'Ready. Report it done when the job is finished.'
              : 'Ready. Your section lead reports it done.'
            : '';

  return (
    <Card style={styles.card}>
      <View style={styles.between}>
        <Text style={styles.kicker}>
          Mission · {Object.keys(t.outcome).length + 1} of {t.total}
        </Text>
        <Text style={styles.kicker}>{m.reward} pts</Text>
      </View>
      <Display size={30}>{m.name}</Display>
      {!!m.brief && <Body>{m.brief}</Body>}
      {!!m.clue && <Body muted>Clue: {m.clue}</Body>}
      <View style={{ gap: space.xs }}>
        {v.steps.map((st, i) => (
          <StepRow key={st.id} mark={st.done ? '✓' : m.in_order ? String(i + 1) : '•'} done={st.done} step={st} />
        ))}
        {v.finish && <StepRow mark="⚑" done={false} step={v.finish} caption="Finish" />}
      </View>
      {!!status && <Body muted>{status}</Body>}
      {v.left !== null && (
        <Text style={[styles.timer, v.left < 60 && { color: colours.danger }]}>
          {formatClock(Math.max(0, v.left))} left
        </Text>
      )}
      {lead && live && (
        <View style={{ gap: space.sm }}>
          {reports && !v.reported && (
            <Button
              title={m.done === 'host' ? 'Report done (host confirms)' : 'Report done'}
              disabled={!v.canReport}
              busy={action.busy === 'report'}
              onPress={() => action.run('report', () => api.patrolReport(game.id))}
            />
          )}
          <ConfirmButton
            title="Abort mission"
            confirmTitle="Tap again: it fails and the next one starts"
            busy={action.busy === 'abort'}
            onConfirm={() => action.run('abort', () => api.patrolAbort(game.id))}
          />
          <ErrorText>{action.error}</ErrorText>
        </View>
      )}
    </Card>
  );
}

function StepRow({
  mark,
  done,
  step,
  caption,
}: {
  mark: string;
  done: boolean;
  step: { title: string; label: string; grid: string };
  caption?: string;
}) {
  return (
    <View style={[styles.step, done && styles.stepDone]}>
      <Text style={[styles.stepNum, done && { color: colours.accent }]}>{mark}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>
          {caption ? `${caption}: ` : ''}
          {step.title}
        </Text>
        {!!step.label && <Text style={styles.caption}>{step.label}</Text>}
      </View>
      {!!step.grid && <Text style={styles.grid}>{step.grid}</Text>}
    </View>
  );
}

const OUTCOME_COUNT = (t: PatrolTeam, o: string) => Object.values(t.outcome).filter((x) => x === o).length;

/** Every team's progress, for the Host tab. Open a team to mark its mission. */
export function PatrolHost({ game, clock }: { game: Game; clock: Clock }) {
  const { data, teamById } = useDay();
  const rows = useOpenRow<string>();
  const action = useAction();
  const s = patrolOf(game);
  const teams = teamsOf(data, game);
  if (!s || !data || !teams.length) return null;
  const canMark = clock.state !== 'complete' && clock.state !== 'ready';
  return (
    <List>
      {teams.map((t) => {
        const team = teamById(t.team_id);
        const raw = t.current ? s.missions.find((x) => x.id === t.current) : undefined;
        const v = raw ? missionView(data.field, raw, t, clock.elapsed) : null;
        const detail = v
          ? v.reported
            ? `${v.mission.name} · reported done, check it`
            : `${v.mission.name} · ${v.steps.filter((x) => x.done).length}/${v.steps.length} points${
                v.left !== null ? ` · ${formatClock(Math.max(0, v.left))} left` : ''
              }`
          : finished(t)
            ? 'All missions done'
            : 'Looking for a mission';
        const failed = OUTCOME_COUNT(t, 'failed');
        const skipped = OUTCOME_COUNT(t, 'skipped');
        const extra = [failed ? `${failed} failed` : null, skipped ? `${skipped} skipped` : null].filter(Boolean).join(', ');
        const go = (key: 'done' | 'failed' | 'skip' | 'reject') =>
          action.run(`${t.team_id}:${key}`, () => api.patrolMark(game.id, t.team_id, key));
        const busy = (key: string) => action.busy === `${t.team_id}:${key}`;
        return (
          <ListRow
            key={t.team_id}
            title={`${team?.name ?? 'Team'} · ${Object.keys(t.outcome).length}/${t.total} missions${extra ? ` (${extra})` : ''}`}
            detail={detail}
            value={v?.reported ? 'Check' : String(t.score)}
            big={!v?.reported}
            valueColour={v?.reported ? colours.danger : team ? teamColour(team.colour) : undefined}
            open={rows.isOpen(t.team_id)}
            onPress={v && canMark ? () => rows.toggle(t.team_id) : undefined}
          >
            {v && (
              <>
                {v.reported ? (
                  <>
                    <Body muted>The section lead reported {v.mission.name} done.</Body>
                    <Row>
                      <View style={{ flex: 1 }}>
                        <Button title="Accept" busy={busy('done')} onPress={() => go('done')} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button title="Reject" variant="secondary" busy={busy('reject')} onPress={() => go('reject')} />
                      </View>
                    </Row>
                  </>
                ) : (
                  <>
                    <Row>
                      <View style={{ flex: 1 }}>
                        <Button title="Mark done" busy={busy('done')} onPress={() => go('done')} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button title="Skip" variant="secondary" busy={busy('skip')} onPress={() => go('skip')} />
                      </View>
                    </Row>
                    <ConfirmButton
                      title="Mark failed"
                      confirmTitle="Tap again to fail it"
                      busy={busy('failed')}
                      onConfirm={() => go('failed')}
                    />
                  </>
                )}
                <Text style={styles.caption}>
                  Done pays {v.mission.reward} points. Failed and skipped pay nothing, and the next mission starts.
                </Text>
                <ErrorText>{action.error}</ErrorText>
              </>
            )}
          </ListRow>
        );
      })}
    </List>
  );
}

const styles = StyleSheet.create({
  panel: { borderTopWidth: 1, borderTopColor: colours.border, marginTop: space.sm, paddingTop: space.md, gap: space.xs },
  headline: { color: colours.text, fontFamily: fonts.display, fontSize: 26, textTransform: 'uppercase' },
  scores: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginVertical: space.xs },
  score: { alignItems: 'center' },
  scoreValue: { fontFamily: fonts.display, fontSize: 32, fontVariant: ['tabular-nums'] },
  caption: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 14 },
  card: { padding: space.lg, gap: space.sm },
  kicker: { color: colours.accent, fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    borderRadius: radius,
    backgroundColor: colours.background,
  },
  stepDone: { opacity: 0.6 },
  stepNum: { width: 22, textAlign: 'center', color: colours.text, fontFamily: fonts.display, fontSize: 22 },
  stepTitle: { color: colours.text, fontFamily: fonts.semibold, fontSize: 16 },
  grid: { color: colours.text, fontFamily: fonts.display, fontSize: 24, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  timer: { color: colours.text, fontFamily: fonts.display, fontSize: 28, fontVariant: ['tabular-nums'] },
});
