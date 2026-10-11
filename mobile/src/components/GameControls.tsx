// Host tab game controls: set up a game, then run it through countdown, live,
// pause and end (plans/current.md, Stage 3).
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useCommand, useDay } from '../lib/day';
import { clockFor, formatLength, useServerNow, type Game } from '../lib/game';
import { colours, fonts, space } from '../theme';
import { GameClock } from './GameClock';
import { Body, Button, Card, Chip, ConfirmButton, ErrorText, Field, Label, Row } from './ui';

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

function GameSetup({ game, onDone }: { game: Game | null; onDone?: () => void }) {
  const { id } = useDay();
  const { run, busy, error, setError } = useCommand();
  const [name, setName] = useState(game?.name ?? 'Skirmish');
  const [length, setLength] = useState<number | null>(game ? game.length_seconds : 1200);
  const [countdown, setCountdown] = useState(game?.countdown_seconds ?? 30);
  const editing = game?.state === 'ready';

  const save = async () => {
    if (!name.trim()) return setError('Give the game a name.');
    const ok = await run(() =>
      editing
        ? api.updateGame(game.id, name.trim(), length, countdown)
        : api.createGame(id, name.trim(), length, countdown),
    );
    if (ok) onDone?.();
  };

  return (
    <Card style={{ gap: space.md }}>
      <Field value={name} onChangeText={setName} placeholder="Game name" maxLength={40} />
      <Text style={styles.small}>Length</Text>
      <Row style={styles.wrap}>
        {LENGTHS.map((l) => (
          <Chip key={l.label} label={l.label} selected={length === l.seconds} onPress={() => setLength(l.seconds)} />
        ))}
      </Row>
      <Text style={styles.small}>Start countdown</Text>
      <Row style={styles.wrap}>
        {COUNTDOWNS.map((c) => (
          <Chip key={c.label} label={c.label} selected={countdown === c.seconds} onPress={() => setCountdown(c.seconds)} />
        ))}
      </Row>
      <Button title={editing ? 'Save settings' : 'Set up game'} busy={busy} onPress={save} />
      {editing && <Button title="Cancel" variant="quiet" onPress={() => onDone?.()} />}
      <ErrorText>{error}</ErrorText>
    </Card>
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
  return (
    <>
      <Label>{state === 'complete' ? 'Last game' : 'Game'}</Label>
      <GameClock game={game} />
      <View style={styles.actions}>
        {state === 'ready' && (
          <>
            {data.field ? (
              <Button
                title={game.countdown_seconds ? 'Start countdown' : 'Start game'}
                busy={busy}
                onPress={() => run(() => api.startGame(g))}
              />
            ) : (
              <Body muted>Pick a field below before starting.</Body>
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
        {state === 'live' && (
          <Button title="Pause" busy={busy} onPress={() => run(() => api.pauseGame(g))} />
        )}
        {state === 'paused' && (
          <Button title="Resume (10s countdown)" busy={busy} onPress={() => run(() => api.resumeGame(g))} />
        )}
        {(state === 'live' || state === 'paused' || state === 'resuming') && (
          <>
            {timed && (
              <Button title="Add 5 min" variant="secondary" busy={busy} onPress={() => run(() => api.addTime(g, 300))} />
            )}
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
});
