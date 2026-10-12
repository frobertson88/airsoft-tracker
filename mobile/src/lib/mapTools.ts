// Map drawings: markers, labels, waypoints, arrows, lines and areas that players
// share with their section or team (docs/map-toolbar.md, docs/map-marker-targeting.md).
// The database only sends drawings meant for you (supabase/migrations/0008_map_objects.sql).
import { useEffect, useRef, useState } from 'react';
import type { Coord } from './field';
import { supabase } from './supabase';

export type Affiliation = 'friendly' | 'enemy';
export type Audience = 'team' | 'section' | 'admin';
export type DrawKind = 'label' | 'waypoints' | 'arrow' | 'line' | 'area' | 'defence' | 'attack';
export type MapObjectKind = 'marker' | DrawKind;

export interface MapObject {
  id: string;
  game_day_id: string;
  kind: MapObjectKind;
  marker_type: string | null;
  affiliation: Affiliation;
  audience: Audience;
  team_id: string | null;
  section_id: string | null;
  colour_team_id: string | null;
  label: string | null;
  points: Coord[];
  linked: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Who a new drawing is for. */
export interface Target {
  audience: Audience;
  team_id: string | null;
  section_id: string | null;
}

export interface MarkerType {
  id: string;
  name: string;
  /** MaterialCommunityIcons name. */
  icon: string;
  affiliations: Affiliation[];
}

export const MARKERS: MarkerType[] = [
  { id: 'infantry', name: 'Infantry', icon: 'account', affiliations: ['friendly', 'enemy'] },
  { id: 'recon', name: 'Recon', icon: 'binoculars', affiliations: ['friendly'] },
  { id: 'mg', name: 'MG', icon: 'ammunition', affiliations: ['friendly', 'enemy'] },
  { id: 'sniper', name: 'Sniper', icon: 'crosshairs-gps', affiliations: ['friendly', 'enemy'] },
  { id: 'leader', name: 'Leader', icon: 'star', affiliations: ['friendly'] },
  { id: '2ic', name: '2IC', icon: 'star-half-full', affiliations: ['friendly'] },
  { id: 'fob', name: 'FOB', icon: 'tent', affiliations: ['friendly', 'enemy'] },
  { id: 'rally', name: 'Rally', icon: 'flag-triangle', affiliations: ['friendly', 'enemy'] },
  { id: 'drone', name: 'Drone', icon: 'quadcopter', affiliations: ['enemy'] },
  { id: 'vehicle', name: 'Vehicle', icon: 'truck', affiliations: ['enemy'] },
  { id: 'package', name: 'Package', icon: 'package-variant', affiliations: ['enemy'] },
];
export const markerType = (id: string | null) => MARKERS.find((m) => m.id === id) ?? MARKERS[0];
export const markersFor = (a: Affiliation) => MARKERS.filter((m) => m.affiliations.includes(a));

export interface DrawTool {
  kind: DrawKind;
  name: string;
  icon: string;
  /** Points needed before Finish; the tool finishes itself at max. */
  min: number;
  max: number;
  hint: string;
}

export const DRAW_TOOLS: DrawTool[] = [
  { kind: 'label', name: 'Label', icon: 'format-text', min: 1, max: 1, hint: 'Tap the map where the label goes' },
  { kind: 'waypoints', name: 'Waypoints', icon: 'map-marker-path', min: 2, max: 50, hint: 'Tap each waypoint in order' },
  { kind: 'arrow', name: 'Arrow', icon: 'arrow-top-right', min: 2, max: 2, hint: 'Tap the start, then the end' },
  { kind: 'line', name: 'Line', icon: 'vector-line', min: 2, max: 50, hint: 'Tap each point of the line' },
  { kind: 'area', name: 'Area', icon: 'vector-square', min: 3, max: 50, hint: 'Tap the corners of the area' },
  { kind: 'defence', name: 'Defence line', icon: 'shield-half-full', min: 2, max: 50, hint: 'Tap each point of the line' },
  { kind: 'attack', name: 'Attack line', icon: 'sword-cross', min: 2, max: 50, hint: 'Tap each point, ending at the objective' },
];
export const drawTool = (k: DrawKind) => DRAW_TOOLS.find((t) => t.kind === k) ?? DRAW_TOOLS[0];

export const objectName = (o: Pick<MapObject, 'kind' | 'marker_type'>) =>
  o.kind === 'marker' ? markerType(o.marker_type).name : drawTool(o.kind).name;

/** Enemy sightings disappear this long after they were reported. */
export const SIGHTING_MS = 30 * 60_000;

/** "4m", "1h 2m": the quiet age beside a sighting. */
export function sightingAge(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Is a point inside a polygon? (Flat-earth is fine at field size.) */
export function insidePolygon(p: Coord, poly: Coord[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) {
      inside = !inside;
    }
  }
  return inside;
}

/** The point `metres` from `from` at `bearing` radians (0 = north). */
export function offset(from: Coord, metres: number, bearing: number): Coord {
  const kx = 111320 * Math.cos((from.lat * Math.PI) / 180);
  return { lat: from.lat + (metres * Math.cos(bearing)) / 110540, lng: from.lng + (metres * Math.sin(bearing)) / kx };
}

/** Bearing (radians, 0 = north) from a to b. */
export function bearing(a: Coord, b: Coord) {
  const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.atan2((b.lng - a.lng) * kx, (b.lat - a.lat) * 110540);
}

/** The drawings you can see in a Game Day, kept live. `refreshKey` re-reads them
 * when what you're allowed to see changes (team, section, Host view). */
export function useMapObjects(dayId: string, refreshKey: unknown) {
  const [objects, setObjects] = useState<MapObject[]>([]);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      supabase
        .from('map_objects')
        .select('*')
        .eq('game_day_id', dayId)
        .order('created_at')
        .then(({ data }) => {
          if (!cancelled && data) setObjects(data as MapObject[]);
        });
    const schedule = () => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(load, 200);
    };
    load();
    const channel = supabase
      .channel(`map_objects:${dayId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_objects', filter: `game_day_id=eq.${dayId}` }, schedule)
      .subscribe();
    return () => {
      cancelled = true;
      if (pending.current) clearTimeout(pending.current);
      supabase.removeChannel(channel);
    };
  }, [dayId, refreshKey]);

  return { objects, setObjects };
}
