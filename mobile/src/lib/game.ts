// Game lifecycle and clock (supabase/migrations/0004_games.sql). The backend is
// the source of truth; phones project the clock forward between updates and
// call tick_game when a countdown or a timed game should have moved on.
import { useEffect, useState } from 'react';
import type { MedicSettings } from './medic';
import type { PatrolSettings } from './patrol';

export type GameState = 'ready' | 'countdown' | 'live' | 'paused' | 'resuming' | 'complete';

export type GameMode = 'free' | 'koth' | 'patrol';

export const MODE_LABEL: Record<GameMode, string> = {
  free: 'Free play',
  koth: 'King of the Hill',
  patrol: 'Patrol',
};

/** KOTH settings as stored (supabase/migrations/0005_koth.sql fills defaults). */
export interface KothSettings {
  /** Any mode: teams in use, 2–4. */
  team_count?: number;
  radius: number;
  scoring: boolean;
  rate: number;
  relocate_minutes: number | null;
  /** Any mode: the medic rules copied into this game, or null for off. */
  medic?: MedicSettings | null;
  /** Patrol games: field, missions and options (lib/patrol.ts). */
  patrol?: PatrolSettings;
}

export const KOTH_DEFAULTS: KothSettings = { radius: 25, scoring: true, rate: 1, relocate_minutes: null };

export interface Game {
  id: string;
  game_day_id: string;
  name: string;
  mode: GameMode;
  settings: Partial<KothSettings>;
  length_seconds: number | null;
  countdown_seconds: number;
  extra_seconds: number;
  state: GameState;
  active_seconds: number | string;
  live_since: string | null;
  countdown_ends_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  end_reason: 'ended' | 'time' | null;
  created_at: string;
}

export const STATE_LABEL: Record<GameState, string> = {
  ready: 'Ready',
  countdown: 'Starting',
  live: 'Live',
  paused: 'Paused',
  resuming: 'Resuming',
  complete: 'Game over',
};

export interface Clock {
  /** Where the game should be now, which may be ahead of the stored state. */
  state: GameState;
  /** Seconds of active play so far. */
  elapsed: number;
  /** Seconds left for timed games, else null. */
  remaining: number | null;
  /** Seconds left on a start or resume countdown, else null. */
  countdown: number | null;
}

const ms = (iso: string | null) => (iso ? Date.parse(iso) : 0);

export function clockFor(g: Game, now: number): Clock {
  let state = g.state;
  let active = Number(g.active_seconds);
  let liveSince = ms(g.live_since);
  const total = g.length_seconds === null ? null : g.length_seconds + g.extra_seconds;

  if ((state === 'countdown' || state === 'resuming') && g.countdown_ends_at && now >= ms(g.countdown_ends_at)) {
    state = 'live';
    liveSince = ms(g.countdown_ends_at);
  }
  let elapsed = active;
  if (state === 'live') elapsed = active + Math.max(0, (now - liveSince) / 1000);
  if (state === 'live' && total !== null && elapsed >= total) {
    state = 'complete';
    elapsed = total;
  }
  if (state === 'complete') active = elapsed;

  const countdown =
    (state === 'countdown' || state === 'resuming') && g.countdown_ends_at
      ? Math.max(0, (ms(g.countdown_ends_at) - now) / 1000)
      : null;
  return { state, elapsed, remaining: total === null ? null : Math.max(0, total - elapsed), countdown };
}

export function formatClock(seconds: number) {
  const s = Math.ceil(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

export function formatLength(g: Pick<Game, 'length_seconds' | 'countdown_seconds'>): string {
  const length = g.length_seconds === null ? 'Unlimited' : `${Math.round(g.length_seconds / 60)} min`;
  const cd = g.countdown_seconds
    ? g.countdown_seconds >= 60
      ? `${Math.round(g.countdown_seconds / 60)} min countdown`
      : `${g.countdown_seconds}s countdown`
    : 'No countdown';
  return `${length} · ${cd}`;
}

// Difference between the server's clock and this phone's, set once per day load.
let offsetMs = 0;
export function setServerOffset(serverIso: string, sentAt: number, receivedAt: number) {
  offsetMs = Date.parse(serverIso) - (sentAt + receivedAt) / 2;
}
export const serverNow = () => Date.now() + offsetMs;

/** Server-corrected time, refreshed every `everyMs`. */
export function useServerNow(everyMs = 1000) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

/** The hill and who holds it (one row per started KOTH game). */
export interface KothState {
  game_id: string;
  hill_lat: number;
  hill_lng: number;
  hill_number: number;
  placed_active: number | string;
  last_active: number | string;
  control: 'empty' | 'held' | 'contested';
  holder_team_id: string | null;
  counts: Record<string, number>;
  scores: Record<string, number | string>;
  unknown: number;
  result: 'win' | 'draw' | 'none' | null;
  winner_team_id: string | null;
}

export function kothSettings(g: Game): KothSettings {
  return { ...KOTH_DEFAULTS, ...g.settings };
}

/** Scores now: stored scores plus what the holder has earned since they were stored. */
export function kothScores(k: KothState, g: Game, elapsed: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [team, pts] of Object.entries(k.scores)) out[team] = Number(pts);
  const s = kothSettings(g);
  if (!k.result && s.scoring && k.control === 'held' && k.holder_team_id) {
    const extra = Math.max(0, elapsed - Number(k.last_active)) * s.rate;
    out[k.holder_team_id] = (out[k.holder_team_id] ?? 0) + extra;
  }
  return out;
}

export function describeSettings(mode: GameMode, s: Partial<KothSettings>) {
  const teams = `${s.team_count ?? 2} teams`;
  const medic = s.medic ? `Medic: ${s.medic.name}` : null;
  if (mode === 'patrol') {
    const n = s.patrol?.missions.length ?? 0;
    return [MODE_LABEL.patrol, teams, `${n} ${n === 1 ? 'mission' : 'missions'}`, medic].filter(Boolean).join(' · ');
  }
  if (mode !== 'koth') return [MODE_LABEL.free, teams, medic].filter(Boolean).join(' · ');
  const k = { ...KOTH_DEFAULTS, ...s };
  return [
    MODE_LABEL.koth,
    teams,
    `${k.radius} m hill`,
    k.relocate_minutes ? `moves every ${k.relocate_minutes} min` : 'fixed hill',
    k.scoring ? null : 'no scoring',
    medic,
  ]
    .filter(Boolean)
    .join(' · ');
}
