// Live positions you're allowed to see (your team, or everyone if you host
// without a team). The database filters rows, so other teams' positions never
// reach this phone (supabase/migrations/0004_games.sql, can_see_position).
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface Position {
  user_id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  recorded_at: string;
}

/** Older than this shows greyed with its age. */
export const STALE_MS = 60_000;
/** Older than this is hidden. */
export const HIDDEN_MS = 15 * 60_000;

export function usePositions(dayId: string, refreshKey: unknown) {
  const [positions, setPositions] = useState<Record<string, Position>>({});

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      supabase
        .from('positions')
        .select('user_id, lat, lng, accuracy, recorded_at')
        .eq('game_day_id', dayId)
        .then(({ data }) => {
          if (cancelled || !data) return;
          const next: Record<string, Position> = {};
          for (const p of data as Position[]) next[p.user_id] = p;
          setPositions(next);
        });
    load();
    const channel = supabase
      .channel(`positions:${dayId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'positions', filter: `game_day_id=eq.${dayId}` },
        (change) => {
          if (change.eventType === 'DELETE') {
            const old = change.old as Partial<Position>;
            if (old.user_id) {
              setPositions((prev) => {
                const next = { ...prev };
                delete next[old.user_id as string];
                return next;
              });
            } else load();
            return;
          }
          const p = change.new as Position;
          setPositions((prev) => ({ ...prev, [p.user_id]: p }));
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // refreshKey changes when members or teams change, so visibility is re-read.
  }, [dayId, refreshKey]);

  return positions;
}

export function ageLabel(ms: number) {
  return `${Math.max(1, Math.round(ms / 60_000))} min ago`;
}
