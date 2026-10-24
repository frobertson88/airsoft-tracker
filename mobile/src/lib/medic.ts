// Hits and medic rules (supabase/migrations/0009_medic.sql, plans/medic-proposal.md).
// Rule sets live in a library like Fields; a game copies one into settings.medic.
// During play the hit player shows a QR code and a helper scans it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import { useAuth } from './auth';
import { clockFor, type Game } from './game';
import { supabase } from './supabase';

export type Helper = 'medic' | 'teammate' | 'lead' | 'admin';
export const HELPERS: { helper: Helper; label: string }[] = [
  { helper: 'medic', label: 'Medic' },
  { helper: 'teammate', label: 'Any teammate' },
  { helper: 'lead', label: 'Section lead' },
  { helper: 'admin', label: 'Admin' },
];

export interface Wound {
  name: string;
  instruction: string;
  helpers: Helper[];
  /** Random wounds only: weighed against the other wounds (1–100). */
  chance?: number;
  /** Random wounds only: dead at once; bringing back follows the Dead hit. */
  fatal?: boolean;
}

/**
 * Three hits (the last is death) and what happens when bleed-out reaches zero.
 * A random set (0011_random_wounds.sql) also has a wound list: each hit before
 * dead_on picks one by chance.
 */
export interface MedicRules {
  hits: Wound[];
  expiry: 'dead' | 'wait';
  wounds?: Wound[];
  dead_on?: number;
}

export interface MedicRuleset {
  id: string;
  /** null for the built-in starter sets, which can be copied but not changed. */
  owner_id: string | null;
  name: string;
  rules: MedicRules;
  sort_order: number;
}

/** What a game stores in settings.medic. */
export interface MedicSettings extends MedicRules {
  name: string;
  bleed_minutes: number;
}

export const EXPIRY_LABEL: Record<MedicRules['expiry'], string> = {
  dead: 'Dead at bleed-out',
  wait: 'Wait for help at bleed-out',
};

export const HIT_TABS = ['1st hit', '2nd hit', 'Dead'];
export const BLEED_CHOICES = [5, 10, 15, 20, 30];
export const DEAD_ON_CHOICES = [2, 3, 4, 5];
export const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th'];

export const isRandom = (r: MedicRules) => !!r.wounds?.length;

/** Each random wound's chance as a whole percentage. */
export function chancePercents(wounds: Wound[]) {
  const total = wounds.reduce((n, w) => n + (w.chance ?? 0), 0);
  return wounds.map((w) => (total ? Math.round(((w.chance ?? 0) * 100) / total) : 0));
}

