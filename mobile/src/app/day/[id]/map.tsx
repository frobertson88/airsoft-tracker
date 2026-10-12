// Map tab: the day's field, your own position and your team's live positions
// (docs/field-library.md, docs/location-and-device-operation.md).
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { FieldMap, type FieldMapHandle, type MapHill, type MapPlayer } from '../../../components/FieldMap';
import { Body, Button, Screen } from '../../../components/ui';
import { api, friendlyError } from '../../../lib/api';
import type { Coord } from '../../../lib/field';
import { useDay } from '../../../lib/day';
import { clockFor, kothSettings, useServerNow } from '../../../lib/game';
import { ageLabel, HIDDEN_MS, STALE_MS, usePositions } from '../../../lib/positions';
import { TRACKING_LABEL, useTracking } from '../../../lib/tracking';
import { colours, fonts, radius, space, teamColour } from '../../../theme';

export default function MapTab() {
  const { id, data, me, isAdmin, callsign, teamById, sectionById } = useDay();
  const tracking = useTracking();
  const mapRef = useRef<FieldMapHandle>(null);
  // Admins press and hold to move the King of the Hill hill.
  const [hillSpot, setHillSpot] = useState<Coord | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState('');
  // Re-read positions when who's on which team changes.
  const membersKey = data?.members.map((m) => `${m.user_id}:${m.status}:${m.team_id}`).join(',');
  const positions = usePositions(id, membersKey);
  const now = useServerNow(15000);

  const players = useMemo<MapPlayer[]>(() => {
    if (!data) return [];
    const out: MapPlayer[] = [];
    for (const p of Object.values(positions)) {
      if (p.user_id === me?.user_id) continue; // the map's own blue dot shows you
      const m = data.members.find((x) => x.user_id === p.user_id && x.status === 'active');
      if (!m) continue;
      const age = now - Date.parse(p.recorded_at);
      if (age > HIDDEN_MS) continue;
      const team = teamById(m.team_id);
      const section = sectionById(m.section_id);
      out.push({
        id: p.user_id,
        lat: p.lat,
        lng: p.lng,
        label: [callsign(p.user_id), section?.name].filter(Boolean).join(' · '),
        colour: team ? teamColour(team.colour) : colours.text,
        stale: age > STALE_MS ? ageLabel(age) : undefined,
      });
    }
    return out;
  }, [data, positions, now, me, callsign, teamById, sectionById]);

  // The King of the Hill circle while that game is on (not once it has finished).
  const hill = useMemo<MapHill | null>(() => {
    const game = data?.game;
    const k = data?.koth;
    if (!game || !k || k.game_id !== game.id || clockFor(game, now).state === 'complete') return null;
    const holder = teamById(k.holder_team_id);
    return {
      lat: k.hill_lat,
      lng: k.hill_lng,
      radius: kothSettings(game).radius,
      colour: k.control === 'held' && holder ? teamColour(holder.colour) : k.control === 'contested' ? colours.danger : colours.text,
      label: k.control === 'held' && holder ? `Hill · ${holder.name}` : k.control === 'contested' ? 'Hill · contested' : 'Hill',
    };
  }, [data, now, teamById]);

  const canMoveHill = isAdmin && !!hill && !!data?.game;
  const moveHillHere = async () => {
    if (!hillSpot || !data?.game) return;
    setMoving(true);
    setMoveError('');
    try {
      await api.moveHill(data.game.id, hillSpot);
      setHillSpot(null);
    } catch (e) {
      setMoveError(friendlyError(e));
    } finally {
      setMoving(false);
    }
  };

  if (!data) return null;

  const field = data.field;
  if (!field) {
    return (
      <Screen>
        <Body>No field picked yet.</Body>
        <Body muted>{isAdmin ? 'Choose one on the Host tab.' : 'The host will pick one before the first game.'}</Body>
        {isAdmin && <Button title="Go to Host" variant="quiet" onPress={() => router.navigate(`/day/${id}/host`)} />}
      </Screen>
    );
  }

  const goToMe = async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      mapRef.current?.goTo({ lat: pos.coords.latitude, lng: pos.coords.longitude, latDelta: 0.004, lngDelta: 0.004 });
    } catch {
      // Location off: the map just stays where it is.
    }
  };

  return (
    <View style={styles.screen}>
      <FieldMap ref={mapRef} data={field.data} players={players}
        hill={
          hillSpot && hill
            ? { ...hill, lat: hillSpot.lat, lng: hillSpot.lng, colour: colours.accent, label: 'Move here?' }
            : hill
        }
        onLongPress={canMoveHill ? (c) => {
          setMoveError('');
          setHillSpot(c);
        } : undefined}
        showsUserLocation={Platform.OS !== 'web'} />
      <View style={styles.banner} pointerEvents="none">
        <Text style={styles.fieldName}>{field.name}</Text>
        <View style={styles.legend}>
          <View style={[styles.swatch, { backgroundColor: 'rgba(255,159,69,0.6)' }]} />
          <Text style={styles.legendText}>No-go</Text>
          <View style={[styles.swatch, styles.swatchDashed]} />
          <Text style={styles.legendText}>Danger</Text>
        </View>
      </View>
      {hillSpot && (
        <View style={styles.moveCard}>
          <Text style={styles.trackingText}>Move the hill here? Players are told it moved.</Text>
          {!!moveError && <Text style={[styles.trackingText, { color: colours.danger }]}>{moveError}</Text>}
          <View style={styles.moveRow}>
            <View style={{ flex: 1 }}>
              <Button title="Move hill" busy={moving} onPress={moveHillHere} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" variant="secondary" onPress={() => setHillSpot(null)} />
            </View>
          </View>
        </View>
      )}
      {tracking.status !== 'sharing' && !hillSpot && (
        <Pressable onPress={tracking.retry} style={styles.trackingBar} accessibilityRole="button">
          <Text style={styles.trackingText}>{TRACKING_LABEL[tracking.status]}</Text>
        </Pressable>
      )}
      <View style={styles.fabs}>
        {hill && (
          <Pressable
            onPress={() => mapRef.current?.goTo({ lat: hill.lat, lng: hill.lng, latDelta: 0.003, lngDelta: 0.003 })}
            accessibilityRole="button"
            accessibilityLabel="Go to the hill"
            style={styles.fab}
          >
            <Ionicons name="flag" size={22} color={hill.colour} />
          </Pressable>
        )}
        <Pressable onPress={() => mapRef.current?.fit()} accessibilityRole="button" accessibilityLabel="Show whole field" style={styles.fab}>
          <Ionicons name="scan-outline" size={22} color={colours.text} />
        </Pressable>
        <Pressable onPress={goToMe} accessibilityRole="button" accessibilityLabel="Go to my location" style={styles.fab}>
          <Ionicons name="locate" size={22} color={colours.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.background },
  banner: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    right: space.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(11,16,12,0.85)',
    borderRadius: radius,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  fieldName: { color: colours.text, fontFamily: fonts.display, fontSize: 18, textTransform: 'uppercase', flexShrink: 1 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendText: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 12, marginRight: space.xs },
  swatch: { width: 14, height: 14, borderRadius: 3, borderColor: colours.danger, borderWidth: 1 },
  swatchDashed: { borderStyle: 'dashed', borderWidth: 2 },
  moveCard: {
    position: 'absolute',
    left: space.sm,
    right: space.sm,
    bottom: space.md,
    backgroundColor: 'rgba(11,16,12,0.95)',
    borderColor: colours.accent,
    borderWidth: 1,
    borderRadius: radius,
    padding: space.md,
    gap: space.sm,
  },
  moveRow: { flexDirection: 'row', gap: space.sm },
  trackingBar: {
    position: 'absolute',
    left: space.sm,
    right: 72,
    bottom: space.md,
    backgroundColor: 'rgba(11,16,12,0.9)',
    borderColor: colours.danger,
    borderWidth: 1,
    borderRadius: radius,
    padding: space.md,
  },
  trackingText: { color: colours.text, fontFamily: fonts.medium, fontSize: 14 },
  fabs: { position: 'absolute', right: space.md, bottom: space.md, gap: space.sm },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colours.surface,
    borderColor: colours.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
