// Map tab: the day's field, your own position, your team's live positions and
// the map tools for shared drawings (docs/field-library.md,
// docs/location-and-device-operation.md, docs/map-toolbar.md).
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { FieldMap, type FieldMapHandle, type MapHill, type MapPlayer } from '../../../components/FieldMap';
import { useMapTools } from '../../../components/MapTools';
import { MedicOverlay } from '../../../components/MedicPlay';
import { Body, Button, Screen } from '../../../components/ui';
import { api, friendlyError } from '../../../lib/api';
import type { Coord } from '../../../lib/field';
import { useDay } from '../../../lib/day';
import { clockFor, kothSettings, useServerNow } from '../../../lib/game';
import { useMapObjects } from '../../../lib/mapTools';
import { patrolOf } from '../../../lib/patrol';
import { statusLabel, useMedic } from '../../../lib/medic';
import { ageLabel, HIDDEN_MS, STALE_MS, usePositions } from '../../../lib/positions';
import { TRACKING_LABEL, useTracking } from '../../../lib/tracking';
import { colours, fonts, radius, space, teamColour } from '../../../theme';

export default function MapTab() {
  const { id, data, me, isAdmin, callsign, teamById, sectionById } = useDay();
  const tracking = useTracking();
  // The Map has no header, so keep its buttons clear of the status bar.
  const insets = useSafeAreaInsets();
  const mapRef = useRef<FieldMapHandle>(null);
  // Admins press and hold to move the King of the Hill hill.
  const [hillSpot, setHillSpot] = useState<Coord | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState('');
  const [showGrid, setShowGrid] = useState(false);
  // Re-read positions when who's on which team changes.
  const membersKey = data?.members.map((m) => `${m.user_id}:${m.status}:${m.team_id}`).join(',');
  const positions = usePositions(id, membersKey);
  const now = useServerNow(15000);
  // Re-read drawings when what you may see changes, or after a failed change.
  const [mapReloads, setMapReloads] = useState(0);
  const mapKey = `${me?.team_id}:${me?.section_id}:${me?.is_admin}:${me?.map_host_view}:${mapReloads}`;
  const { objects, setObjects } = useMapObjects(id, mapKey);
  const tools = useMapTools({
    objects,
    setObjects,
    reload: () => setMapReloads((n) => n + 1),
    now,
    fieldName: data?.field?.name ?? 'Field',
    hasHill: !!data?.koth,
  });
  const showTools = Platform.OS !== 'web';
  const medicPlay = useMedic(data?.game ?? null);
  const { statuses, medic } = medicPlay;

  const players = useMemo<MapPlayer[]>(() => {
    if (!data) return [];
    // Hit teammates show their status next to their name.
    const hurtLabel = (user: string) => {
      const st = statuses[user];
      return st && st.status !== 'in_play' ? statusLabel(st, medic) : null;
    };
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
        label: [callsign(p.user_id), section?.name, hurtLabel(p.user_id)].filter(Boolean).join(' · '),
        colour: team ? teamColour(team.colour) : colours.text,
        stale: age > STALE_MS ? ageLabel(age) : undefined,
      });
    }
    return out;
  }, [data, positions, now, me, callsign, teamById, sectionById, statuses, medic]);

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

  // In a Patrol game, points the host hid stay off players' maps until it ends.
  // Admins in Host view see them all.
  const mapData = useMemo(() => {
    const fieldData = data?.field?.data;
    const patrol = patrolOf(data?.game ?? null);
    if (!fieldData || !patrol?.hidden.length || !data?.game) return fieldData;
    if (clockFor(data.game, now).state === 'complete' || (isAdmin && me?.map_host_view)) return fieldData;
    const hidden = new Set(patrol.hidden);
    return { ...fieldData, points: fieldData.points.filter((p) => !p.id || !hidden.has(p.id)) };
  }, [data, now, isAdmin, me]);

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
      <Screen edges={['top']}>
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
      <FieldMap ref={mapRef} data={mapData ?? field.data} players={players} grid={showGrid}
        drawings={tools.drawings}
        selectedId={tools.selectedId}
        onDrawingPress={tools.onDrawingPress}
        onDrawingMove={tools.onDrawingMove}
        toolDraft={tools.toolDraft}
        quickTaps={showTools && tools.toolActive}
        onPress={showTools ? tools.onMapPress : undefined}
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
      {showTools && (
        <View style={[styles.tools, { top: insets.top + space.sm }]} pointerEvents="box-none">
          {tools.rail}
          {tools.palette}
        </View>
      )}
      {showTools && tools.strip && !hillSpot && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'position' : undefined}
          style={styles.strip}
          pointerEvents="box-none"
        >
          {tools.strip}
        </KeyboardAvoidingView>
      )}
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
      {(() => {
        const trackingBar = tracking.status !== 'sharing' && (
          <Pressable onPress={tracking.retry} style={styles.trackingBar} accessibilityRole="button">
            <Text style={styles.trackingText}>{TRACKING_LABEL[tracking.status]}</Text>
          </Pressable>
        );
        const hideBottom = !!hillSpot || (showTools && !!tools.strip);
        if (data.game && medic && me) {
          return (
            <MedicOverlay
              game={data.game}
              medic={medic}
              mine={medicPlay.mine}
              myId={me.user_id}
              canPlay={!!me.team_id}
              hideBottom={hideBottom}
              bottomExtra={trackingBar}
              onHit={medicPlay.setMine}
              reload={medicPlay.reload}
              top={insets.top}
            />
          );
        }
        return !hideBottom && trackingBar ? <View style={styles.bottom}>{trackingBar}</View> : null;
      })()}
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
        <Pressable
          onPress={() => setShowGrid((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={showGrid ? 'Hide map grid' : 'Show map grid'}
          style={[styles.fab, showGrid && { borderColor: colours.accent }]}
        >
          <Ionicons name="grid-outline" size={22} color={showGrid ? colours.accent : colours.text} />
        </Pressable>
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
  tools: { position: 'absolute', top: space.sm, left: space.sm, flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  strip: { position: 'absolute', left: 64, right: 72, bottom: space.md },
  bottom: { position: 'absolute', left: space.sm, right: 72, bottom: space.md },
  trackingBar: {
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
