// Satellite map of a field: boundary, No-go/Danger areas, labelled points and
// an optional shape being drawn. The web build uses FieldMap.web.tsx instead.
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
import { bearing, offset, type MapObjectKind } from '../lib/mapTools';
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

/** A map drawing, ready to show (lib/mapTools.ts has the data). */
export interface MapDrawing {
  id: string;
  /** Stable render key (a new drawing keeps its first key once saved, so it doesn't flicker). */
  key?: string;
  kind: MapObjectKind;
  /** Marker icon (MaterialCommunityIcons). */
  icon?: string;
  label?: string | null;
  points: Coord[];
  colour: string;
  enemy: boolean;
  /** Quiet age beside an enemy sighting. */
  age?: string;
  linked: boolean;
  /** You may drag it (markers and labels; shapes once selected). */
  movable: boolean;
}

/** A drawing in progress with one of the map tools. */
export interface ToolDraft {
  points: Coord[];
  colour: string;
  closed: boolean;
  numbered: boolean;
}

export interface FieldMapProps {
  data: FieldData;
  players?: MapPlayer[];
  hill?: MapHill | null;
  /** A shape being drawn in the editor. */
  draft?: { kind: 'boundary' | AreaKind; points: Coord[] } | null;
  drawings?: MapDrawing[];
  selectedId?: string | null;
  onDrawingPress?: (id: string) => void;
  onDrawingMove?: (id: string, points: Coord[]) => void;
  toolDraft?: ToolDraft | null;
  /** Taps register straight away (double-tap zoom is off while a tool is in use). */
  quickTaps?: boolean;
  onPress?: (c: Coord) => void;
  onLongPress?: (c: Coord) => void;
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
  {
    data,
    players,
    hill,
    draft,
    drawings,
    selectedId,
    onDrawingPress,
    onDrawingMove,
    toolDraft,
    quickTaps,
    onPress,
    onLongPress,
    onViewChange,
    showsUserLocation,
    style,
  },
  ref,
) {
  const map = useRef<MapView>(null);
  // Tapping a drawing can also reach the map's own onPress; ignore that echo.
  const lastDrawingPress = useRef(0);
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
      zoomTapEnabled={!quickTaps}
      toolbarEnabled={false}
      onPress={
        onPress
          ? (e) => {
              const action = (e.nativeEvent as { action?: string }).action;
              if (action === 'marker-press' || action === 'polyline-press' || action === 'polygon-press') return;
              if (Date.now() - lastDrawingPress.current < 400) return;
              onPress({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude });
            }
          : undefined
      }
      onLongPress={
        onLongPress
          ? (e) => onLongPress({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })
          : undefined
      }
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

      {drawings?.map((d) => (
        <Drawing
          key={d.key ?? d.id}
          d={d}
          selected={d.id === selectedId}
          onPress={
            onDrawingPress
              ? () => {
                  lastDrawingPress.current = Date.now();
                  onDrawingPress(d.id);
                }
              : undefined
          }
          onMove={onDrawingMove ? (pts) => onDrawingMove(d.id, pts) : undefined}
        />
      ))}

      {toolDraft && toolDraft.points.length > 0 && (
        <>
          {toolDraft.points.length > 1 && (
            <Polyline
              coordinates={[...toolDraft.points, ...(toolDraft.closed && toolDraft.points.length > 2 ? [toolDraft.points[0]] : [])].map(toLatLng)}
              strokeColor={toolDraft.colour}
              strokeWidth={3}
              lineDashPattern={[6, 4]}
              zIndex={20}
            />
          )}
          {toolDraft.points.map((c, i) => (
            <Marker
              key={`tool-${i}-${toolDraft.numbered}`}
              coordinate={toLatLng(c)}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              zIndex={21}
            >
              {toolDraft.numbered ? (
                <View style={[styles.waypoint, { borderColor: toolDraft.colour }]}>
                  <Text style={styles.waypointText}>{i + 1}</Text>
                </View>
              ) : (
                <View style={[styles.corner, { borderColor: toolDraft.colour }]} />
              )}
            </Marker>
          ))}
        </>
      )}

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

/** #RRGGBB → rgba(r,g,b,a). */
function fade(hex: string, alpha: number) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}

/** Two short strokes making an arrowhead at the end of a line. */
function arrowHead(points: Coord[], size: number) {
  const end = points[points.length - 1];
  const b = bearing(points[points.length - 2], end);
  return [offset(end, size, b + Math.PI - 0.5), end, offset(end, size, b + Math.PI + 0.5)];
}

/** Short ticks along a defence line, on the side facing the enemy (left of travel). */
function defenceTicks(points: Coord[]) {
  const ticks: Coord[][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dir = bearing(a, b);
    for (const t of [0.25, 0.5, 0.75]) {
      const mid = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
      ticks.push([mid, offset(mid, 6, dir - Math.PI / 2)]);
    }
  }
  return ticks;
}

