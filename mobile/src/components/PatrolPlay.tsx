// Patrol during play: team scores on the game card, your team's mission on
// the Game tab, and every team's progress for the host.
import { StyleSheet, Text, View } from 'react-native';
import { useDay } from '../lib/day';
import { formatClock, type Clock, type Game } from '../lib/game';
import { finished, missionView, patrolOf, patrolWinner, type PatrolTeam } from '../lib/patrol';
import { colours, fonts, radius, space, teamColour } from '../theme';
import { Body, Card, Display, List, ListRow } from './ui';

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

/** Your team's current mission, for the Game tab. */
export function PatrolCard({ game, clock }: { game: Game; clock: Clock }) {
  const { data, me } = useDay();
  const s = patrolOf(game);
  const t = teamsOf(data, game).find((x) => x.team_id === me?.team_id);
  if (!s || !data || clock.state === 'ready') return null;
  if (!t) return <Body muted>Your team isn’t playing this Patrol game.</Body>;

  const m = t.current ? s.missions.find((x) => x.id === t.current) : undefined;
  if (!m) {
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

  const v = missionView(data.field, m, t, clock.elapsed);
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
          <View key={st.id} style={[styles.step, st.done && styles.stepDone]}>
            <Text style={[styles.stepNum, st.done && { color: colours.accent }]}>{st.done ? '✓' : m.in_order ? i + 1 : '•'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>{st.title}</Text>
              {!!st.label && <Text style={styles.caption}>{st.label}</Text>}
            </View>
            {!!st.grid && <Text style={styles.grid}>{st.grid}</Text>}
          </View>
        ))}
      </View>
      <Body muted>{m.in_order ? 'Scan the points in this order.' : 'Scan the points in any order.'}</Body>
      {v.left !== null && (
        <Text style={[styles.timer, v.left < 60 && { color: colours.danger }]}>
          {formatClock(Math.max(0, v.left))} left
        </Text>
      )}
    </Card>
  );
}

/** Every team's progress, for the Host tab. */
export function PatrolHost({ game, clock }: { game: Game; clock: Clock }) {
  const { data, teamById } = useDay();
  const s = patrolOf(game);
  const teams = teamsOf(data, game);
  if (!s || !data || !teams.length) return null;
  return (
    <List>
      {teams.map((t) => {
        const team = teamById(t.team_id);
        const m = t.current ? s.missions.find((x) => x.id === t.current) : undefined;
        const v = m ? missionView(data.field, m, t, clock.elapsed) : null;
        const detail = m
          ? `${m.name} · ${v!.steps.filter((x) => x.done).length}/${v!.steps.length} points${
              v!.left !== null ? ` · ${formatClock(Math.max(0, v!.left))} left` : ''
            }`
          : finished(t)
            ? 'All missions done'
            : 'Looking for a mission';
        const failed = Object.values(t.outcome).filter((o) => o === 'failed').length;
        return (
          <ListRow
            key={t.team_id}
            title={`${team?.name ?? 'Team'} · ${Object.keys(t.outcome).length}/${t.total} missions${failed ? ` (${failed} failed)` : ''}`}
            detail={detail}
            value={String(t.score)}
            big
            valueColour={team ? teamColour(team.colour) : undefined}
          />
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
