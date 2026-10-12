// During play (plans/medic-proposal.md §3): the status label, the I'm hit
// button and the full-screen Hit view with the bleed-out countdown and the QR
// code a helper scans. Kept apart from the map so its one-second clock doesn't
// re-render the map.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api, friendlyError } from '../lib/api';
import { clockFor, formatClock, useServerNow, type Game } from '../lib/game';
import { bleedLeft, encodeCode, helperText, statusLabel, type MedicSettings, type MyMedic } from '../lib/medic';
import { colours, fonts, radius, space } from '../theme';
import { Body, Button, Display, Screen } from './ui';

const statusColour = (m: MyMedic) =>
  m.status === 'in_play' ? colours.accent : m.status === 'dead' ? colours.enemy : colours.danger;

/** Asks the server to apply bleed-out once this player's countdown reaches zero. */
function useBleedTick(game: Game, mine: MyMedic, left: number | null, reload: () => void) {
  const due = mine.status !== 'in_play' && !mine.expired && left === 0;
  const last = useRef(0);
  useEffect(() => {
    if (!due || Date.now() - last.current < 3000) return;
    last.current = Date.now();
    api.medicTick(game.id).then(reload, () => {});
  }, [due, game.id, reload, left]);
}

export function MedicOverlay({
  game,
  medic,
  mine,
  myId,
  canPlay,
  hideBottom,
  bottomExtra,
  onHit,
  reload,
}: {
  game: Game;
  medic: MedicSettings;
  mine: MyMedic;
  myId: string;
  /** On a team (hosts without a team can't be hit). */
  canPlay: boolean;
  hideBottom: boolean;
  /** Shown above the I'm hit button (the location bar). */
  bottomExtra?: ReactNode;
  onHit: (m: MyMedic) => void;
  reload: () => void;
}) {
  const now = useServerNow(1000);
  const state = clockFor(game, now).state;
  const left = bleedLeft(game, mine.bleed_until, now);
  useBleedTick(game, mine, left, reload);
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Buzz when you're treated or brought back, and when bleed-out runs out.
  const last = useRef(mine);
  useEffect(() => {
    const prev = last.current;
    last.current = mine;
    if (prev.status !== 'in_play' && mine.status === 'in_play') Vibration.vibrate([0, 200, 100, 200]);
    if (!prev.expired && mine.expired) Vibration.vibrate(800);
  }, [mine]);

  const running = state === 'live' || state === 'paused' || state === 'resuming';
  const hurt = mine.status !== 'in_play';
  const showButton = canPlay && state === 'live' && !hurt;

  const hit = async () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    setBusy(true);
    setError('');
    try {
      onHit(await api.reportHit(game.id));
      Vibration.vibrate(300);
      setOpen(true);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {running && canPlay && (
        <Pressable
          onPress={() => hurt && setOpen(true)}
          accessibilityRole="button"
          style={[styles.pill, { borderColor: statusColour(mine) }]}
        >
          <Text style={[styles.pillText, { color: statusColour(mine) }]}>
            {statusLabel(mine, medic)}
            {hurt && left !== null && !mine.expired ? ` · ${formatClock(left)}` : ''}
          </Text>
          {hurt && <Text style={styles.pillHint}>Show code</Text>}
        </Pressable>
      )}
      {!hideBottom && (
        <View style={styles.bottom} pointerEvents="box-none">
          {bottomExtra}
          {!!error && <Text style={styles.error}>{error}</Text>}
          {showButton && (
            <Pressable
              onPress={hit}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.hitButton, armed && styles.hitArmed, (pressed || busy) && { opacity: 0.7 }]}
            >
              <Text style={[styles.hitText, armed && { color: colours.onAccent }]}>
                {busy ? 'Sending…' : armed ? 'Tap again to confirm' : 'I’m hit'}
              </Text>
            </Pressable>
          )}
        </View>
      )}
      {open && hurt && (
        <HitView game={game} medic={medic} mine={mine} myId={myId} left={left} state={state} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function HitView({
  game,
  medic,
  mine,
  myId,
  left,
  state,
  onClose,
}: {
  game: Game;
  medic: MedicSettings;
  mine: MyMedic;
  myId: string;
  left: number | null;
  state: string;
  onClose: () => void;
}) {
  const wound = mine.shown_hit ? medic.hits[mine.shown_hit - 1] : null;
  const deadWound = medic.hits[medic.hits.length - 1];
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <Screen edges={['top', 'bottom']}>
        <Text style={[styles.kicker, { color: statusColour(mine) }]}>
          Hit · life {mine.life}
          {mine.status === 'awaiting' ? ' · awaiting medic' : ''}
        </Text>
        <Display size={44} colour={statusColour(mine)}>
          {mine.status === 'awaiting' ? 'Hit' : statusLabel(mine, medic)}
        </Display>
        {mine.status === 'awaiting' ? (
          <Body>Stay down and call for help. Your wound shows once a medic or teammate scans your code.</Body>
        ) : (
          !!wound?.instruction && <Body>{wound.instruction}</Body>
        )}
        {mine.status === 'dead' && <Body muted>Bring back: {helperText(deadWound.helpers).toLowerCase()}.</Body>}

        {mine.status !== 'dead' && (
          <View style={styles.bleed}>
            <Text style={styles.bleedLabel}>Bleed out</Text>
            {mine.expired ? (
              <Text style={styles.bleedDone}>
                {medic.expiry === 'dead' ? 'Bled out' : 'Bled out. Stay down and wait for help.'}
              </Text>
            ) : (
              <Text style={styles.bleedClock}>{left === null ? '–' : formatClock(left)}</Text>
            )}
            {state !== 'live' && !mine.expired && <Text style={styles.bleedLabel}>Paused with the game</Text>}
          </View>
        )}

        <View style={styles.qrBox}>
          {mine.code ? (
            <QRCode value={encodeCode(game.id, myId, mine.code)} size={220} backgroundColor="#FFFFFF" color="#000000" />
          ) : (
            <Text style={{ color: '#000000' }}>No code yet. Reopen this screen.</Text>
          )}
        </View>
        <Body muted>Your helper opens the Scan tab and points their camera at this code.</Body>
        <Button title="View map" variant="secondary" onPress={onClose} />
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: 'rgba(11,16,12,0.9)',
    alignItems: 'flex-end',
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 14 },
  pillHint: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 12 },
  bottom: { position: 'absolute', left: space.sm, right: 72, bottom: space.md, gap: space.sm },
  hitButton: {
    minHeight: 56,
    borderRadius: radius,
    borderWidth: 2,
    borderColor: colours.danger,
    backgroundColor: 'rgba(11,16,12,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hitArmed: { backgroundColor: colours.danger },
  hitText: { color: colours.danger, fontFamily: fonts.display, fontSize: 24, textTransform: 'uppercase', letterSpacing: 1 },
  error: {
    color: colours.danger,
    fontFamily: fonts.medium,
    fontSize: 14,
    backgroundColor: 'rgba(11,16,12,0.9)',
    padding: space.sm,
    borderRadius: radius,
  },
  kicker: { fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase' },
  bleed: {
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colours.danger,
    backgroundColor: colours.surface,
  },
  bleedLabel: { color: colours.textSecondary, fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  bleedClock: { color: colours.danger, fontFamily: fonts.display, fontSize: 64 },
  bleedDone: { color: colours.danger, fontFamily: fonts.semibold, fontSize: 18, marginTop: space.xs },
  qrBox: { alignSelf: 'center', padding: space.md, backgroundColor: '#FFFFFF', borderRadius: radius },
});
