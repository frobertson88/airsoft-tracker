// The game card everyone sees: name, state and the shared clock.
import { StyleSheet, Text, View } from 'react-native';
import { clockFor, formatClock, formatLength, STATE_LABEL, useServerNow, type Game } from '../lib/game';
import { colours, fonts, radius, space } from '../theme';

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
    </View>
  );
}

const styles = StyleSheet.create({
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
