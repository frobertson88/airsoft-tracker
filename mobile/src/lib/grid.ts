// Map grid for a field (plans: Patrol, clues and grids). Like a military map:
// squares numbered on both axes from the field's south-west corner, eastings
// (west to east) first, then northings (south to north), two digits each.
// "0412" is a 100 m square; "041127" narrows it to 10 m.
import type { Coord, FieldData } from './field';

export const GRID_METRES = 100;
const M_PER_DEG = 111320;

/** South-west corner of the field's boundary (or its points), or null. */
export function gridOrigin(data: FieldData): Coord | null {
  const all = data.boundary.length ? data.boundary : data.points;
  if (!all.length) return null;
  return { lat: Math.min(...all.map((c) => c.lat)), lng: Math.min(...all.map((c) => c.lng)) };
}

/** Metres east and north of the origin. */
function offset(origin: Coord, c: Coord) {
  return {
    east: (c.lng - origin.lng) * M_PER_DEG * Math.cos((origin.lat * Math.PI) / 180),
    north: (c.lat - origin.lat) * M_PER_DEG,
  };
}

const pad = (n: number, width: number) => String(Math.max(0, Math.floor(n))).padStart(width, '0').slice(-width);

/** The grid reference of a spot: 4 figures (100 m) or 6 figures (10 m). */
export function gridRef(data: FieldData, c: Coord, figures: 4 | 6 = 4): string {
  const origin = gridOrigin(data);
  if (!origin) return '';
  const { east, north } = offset(origin, c);
  if (figures === 4) return pad(east / GRID_METRES, 2) + pad(north / GRID_METRES, 2);
  return pad((east / GRID_METRES) * 10, 3) + pad((north / GRID_METRES) * 10, 3);
}

export interface GridLine {
  /** Square number this line starts (its label). */
  n: number;
  points: [Coord, Coord];
}

/** Grid lines covering the field: vertical (eastings) and horizontal (northings). */
export function gridLines(data: FieldData): { eastings: GridLine[]; northings: GridLine[] } {
  const origin = gridOrigin(data);
  const all = data.boundary.length ? data.boundary : data.points;
  if (!origin || !all.length) return { eastings: [], northings: [] };
  const ne = { lat: Math.max(...all.map((c) => c.lat)), lng: Math.max(...all.map((c) => c.lng)) };
  const { east, north } = offset(origin, ne);
  const cols = Math.min(60, Math.ceil(east / GRID_METRES));
  const rows = Math.min(60, Math.ceil(north / GRID_METRES));
  const lngPer = GRID_METRES / (M_PER_DEG * Math.cos((origin.lat * Math.PI) / 180));
  const latPer = GRID_METRES / M_PER_DEG;
  const top = origin.lat + rows * latPer;
  const right = origin.lng + cols * lngPer;
  const eastings: GridLine[] = [];
  const northings: GridLine[] = [];
  for (let i = 0; i <= cols; i++) {
    const lng = origin.lng + i * lngPer;
    eastings.push({ n: i, points: [{ lat: origin.lat, lng }, { lat: top, lng }] });
  }
  for (let j = 0; j <= rows; j++) {
    const lat = origin.lat + j * latPer;
    northings.push({ n: j, points: [{ lat, lng: origin.lng }, { lat, lng: right }] });
  }
  return { eastings, northings };
}

export const gridLabel = (n: number) => pad(n, 2);
