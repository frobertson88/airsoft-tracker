// Satellite map of a field: boundary, No-go/Danger areas, labelled points and
// an optional shape being drawn. The web build uses FieldMap.web.tsx instead.
import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import MapView, { Circle, Marker, Polygon, Polyline, type Region } from 'react-native-maps';
import {
  AREA_LABELS,
  centroid,
  POINT_KINDS,
  viewFor,
  type AreaKind,
  type Coord,
  type FieldData,
  type FieldView,
} from '../lib/field';
import { colours, fonts, space } from '../theme';

export interface FieldMapHandle {
  goTo: (view: FieldView) => void;
  fit: () => void;
}

/** A player shown on the map (teammates, or everyone for a host). */
export interface MapPlayer {
  id: string;
  lat: number;
  lng: number;
  label: string;
  colour: string;
  /** Set when the position is old: greyed and labelled with its age. */
  stale?: string;
}

/** The King of the Hill circle. */
export interface MapHill {
  lat: number;
  lng: number;
  radius: number;
  colour: string;
  label: string;
}

export interface FieldMapProps {
  data: FieldData;
  players?: MapPlayer[];
  hill?: MapHill | null;
  /** A shape being drawn in the editor. */
  draft?: { kind: 'boundary' | AreaKind; points: Coord[] } | null;
  onPress?: (c: Coord) => void;
  onViewChange?: (v: FieldView) => void;
  showsUserLocation?: boolean;
  style?: ViewStyle;
}

const toLatLng = (c: Coord) => ({ latitude: c.lat, longitude: c.lng });
const toRegion = (v: FieldView): Region => ({
  latitude: v.lat,
  longitude: v.lng,
  latitudeDelta: v.latDelta,
  longitudeDelta: v.lngDelta,
});

// Orange means danger in this app; No-go is solid and filled, Danger is dashed.
const AREA_STYLE: Record<AreaKind, { stroke: string; fill: string; dash?: number[] }> = {
  nogo: { stroke: colours.danger, fill: 'rgba(255,159,69,0.35)' },
  danger: { stroke: colours.danger, fill: 'rgba(255,159,69,0.12)', dash: [10, 6] },
};
const DRAFT_STROKE: Record<'boundary' | AreaKind, string> = {
  boundary: colours.accent,
  nogo: colours.danger,
  danger: colours.danger,
};

