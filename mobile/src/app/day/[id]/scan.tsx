// Scan tab: point the camera at a code. A hit player's QR shows their wound so
// you can treat them (plans/medic-proposal.md §3; QR stands in for NFC
// wristbands). A point's QR (tag library, phase 1) says which point it is.
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, Display, ErrorText, Screen } from '../../../components/ui';
import { api, friendlyError } from '../../../lib/api';
import { useDay } from '../../../lib/day';
import { clockFor, formatClock, useServerNow, type Game } from '../../../lib/game';
import { bleedLeft, decodeCode, helperText, medicOf, type MedicSettings, type ScanResult } from '../../../lib/medic';
import { parseTag, type TagLookup } from '../../../lib/tags';
import { patrolOf, pointTitle, type PatrolScan } from '../../../lib/patrol';
import { colours, fonts, radius, space } from '../../../theme';

interface Scanned {
  user: string;
  code: string;
  result: ScanResult;
}

export default function ScanTab() {
  const { data } = useDay();
  const game = data?.game ?? null;
  const medic = medicOf(game);
  const now = useServerNow(1000);
  const state = game ? clockFor(game, now).state : null;

  if (Platform.OS === 'web') {
    return (
      <Screen>
        <Display>Scan</Display>
        <Body muted>Scanning works in the phone app.</Body>
      </Screen>
    );
  }
  // Point codes scan any time; player codes only while a medic game is live.
  const medicNote = !game
    ? 'No game yet, so there’s no one to treat.'
    : !medic
      ? 'Medic rules are off for this game.'
      : state === 'complete'
        ? 'The game has finished.'
        : state !== 'live'
          ? 'Treating players works while the game is live.'
          : '';
  return (
    <Scanner game={game} live={state === 'live'} medic={medicNote ? null : medic} medicNote={medicNote} now={now} />
  );
}