export function helperText(helpers: Helper[] | undefined) {
  const names = HELPERS.filter((h) => helpers?.includes(h.helper)).map((h) => h.label);
  if (names.length === 0) return 'Nobody';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1].toLowerCase()}`;
}

export function rulesSummary(r: MedicRules) {
  if (!r.wounds?.length) return r.hits.map((h) => h.name).join(' · ');
  const pc = chancePercents(r.wounds);
  const wounds = r.wounds.map((w, i) => `${w.name} ${pc[i]}%`).join(' · ');
  return `Random: ${wounds} · Dead on ${ORDINAL[r.dead_on ?? 3]} hit`;
}

export const settingsFor = (set: MedicRuleset, bleed_minutes = 10): MedicSettings => ({
  name: set.name,
  hits: set.rules.hits,
  expiry: set.rules.expiry,
  ...(set.rules.wounds?.length ? { wounds: set.rules.wounds, dead_on: set.rules.dead_on } : {}),
  bleed_minutes,
});

/** Built-in sets first, then your own by name; plus your default set's id. */
export function useMedicRulesets() {
  const { session } = useAuth();
  const [sets, setSets] = useState<MedicRuleset[] | null>(null);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      Promise.all([
        supabase.from('medic_rulesets').select('id, owner_id, name, rules, sort_order'),
        supabase.from('profiles').select('default_medic_ruleset').eq('id', session!.user.id).maybeSingle(),
      ]).then(([rows, profile]) => {
        if (rows.error) setError(rows.error.message);
        const list = ((rows.data ?? []) as MedicRuleset[]).sort((a, b) =>
          !!a.owner_id !== !!b.owner_id ? (a.owner_id ? 1 : -1) : a.sort_order - b.sort_order || a.name.localeCompare(b.name),
        );
        setSets(list);
        setDefaultId((profile.data?.default_medic_ruleset as string | null) ?? null);
      }),
    [session],
  );
  useEffect(() => {
    load();
  }, [load]);
  /** Your default set, else Standard (the first built-in). */
  const preferred = sets?.find((s) => s.id === defaultId) ?? sets?.[0] ?? null;
  return { sets, defaultId, preferred, error, load };
}

// ---------------------------------------------------------------------------
// In play
// ---------------------------------------------------------------------------

export type MedicStatus = 'in_play' | 'awaiting' | 'wounded' | 'dead';

/** A row of medic_status: what others on your team (and admins) can see. */
export interface MedicStatusRow {
  game_id: string;
  user_id: string;
  status: MedicStatus;
  shown_hit: number | null;
  life: number;
  bleed_until: number | string | null;
  expired: boolean;
  /** The revealed random wound's name (random sets only). */
  shown_wound?: string | null;
}

/** Your own status, with the code your helper scans. */
export interface MyMedic {
  status: MedicStatus;
  shown_hit: number | null;
  life: number;
  bleed_until: number | string | null;
  expired: boolean;
  code: string | null;
  /** Your random wound, once a scan has revealed it. */
  wound?: Wound | null;
}

export interface ScanResult {
  user_id: string;
  hit?: number;
  revealed: boolean;
  allowed: boolean;
  state: 'in_play' | 'wounded' | 'dead' | null;
  wound?: Wound | null;
  helpers?: Helper[];
  bleed_until?: number | string | null;
  expired?: boolean;
}

export const medicOf = (g: Game | null | undefined) => (g?.settings.medic ?? null) as MedicSettings | null;

/** Seconds of bleed-out left, on game time (frozen while paused). */
export function bleedLeft(game: Game, bleedUntil: number | string | null | undefined, now: number) {
  if (bleedUntil === null || bleedUntil === undefined) return null;
  return Math.max(0, Number(bleedUntil) - clockFor(game, now).elapsed);
}

/** The status label: In play, Awaiting medic, or the last revealed wound. */
export function statusLabel(
  s: Pick<MyMedic, 'status' | 'shown_hit'> & { shown_wound?: string | null; wound?: Wound | null },
  medic: MedicSettings | null,
) {
  if (s.status === 'in_play') return 'In play';
  if (s.status === 'awaiting') return 'Awaiting medic';
  if (s.status === 'dead') return 'Dead';
  return s.wound?.name ?? s.shown_wound ?? medic?.hits[(s.shown_hit ?? 1) - 1]?.name ?? 'Wounded';
}

/** The revealed wound you're shown on the Hit view (null while hidden). */
export function myWound(mine: MyMedic, medic: MedicSettings) {
  const dead = medic.hits[medic.hits.length - 1];
  if (mine.status === 'dead') return mine.wound?.fatal ? mine.wound : dead;
  if (mine.status !== 'wounded') return null;
  return mine.wound ?? (mine.shown_hit ? medic.hits[mine.shown_hit - 1] : null);
}

const QR_PREFIX = 'airsoft-medic';
export const encodeCode = (game: string, user: string, code: string) => `${QR_PREFIX}:${game}:${user}:${code}`;
export function decodeCode(text: string) {
  const [prefix, game, user, code] = text.split(':');
  if (prefix !== QR_PREFIX || !game || !user || !code) return null;
  return { game, user, code };
}

const NONE: Record<string, MedicStatusRow> = {};
const IN_PLAY: MyMedic = { status: 'in_play', shown_hit: null, life: 1, bleed_until: null, expired: false, code: null };

/**
 * Everyone's visible medic status for this game, and your own (with your scan
 * code). Kept fresh by realtime and when the app comes back to the front.
 */
export function useMedic(game: Game | null) {
  const medic = medicOf(game);
  const gameId = medic && game ? game.id : null;
  const [statusFor, setStatusFor] = useState<{ game: string; rows: Record<string, MedicStatusRow> } | null>(null);
  const [mineFor, setMineFor] = useState<{ game: string; my: MyMedic } | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    if (!gameId) return Promise.resolve();
    return Promise.all([
      supabase.from('medic_status').select('*').eq('game_id', gameId),
      api.myMedicStatus(gameId).catch(() => null),
    ]).then(([rows, my]) => {
      const out: Record<string, MedicStatusRow> = {};
      for (const r of (rows.data ?? []) as MedicStatusRow[]) out[r.user_id] = r;
      setStatusFor({ game: gameId, rows: out });
      if (my) setMineFor({ game: gameId, my });
    });
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    load();
    const channel = supabase
      .channel(`medic:${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medic_status', filter: `game_id=eq.${gameId}` }, () => {
        if (pending.current) clearTimeout(pending.current);
        pending.current = setTimeout(load, 200);
      })
      .subscribe();
    const appState = AppState.addEventListener('change', (a) => {
      if (a === 'active') load();
    });
    return () => {
      supabase.removeChannel(channel);
      appState.remove();
      if (pending.current) clearTimeout(pending.current);
    };
  }, [gameId, load]);

  const mine = gameId && mineFor?.game === gameId ? mineFor.my : IN_PLAY;
  const setMine = useCallback((my: MyMedic) => gameId && setMineFor({ game: gameId, my }), [gameId]);
  const visible = gameId && statusFor?.game === gameId ? statusFor.rows : NONE;
  return { medic, mine, setMine, statuses: visible, reload: load };
}