export const FieldMap = forwardRef<FieldMapHandle, FieldMapProps>(function FieldMap(
  { data, players, hill, draft, onPress, onViewChange, showsUserLocation, style },
  ref,
) {
  const map = useRef<MapView>(null);
  useImperativeHandle(ref, () => ({
    goTo: (view) => map.current?.animateToRegion(toRegion(view), 400),
    fit: () => {
      const all = data.boundary.length ? data.boundary : data.points;
      if (all.length) map.current?.animateToRegion(toRegion(viewFor(all, data.view)), 400);
      else map.current?.animateToRegion(toRegion(data.view), 400);
    },
  }));

  return (
    <MapView
      ref={map}
      style={[styles.map, style]}
      mapType="hybrid"
      initialRegion={toRegion(data.view)}
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={false}
      showsCompass
      rotateEnabled={false}
      toolbarEnabled={false}
      onPress={onPress ? (e) => onPress({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude }) : undefined}
      onRegionChangeComplete={
        onViewChange
          ? (r) => onViewChange({ lat: r.latitude, lng: r.longitude, latDelta: r.latitudeDelta, lngDelta: r.longitudeDelta })
          : undefined
      }
    >
      {data.boundary.length >= 3 && (
        <Polygon
          coordinates={data.boundary.map(toLatLng)}
          strokeColor={colours.accent}
          fillColor="rgba(168,197,142,0.08)"
          strokeWidth={3}
        />
      )}

      {data.areas.map((a, i) => (
        <Polygon
          key={`area-${i}`}
          coordinates={a.points.map(toLatLng)}
          strokeColor={AREA_STYLE[a.kind].stroke}
          fillColor={AREA_STYLE[a.kind].fill}
          strokeWidth={2}
          lineDashPattern={AREA_STYLE[a.kind].dash}
        />
      ))}
      {data.areas.map((a, i) => (
        <Marker
          key={`area-label-${i}`}
          coordinate={toLatLng(centroid(a.points))}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <View style={styles.areaLabel}>
            <Text style={styles.areaKind}>{AREA_LABELS[a.kind]}</Text>
            <Text style={styles.areaName} numberOfLines={1}>
              {a.name}
            </Text>
          </View>
        </Marker>
      ))}

      {data.points.map((p, i) => {
        const kind = POINT_KINDS.find((k) => k.kind === p.kind) ?? POINT_KINDS[4];
        return (
          <Marker key={`point-${i}`} coordinate={toLatLng(p)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={styles.point}>
              <View style={styles.pointIcon}>
                <Ionicons name={kind.icon as never} size={14} color={colours.onAccent} />
              </View>
              <Text style={styles.pointLabel} numberOfLines={1}>
                {p.label}
              </Text>
            </View>
          </Marker>
        );
      })}

      {hill && (
        <>
          <Circle
            center={toLatLng(hill)}
            radius={hill.radius}
            strokeColor={hill.colour}
            strokeWidth={3}
            fillColor="rgba(215,225,209,0.15)"
            zIndex={5}
          />
          <Marker
            key={`hill-${hill.lat}-${hill.lng}-${hill.label}-${hill.colour}`}
            coordinate={toLatLng(hill)}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            zIndex={6}
          >
            <View style={[styles.hillLabel, { borderColor: hill.colour }]}>
              <Ionicons name="flag" size={12} color={hill.colour} />
              <Text style={styles.hillText} numberOfLines={1}>
                {hill.label}
              </Text>
            </View>
          </Marker>
        </>
      )}

      {players?.map((p) => (
        <Marker
          // The key changes with the look so Android redraws the marker.
          key={`player-${p.id}-${p.colour}-${p.stale ?? ''}`}
          coordinate={toLatLng(p)}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          zIndex={10}
        >
          <View style={[styles.player, p.stale ? styles.playerStale : null]}>
            <View style={[styles.playerDot, { backgroundColor: p.stale ? colours.textSecondary : p.colour }]} />
            <Text style={styles.playerLabel} numberOfLines={1}>
              {p.label}
              {p.stale ? ` · ${p.stale}` : ''}
            </Text>
          </View>
        </Marker>
      ))}

      {draft && draft.points.length > 0 && (
        <>
          <Polyline
            coordinates={[...draft.points, ...(draft.points.length > 2 ? [draft.points[0]] : [])].map(toLatLng)}
            strokeColor={DRAFT_STROKE[draft.kind]}
            strokeWidth={3}
            lineDashPattern={[6, 4]}
          />
          {draft.points.map((c, i) => (
            <Marker key={`draft-${i}`} coordinate={toLatLng(c)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={[styles.corner, { borderColor: DRAFT_STROKE[draft.kind] }]} />
            </Marker>
          ))}
        </>
      )}
    </MapView>
  );
});

const styles = StyleSheet.create({
  map: { flex: 1 },
  areaLabel: {
    backgroundColor: 'rgba(11,16,12,0.85)',
    borderColor: colours.danger,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    alignItems: 'center',
    maxWidth: 160,
  },
  areaKind: { color: colours.danger, fontFamily: fonts.display, fontSize: 12, textTransform: 'uppercase' },
  areaName: { color: colours.text, fontFamily: fonts.medium, fontSize: 12 },
  point: { alignItems: 'center', maxWidth: 140 },
  pointIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colours.accent,
    borderColor: colours.onAccent,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointLabel: {
    color: colours.text,
    fontFamily: fonts.semibold,
    fontSize: 12,
    backgroundColor: 'rgba(11,16,12,0.75)',
    paddingHorizontal: 4,
    borderRadius: 4,
    marginTop: 2,
  },
  hillLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(11,16,12,0.85)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    maxWidth: 180,
  },
  hillText: { color: colours.text, fontFamily: fonts.display, fontSize: 13, textTransform: 'uppercase' },
  player: { alignItems: 'center', maxWidth: 180 },
  playerStale: { opacity: 0.7 },
  playerDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: '#ffffff' },
  playerLabel: {
    color: colours.text,
    fontFamily: fonts.semibold,
    fontSize: 12,
    backgroundColor: 'rgba(11,16,12,0.8)',
    paddingHorizontal: 4,
    borderRadius: 4,
    marginTop: 2,
  },
  corner: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, backgroundColor: colours.background },
});