function Scanner({
  game,
  live,
  medic,
  medicNote,
  now,
}: {
  game: Game | null;
  live: boolean;
  medic: MedicSettings | null;
  medicNote: string;
  now: number;
}) {
  const { id: dayId, data, me, callsign, reload } = useDay();
  const focused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<Scanned | null>(null);
  const [tag, setTag] = useState<TagLookup | null>(null);
  const [patrolResult, setPatrolResult] = useState<PatrolScan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  // The camera reports the same code many times a second; handle one at a time.
  const handling = useRef(false);

  const onScan = async (text: string) => {
    if (handling.current) return;
    handling.current = true;
    setError('');
    setDone('');
    const code = parseTag(text);
    const parsed = decodeCode(text);
    try {
      if (code) {
        setBusy(true);
        // In a live Patrol game, a player on a team scans points for missions.
        if (game?.mode === 'patrol' && live && me?.team_id) {
          const r = await api.patrolScan(game.id, code);
          if (r.result !== 'not_here') {
            setPatrolResult(r);
            reload();
            return;
          }
        }
        setTag(await api.lookupTag(code, dayId));
        return;
      }
      if (!parsed) throw new Error('That isn’t a player or point code.');
      if (!game || !medic) throw new Error(medicNote);
      if (parsed.game !== game.id) throw new Error('That code is from another game.');
      setBusy(true);
      const result = await api.scanPlayer(game.id, parsed.user, parsed.code);
      setScanned({ user: parsed.user, code: parsed.code, result });
    } catch (e) {
      setError(friendlyError(e));
      // Let the camera try again after a moment.
      setTimeout(() => {
        handling.current = false;
      }, 1500);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setScanned(null);
    setTag(null);
    setPatrolResult(null);
    setError('');
    handling.current = false;
  };

  const treat = async () => {
    if (!scanned || !game) return;
    setBusy(true);
    setError('');
    try {
      await api.treatPlayer(game.id, scanned.user, scanned.code);
      const name = callsign(scanned.user);
      setDone(scanned.result.state === 'dead' ? `${name} is back in play.` : `${name} is treated and back in play.`);
      setScanned(null);
      handling.current = false;
      reload();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!permission) {
    return (
      <Screen>
        <Body muted>Checking the camera…</Body>
      </Screen>
    );
  }
  if (!permission.granted) {
    return (
      <Screen>
        <Display>Scan</Display>
        <Body>The camera scans a hit player’s code so you can treat them, and the QR codes on field points.</Body>
        <Button title="Allow camera" onPress={requestPermission} />
        {!permission.canAskAgain && <Body muted>Turn the camera on for this app in your phone’s settings.</Body>}
      </Screen>
    );
  }

  if (patrolResult && game) {
    const r = patrolResult;
    const s = patrolOf(game);
    const m = s?.missions.find((x) => x.id === r.mission);
    const field = data?.field?.data;
    const [kicker, title, text] =
      r.result === 'complete'
        ? ['Mission complete', m?.name ?? 'Mission', `+${r.reward ?? 0} points. Your next mission is on the Game tab.`]
        : r.result === 'step' && r.need
          ? [pointTitle(field, r.point), 'Got it', `All points done. Now scan ${pointTitle(field, r.need)} to finish.`]
        : r.result === 'step'
          ? [pointTitle(field, r.point), 'Got it', `${m?.name ?? 'Mission'}: see the Game tab for the next point.`]
          : r.result === 'ready'
            ? [
                pointTitle(field, r.point),
                'Points done',
                m?.hold
                  ? `Hold for ${m.hold} min, then your section lead reports it done on the Game tab.`
                  : 'Your section lead reports it done on the Game tab.',
              ]
          : r.result === 'new'
            ? ['New mission', m?.name ?? 'Mission', m?.brief || 'See the Game tab for where to go.']
            : r.result === 'wrong'
              ? [
                  pointTitle(field, r.point),
                  'Not this one',
                  r.need
                    ? `${m?.name ?? 'Your mission'} needs ${pointTitle(field, r.need)}.`
                    : `${m?.name ?? 'Your mission'} has all its points. Your section lead reports it done.`,
                ]
              : r.result === 'already'
                ? [
                    pointTitle(field, r.point),
                    'Already scanned',
                    r.need ? `Now scan ${pointTitle(field, r.need)} to finish.` : 'Your team has this point for the mission.',
                  ]
                : r.result === 'busy'
                  ? ['Busy', 'Finish your mission first', `${m?.name ?? 'Your mission'} is still in play.`]
                  : [pointTitle(field, r.point), 'No mission here', 'Nothing for your team at this point right now.'];
    const good = r.result === 'complete' || r.result === 'step' || r.result === 'new' || r.result === 'ready';
    return (
      <Screen>
        <Text style={styles.kicker}>{kicker}</Text>
        <Display size={36} colour={good ? colours.accent : colours.text}>
          {title}
        </Display>
        <Body>{text}</Body>
        <Button title="Scan another" variant="secondary" onPress={reset} />
      </Screen>
    );
  }

  if (tag) {
    const p = tag.point;
    return (
      <Screen>
        <Text style={styles.kicker}>{tag.code}</Text>
        {tag.known && p ? (
          <>
            <Display size={36}>{p.num ? `Point ${p.num}` : 'Point'}</Display>
            <Body>{p.label}</Body>
            <Body muted>{tag.field}</Body>
          </>
        ) : tag.known ? (
          <>
            <Display size={36}>Removed point</Display>
            <Body muted>This code was on a point that’s no longer on {tag.field}.</Body>
          </>
        ) : (
          <>
            <Display size={36}>Not set up</Display>
            <Body muted>
              {tag.mine
                ? 'This code isn’t on a point any more. Put it on one in Fields → QR codes.'
                : 'This code isn’t a point on this Game Day’s field.'}
            </Body>
          </>
        )}
        <Button title="Scan another" variant="secondary" onPress={reset} />
      </Screen>
    );
  }

  if (scanned && game) {
    const r = scanned.result;
    const name = callsign(scanned.user);
    const left = r.expired ? 0 : bleedLeft(game, r.bleed_until, now);
    const dead = r.state === 'dead';
    const hurt = r.state !== 'in_play';
    return (
      <Screen>
        <Text style={styles.kicker}>{r.hit ? `Hit ${r.hit}` : 'Scanned'}</Text>
        <Display size={36}>{name}</Display>
        {!hurt ? (
          <Body>{name} is in play. There’s nothing to treat.</Body>
        ) : r.revealed && r.wound ? (
          <Card style={{ borderColor: dead ? colours.enemy : colours.danger }}>
            <Display size={28} colour={dead ? colours.enemy : colours.danger}>
              {r.wound.name}
            </Display>
            {!!r.wound.instruction && <Body>{r.wound.instruction}</Body>}
            {!dead && (
              <Text style={styles.bleed}>{r.expired ? 'Bled out' : `Bleed out ${left === null ? '–' : formatClock(left)}`}</Text>
            )}
          </Card>
        ) : (
          <Body>Their wound stays hidden until someone who can treat it scans them.</Body>
        )}
        {hurt && !r.allowed && (
          <Body muted>
            {dead ? 'Who can bring them back' : 'Who can treat this'}: {helperText(r.helpers).toLowerCase()}.
          </Body>
        )}
        {hurt && r.allowed && (
          <Button title={dead ? 'Bring back into play' : 'Treatment done'} busy={busy} onPress={treat} />
        )}
        <ErrorText>{error}</ErrorText>
        <Button title="Scan another" variant="secondary" onPress={reset} />
      </Screen>
    );
  }

  return (
    <View style={styles.screen}>
      {focused && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={busy ? undefined : (e) => onScan(e.data)}
        />
      )}
      <View style={styles.frame} pointerEvents="none" />
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{busy ? 'Checking…' : 'Point the camera at a player’s or point’s code'}</Text>
        <Text style={styles.panelText}>
          {medic ? `${medic.name} · bleed-out ${medic.bleed_minutes} min` : medicNote}
        </Text>
        {!!done && <Text style={[styles.panelText, { color: colours.accent }]}>{done}</Text>}
        {!!error && <Text style={[styles.panelText, { color: colours.danger }]}>{error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  frame: {
    position: 'absolute',
    alignSelf: 'center',
    top: '22%',
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: colours.accent,
    borderRadius: radius,
  },
  panel: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: space.md,
    padding: space.md,
    gap: space.xs,
    borderRadius: radius,
    backgroundColor: 'rgba(11,16,12,0.92)',
    borderWidth: 1,
    borderColor: colours.border,
  },
  panelTitle: { color: colours.text, fontFamily: fonts.semibold, fontSize: 16 },
  panelText: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 14 },
  kicker: { color: colours.accent, fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  bleed: { color: colours.danger, fontFamily: fonts.semibold, fontSize: 18 },
});
