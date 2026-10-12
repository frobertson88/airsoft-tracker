// The game card everyone sees: name, state and the shared clock.
import { StyleSheet, Text, View } from 'react-native';
import { useDay } from '../lib/day';
import {
  clockFor,
  describeSettings,
  formatClock,
  formatLength,
  kothScores,
  kothSettings,
  STATE_LABEL,
  useServerNow,
  type Clock,
  type Game,
  type KothState,
} from '../lib/game';
import { colours, fonts, radius, space, teamColour } from '../theme';

const STATE_COLOUR = {
  ready: colours.textSecondary,
  countdown: colours.accent,
  live: colours.accent,
  paused: colours.text,
  resuming: colours.accent,
  complete: colours.textSecondary,
} as const;

export function GameClock({ game }: { game: Game }) {
  const now = useServerNow(250);
  const c = clockFor(game, now);
  const tint = STATE_COLOUR[c.state];

  let big: string;
  let caption: string;
  if (c.countdown !== null) {
    big = String(Math.ceil(c.countdown));
    caption = c.state === 'resuming' ? 'Resuming in' : 'Starting in';
  } else if (c.state === 'ready') {
    big = game.length_seconds === null ? '∞' : formatClock(game.length_seconds + game.extra_seconds);
    caption = formatLength(game);
  } else if (c.state === 'complete') {
    big = formatClock(c.elapsed);
    caption = game.end_reason === 'time' ? 'Time’s up · played' : 'Ended · played';
  } else if (c.remaining !== null) {
    big = formatClock(c.remaining);
    caption = c.state === 'paused' ? 'Paused · remaining' : 'Remaining';
  } else {
    big = formatClock(c.elapsed);
    caption = c.state === 'paused' ? 'Paused · elapsed' : 'Elapsed';
  }

  return (
    <View style={[styles.card, { borderColor: tint }]}>
      <View style={styles.top}>
        <Text style={styles.name} numberOfLines={1}>
          {game.name}
        </Text>
        <View style={[styles.badge, { borderColor: tint }]}>
          {c.state === 'live' && <View style={[styles.dot, { backgroundColor: tint }]} />}
          <Text style={[styles.badgeText, { color: tint }]}>{STATE_LABEL[c.state]}</Text>
        </View>
      </View>
      <Text style={styles.caption}>{caption}</Text>
      <Text
        style={[styles.big, { color: c.state === 'complete' ? colours.textSecondary : colours.text }]}
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        {big}
      </Text>
      {c.state === 'ready' && <Text style={styles.caption}>Waiting for the host to start</Text>}
      {game.mode === 'koth' && <KothPanel game={game} clock={c} />}
    </View>
  );
}

// King of the Hill: who holds the hill, team scores, and the result at the end.
function KothPanel({ game, clock }: { game: Game; clock: Clock }) {
  const { data, teamById } = useDay();
  const k: KothState | null = data?.koth?.game_id === game.id ? data.koth : null;
  const s = kothSettings(game);
  if (!data) return null;
  if (!k) return <Text style={styles.caption}>{describeSettings(game.mode, game.settings)}</Text>;

  const scores = kothScores(k, game, clock.elapsed);
  // Teams with players, plus any team that has scored.
  const teams = data.allTeams.filter(
    (t) =>
      (t.active && data.members.some((m) => m.status === 'active' && m.team_id === t.id)) || scores[t.id] !== undefined,
  );
  const holder = teamById(k.holder_team_id);
  const done = clock.state === 'complete';

  let headline: string;
  let tint: string = colours.text;
  if (done && k.result) {
    const winner = teamById(k.winner_team_id);
    headline = k.result === 'win' && winner ? `${winner.name} wins` : k.result === 'draw' ? 'Draw' : 'Finished, no scoring';
    if (winner && k.result === 'win') tint = teamColour(winner.colour);
  } else if (k.control === 'held' && holder) {
    headline = `Held by ${holder.name}`;
    tint = teamColour(holder.colour);
  } else if (k.control === 'contested') {
    headline = 'Contested';
    tint = colours.danger;
  } else {
    headline = 'Nobody on the hill';
    tint = colours.textSecondary;
  }

  const moveIn =
    !done && s.relocate_minutes && clock.state !== 'ready'
      ? Number(k.placed_active) + s.relocate_minutes * 60 - clock.elapsed
      : null;

  return (
    <View style={styles.koth}>
      <Text style={[styles.headline, { color: tint }]}>{headline}</Text>
      {!done && Object.keys(k.counts).length > 0 && (
        <Text style={styles.caption}>
          On the hill:{' '}
          {teams
            .filter((t) => k.counts[t.id])
            .map((t) => `${t.name} ${k.counts[t.id]}`)
            .join(' · ')}
        </Text>
      )}
      {s.scoring && (
        <View style={styles.scores}>
          {teams.map((t) => (
            <View key={t.id} style={styles.score}>
              <Text style={[styles.scoreValue, { color: teamColour(t.colour) }]}>{Math.floor(scores[t.id] ?? 0)}</Text>
              <Text style={styles.caption}>{t.name}</Text>
            </View>
          ))}
        </View>
      )}
      {moveIn !== null && moveIn > 0 && <Text style={styles.caption}>Hill moves in {formatClock(moveIn)}</Text>}
      {!done && k.unknown > 0 && (
        <Text style={styles.caption}>
          {k.unknown} {k.unknown === 1 ? 'player has' : 'players have'} no recent location and can’t count
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  koth: { borderTopWidth: 1, borderTopColor: colours.border, marginTop: space.sm, paddingTop: space.md, gap: space.xs },
  headline: { fontFamily: fonts.display, fontSize: 26, textTransform: 'uppercase' },
  scores: { flexDirection: 'row', gap: space.lg, marginVertical: space.xs },
  score: { alignItems: 'center' },
  scoreValue: { fontFamily: fonts.display, fontSize: 32, fontVariant: ['tabular-nums'] },
  card: {
    backgroundColor: colours.surface,
    borderWidth: 1,
    borderRadius: radius,
    padding: space.lg,
    gap: space.xs,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  name: { color: colours.text, fontFamily: fonts.display, fontSize: 24, textTransform: 'uppercase', flexShrink: 1 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  caption: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 14 },
  big: { fontFamily: fonts.display, fontSize: 88, lineHeight: 96, fontVariant: ['tabular-nums'], textAlign: 'center' },
});