function Drawing({
  d,
  selected,
  onPress,
  onMove,
}: {
  d: MapDrawing;
  selected: boolean;
  onPress?: () => void;
  onMove?: (points: Coord[]) => void;
}) {
  const dash = d.enemy ? [8, 6] : undefined;
  const look = `${d.colour}-${d.age ?? ''}-${d.label ?? ''}-${selected}`;
  // Let a custom marker paint before freezing it, or Android can show it late or blank.
  const [painted, setPainted] = useState('');
  const painting = painted !== look;
  useEffect(() => {
    const t = setTimeout(() => setPainted(look), 600);
    return () => clearTimeout(t);
  }, [look]);
  const drag = d.movable && onMove;
  // Corner handles to reshape a selected line or area.
  const handles =
    selected && drag && d.kind !== 'marker' && d.kind !== 'label'
      ? d.points.map((c, i) => (
          <Marker
            key={`h-${d.id}-${i}-${c.lat}-${c.lng}`}
            coordinate={toLatLng(c)}
            anchor={{ x: 0.5, y: 0.5 }}
            draggable
            onDragEnd={(e) => {
              const next = [...d.points];
              next[i] = { lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude };
              onMove(next);
            }}
            tracksViewChanges={painting}
            zIndex={30}
          >
            <View style={[styles.handle, { borderColor: d.colour }]} />
          </Marker>
        ))
      : null;

  if (d.kind === 'marker' || d.kind === 'label') {
    return (
      <Marker
        key={`${d.id}-${look}`}
        coordinate={toLatLng(d.points[0])}
        anchor={{ x: 0.5, y: d.kind === 'marker' ? 0.3 : 0.5 }}
        draggable={!!drag}
        onDragEnd={drag ? (e) => onMove([{ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude }]) : undefined}
        onPress={onPress}
        tracksViewChanges={painting}
        zIndex={12}
      >
        {d.kind === 'marker' ? (
          <View style={styles.drawingMarker}>
            <View
              style={[
                styles.markerFrame,
                { backgroundColor: d.colour, borderStyle: d.enemy ? 'dashed' : 'solid' },
                selected && styles.markerSelected,
              ]}
            >
              <MaterialCommunityIcons name={(d.icon ?? 'account') as never} size={20} color={colours.onAccent} />
            </View>
            {(d.label || d.age) && (
              <Text style={styles.markerCaption} numberOfLines={1}>
                {[d.label, d.age].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
        ) : (
          <View style={[styles.labelBox, { backgroundColor: d.colour }, selected && styles.markerSelected]}>
            <Text style={styles.labelText} numberOfLines={2}>
              {d.label}
            </Text>
          </View>
        )}
      </Marker>
    );
  }

  const coords = d.points.map(toLatLng);
  const width = d.kind === 'defence' ? 5 : d.kind === 'attack' ? 4 : 3;
  return (
    <>
      {d.kind === 'area' ? (
        <Polygon
          coordinates={coords}
          strokeColor={d.colour}
          fillColor={fade(d.colour, selected ? 0.45 : 0.3)}
          strokeWidth={selected ? 4 : 2}
          lineDashPattern={dash}
          tappable
          onPress={onPress}
          zIndex={8}
        />
      ) : (d.kind !== 'waypoints' || d.linked) && (
        <Polyline
          coordinates={coords}
          strokeColor={d.colour}
          strokeWidth={selected ? width + 2 : width}
          lineDashPattern={dash ?? (d.kind === 'waypoints' ? [4, 6] : undefined)}
          tappable
          onPress={onPress}
          zIndex={9}
        />
      )}
      {(d.kind === 'arrow' || d.kind === 'attack') && (
        <Polyline coordinates={arrowHead(d.points, d.kind === 'attack' ? 14 : 10).map(toLatLng)} strokeColor={d.colour} strokeWidth={width} zIndex={9} />
      )}
      {d.kind === 'defence' &&
        defenceTicks(d.points).map((t, i) => (
          <Polyline key={`t-${d.id}-${i}`} coordinates={t.map(toLatLng)} strokeColor={d.colour} strokeWidth={3} zIndex={9} />
        ))}
      {d.kind === 'waypoints' &&
        d.points.map((c, i) => (
          <Marker
            key={`w-${d.id}-${i}-${look}`}
            coordinate={toLatLng(c)}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={onPress}
            tracksViewChanges={painting}
            zIndex={11}
          >
            <View style={[styles.waypoint, { backgroundColor: d.colour, borderStyle: d.enemy ? 'dashed' : 'solid' }]}>
              <Text style={[styles.waypointText, { color: colours.onAccent }]}>{i + 1}</Text>
            </View>
          </Marker>
        ))}
      {d.label && d.kind !== 'waypoints' && (
        <Marker
          key={`l-${d.id}-${look}`}
          coordinate={toLatLng(d.kind === 'area' ? centroid(d.points) : d.points[d.points.length - 1])}
          anchor={{ x: 0.5, y: d.kind === 'area' ? 0.5 : -0.3 }}
          onPress={onPress}
          tracksViewChanges={painting}
          zIndex={11}
        >
          <Text style={[styles.markerCaption, { backgroundColor: d.colour, color: colours.onAccent }]}>{d.label}</Text>
        </Marker>
      )}
      {handles}
    </>
  );
}

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
  drawingMarker: { alignItems: 'center', maxWidth: 140 },
  markerFrame: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colours.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerSelected: { borderWidth: 3, borderColor: colours.text, transform: [{ scale: 1.15 }] },
  markerCaption: {
    color: colours.text,
    fontFamily: fonts.medium,
    fontSize: 11,
    backgroundColor: 'rgba(11,16,12,0.8)',
    paddingHorizontal: 4,
    borderRadius: 4,
    marginTop: 2,
  },
  labelBox: {
    borderColor: colours.background,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    maxWidth: 180,
  },
  labelText: { color: colours.onAccent, fontFamily: fonts.semibold, fontSize: 13 },
  waypoint: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colours.background,
    backgroundColor: 'rgba(11,16,12,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waypointText: { color: colours.text, fontFamily: fonts.semibold, fontSize: 11 },
  handle: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, backgroundColor: colours.text },
});
