// Loads one Game Day (teams, sections, members, callsigns) and keeps it fresh
// via Supabase Realtime plus a refetch when the app returns to the foreground.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { friendlyError } from './api';
import { useAuth } from './auth';
import { supabase } from './supabase';
import type { DayField } from './field';
import { setServerOffset, type Game, type KothState } from './game';
import type { PatrolTeam } from './patrol';
import type { DayMember, GameDay, Section, Team } from './types';

export interface DayData {
  day: GameDay;
  /** Teams in use for the next or current game. */
  teams: Team[];
  /** Every team the day has had, including ones no longer used (for past results). */
  allTeams: Team[];
  sections: Section[];
  members: DayMember[];
  callsigns: Record<string, string>;
  /** The field picked for this day, or null until an admin picks one. */
  field: DayField | null;
  /** The latest game (unfinished, or the one that just ended), or null. */
  game: Game | null;
  /** The hill for a started King of the Hill game, else null. */
  koth: KothState | null;
  /** Each team's progress in a started Patrol game, else empty. */
  patrol: PatrolTeam[];
}

interface DayState {
  id: string;
  data: DayData | null;
  error: string;
  me: DayMember | null;
  isAdmin: boolean;
  /** Admins manage the day from the Host tab; there is no separate view switch. */
  adminMode: boolean;
  reload: () => Promise<void>;
  callsign: (userId: string) => string;
  teamById: (id: string | null) => Team | undefined;
  sectionById: (id: string | null) => Section | undefined;
}

const DayContext = createContext<DayState | null>(null);

async function fetchDay(id: string): Promise<DayData> {
  const [day, teams, sections, members, field, game] = await Promise.all([
    supabase.from('game_days').select('*').eq('id', id).single(),
    supabase.from('teams').select('*').eq('game_day_id', id).order('sort_order'),
    supabase.from('sections').select('*').eq('game_day_id', id).order('created_at'),
    supabase.from('day_members').select('*').eq('game_day_id', id).order('joined_at'),
    supabase.from('day_fields').select('*').eq('game_day_id', id).maybeSingle(),
    supabase.from('games').select('*').eq('game_day_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  // A missing day_fields table (migration not run yet) just means no field.
  const err = day.error ?? teams.error ?? sections.error ?? members.error;
  if (err) throw new Error(err.message);

  const latest = (game.data ?? null) as Game | null;
  const koth =
    latest?.mode === 'koth'
      ? await supabase.from('koth_state').select('*').eq('game_id', latest.id).maybeSingle()
      : { data: null };
  const patrol =
    latest?.mode === 'patrol'
      ? await supabase.from('patrol_teams').select('*').eq('game_id', latest.id)
      : { data: [] };

  const ids = (members.data ?? []).map((m) => m.user_id);
  const profiles = ids.length
    ? await supabase.from('profiles').select('id, callsign').in('id', ids)
    : { data: [] as { id: string; callsign: string }[] };
  const callsigns: Record<string, string> = {};
  for (const p of profiles.data ?? []) callsigns[p.id] = p.callsign;

  return {
    day: day.data as GameDay,
    teams: ((teams.data ?? []) as Team[]).filter((t) => t.active !== false),
    allTeams: (teams.data ?? []) as Team[],
    sections: (sections.data ?? []) as Section[],
    members: (members.data ?? []) as DayMember[],
    callsigns,
    field: (field.data ?? null) as DayField | null,
    game: latest,
    koth: (koth.data ?? null) as KothState | null,
    patrol: (patrol.data ?? []) as PatrolTeam[],
  };
}

export function DayProvider({ id, children }: { id: string; children: ReactNode }) {
  const { session } = useAuth();
  const [data, setData] = useState<DayData | null>(null);
  const [error, setError] = useState('');
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await fetchDay(id));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the Game Day.');
    }
  }, [id]);

  // Coalesce bursts of realtime events into one refetch.
  const scheduleReload = useCallback(() => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(reload, 250);
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    const sentAt = Date.now();
    supabase
      .rpc('server_now')
      .then(({ data: now }) => now && setServerOffset(now as string, sentAt, Date.now()));
    fetchDay(id)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load the Game Day.'));
    const filter = `game_day_id=eq.${id}`;
    const channel = supabase
      .channel(`day:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_members', filter }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sections', filter }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_fields', filter }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'koth_state', filter }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patrol_teams', filter }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_days', filter: `id=eq.${id}` }, scheduleReload)
      .subscribe();
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') reload();
    });
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      appState.remove();
      if (pending.current) clearTimeout(pending.current);
    };
  }, [id, reload, scheduleReload]);

  const value = useMemo<DayState>(() => {
    const me = data?.members.find((m) => m.user_id === session?.user.id) ?? null;
    const isAdmin = !!me && me.status === 'active' && me.is_admin;
    return {
      id,
      data,
      error,
      me,
      isAdmin,
      adminMode: isAdmin,
      reload,
      callsign: (userId) => data?.callsigns[userId] ?? 'Player',
      teamById: (teamId) => data?.allTeams.find((t) => t.id === teamId),
      sectionById: (sectionId) => data?.sections.find((s) => s.id === sectionId),
    };
  }, [id, data, error, session, reload]);

  return <DayContext.Provider value={value}>{children}</DayContext.Provider>;
}

export function useDay() {
  const ctx = useContext(DayContext);
  if (!ctx) throw new Error('useDay outside DayProvider');
  return ctx;
}

/** Run a command, then refetch so the UI never waits on realtime alone. */
export function useCommand() {
  const { reload } = useDay();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError('');
      try {
        await fn();
        await reload();
        return true;
      } catch (e) {
        setError(friendlyError(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );
  return { run, busy, error, setError };
}
