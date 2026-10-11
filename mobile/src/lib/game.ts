// Game lifecycle and clock (supabase/migrations/0004_games.sql). The backend is
// the source of truth; phones project the clock forward between updates and
// call tick_game when a countdown or a timed game should have moved on.
import { useEffect, useState } from 'react';

export type GameState = 'ready' | 'countdown' | 'live' | 'paused' | 'resuming' | 'complete';

export interface Game {
  id: string;
  game_day_id: string;
  name: string;
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

export function formatLength(g: Pick<Game, 'length_seconds' | 'countdown_seconds'>) {
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
