// Tag library (plans: Patrol and tag library, 24 October 2026). A tag is a
// short code like AT-7F2K printed as a QR (later written to an NFC tag) that
// stands for one thing. Phase 1: field points.
import type { FieldPoint } from './field';

export interface PointTag {
  point_id: string;
  code: string;
}

/** What lookup_tag says a scanned code stands for. */
export interface TagLookup {
  code: string;
  known: boolean;
  /** The tag is yours (you own its field). */
  mine: boolean;
  field?: string;
  /** Null when the point has since been removed from the field. */
  point?: FieldPoint | null;
}

const TAG = /^AT-[0-9A-HJKMNP-TV-Z]{5}$/;

/** The tag code in a scanned QR, or null if it isn't one of ours. */
export function parseTag(text: string): string | null {
  const code = text.trim().toUpperCase();
  return TAG.test(code) ? code : null;
}
