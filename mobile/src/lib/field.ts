// Field Library shapes (docs/field-library.md). Mirrors the checks in
// supabase/migrations/0003_fields.sql so the editor can explain problems
// before the backend refuses a save.

export interface Coord {
  lat: number;
  lng: number;
}

export interface FieldView extends Coord {
  latDelta: number;
  lngDelta: number;
}

export type AreaKind = 'nogo' | 'danger';
export type PointKind = 'staging' | 'respawn' | 'base' | 'marshal' | 'other';

export interface FieldArea {
  kind: AreaKind;
  name: string;
  note: string;
  points: Coord[];
}

export interface FieldPoint extends Coord {
  kind: PointKind;
  label: string;
}

export interface FieldData {
  view: FieldView;
  boundary: Coord[];
  areas: FieldArea[];
  points: FieldPoint[];
}

export interface SavedField {
  id: string;
  owner_id: string;
  name: string;
  location: string | null;
  notes: string | null;
  data: FieldData;
  revision: number;
  archived: boolean;
  updated_at: string;
}

/** The Game Day's copy of a field, taken when an admin picked it. */
export interface DayField {
  game_day_id: string;
  field_id: string | null;
  field_revision: number;
  name: string;
  location: string | null;
  notes: string | null;
  data: FieldData;
  selected_at: string;
}

export const AREA_LABELS: Record<AreaKind, string> = { nogo: 'No-go', danger: 'Danger' };

export const POINT_KINDS: { kind: PointKind; label: string; icon: string }[] = [
  { kind: 'staging', label: 'Staging', icon: 'car-outline' },
  { kind: 'respawn', label: 'Respawn', icon: 'refresh-outline' },
  { kind: 'base', label: 'Base', icon: 'flag-outline' },
  { kind: 'marshal', label: 'Marshal', icon: 'shield-checkmark-outline' },
  { kind: 'other', label: 'Other', icon: 'location-outline' },
];

/** New Zealand, for a first-time editor with no location to start from. */
export const DEFAULT_VIEW: FieldView = { lat: -41.2, lng: 174.4, latDelta: 9, lngDelta: 9 };

function cross(a: Coord, b: Coord, c: Coord, d: Coord) {
  const d1 = (d.lng - c.lng) * (a.lat - c.lat) - (d.lat - c.lat) * (a.lng - c.lng);
  const d2 = (d.lng - c.lng) * (b.lat - c.lat) - (d.lat - c.lat) * (b.lng - c.lng);
  const d3 = (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
  const d4 = (b.lng - a.lng) * (d.lat - a.lat) - (b.lat - a.lat) * (d.lng - a.lng);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Why a shape can't be saved, or null if it's fine. */
export function polygonProblem(points: Coord[]): string | null {
  if (points.length < 3) return 'Add at least 3 corners.';
  if (points.length > 200) return 'Use 200 corners or fewer.';
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (cross(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) {
        return 'The edges cross each other. Undo and place the corners in order around the shape.';
      }
    }
  }
  return null;
}

export function centroid(points: Coord[]): Coord {
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  return { lat, lng };
}

/** A view that fits the given points with some margin. */
export function viewFor(points: Coord[], fallback: FieldView): FieldView {
  if (points.length === 0) return fallback;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
    latDelta: Math.max((maxLat - minLat) * 1.4, 0.002),
    lngDelta: Math.max((maxLng - minLng) * 1.4, 0.002),
  };
}
