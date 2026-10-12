// Scan tab: point the camera at a hit player's QR code to see their wound and
// treat them (plans/medic-proposal.md §3). QR codes stand in for NFC wristbands.
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, Display, ErrorText, Screen } from '../../../components/ui';
import { api, friendlyError } from '../../../lib/api';
import { useDay } from '../../../lib/day';
import { clockFor, formatClock, useServerNow, type Game } from '../../../lib/game';
import { bleedLeft, decodeCode, helperText, medicOf, type MedicSettings, type ScanResult } from '../../../lib/medic';
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

  if (!game || !medic) {
    return (
      <Screen>
        <Display>Scan</Display>
        <Body muted>{game ? 'Medic rules are off for this game.' : 'No game yet.'}</Body>
        <Body muted>When a game uses medic rules, scan a hit player’s code here to treat them.</Body>
      </Screen>
    );
  }
  if (state !== 'live') {
    return (
      <Screen>
        <Display>Scan</Display>
        <Body muted>{state === 'complete' ? 'The game has finished.' : 'Scanning works while the game is live.'}</Body>
      </Screen>
    );
  }
  if (Platform.OS === 'web') {
    return (
      <Screen>
        <Display>Scan</Display>
        <Body muted>Scanning works in the phone app.</Body>
      </Screen>
    );
  }
  return <Scanner game={game} medic={medic} now={now} />;
}

function Scanner({ game, medic, now }: { game: Game; medic: MedicSettings; now: number }) {
  const { callsign, reload } = useDay();
  const focused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<Scanned | null>(null);
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
    const parsed = decodeCode(text);
    try {
      if (!parsed) throw new Error('That isn’t a player code.');
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
    setError('');
    handling.current = false;
  };

  const treat = async () => {
    if (!scanned) return;
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
        <Body>The camera scans a hit player’s code so you can treat them.</Body>
        <Button title="Allow camera" onPress={requestPermission} />
        {!permission.canAskAgain && <Body muted>Turn the camera on for this app in your phone’s settings.</Body>}
      </Screen>
    );
  }

  if (scanned) {
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
        <Text style={styles.panelTitle}>{busy ? 'Checking…' : 'Point the camera at a hit player’s code'}</Text>
        <Text style={styles.panelText}>
          {medic.name} · bleed-out {medic.bleed_minutes} min
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
