// Patrol (plans: Patrol and tag library, phase 2; supabase/migrations/0013_patrol.sql,
// 0014_patrol_missions.sql). Teams play missions: scan up to four points, in
// order or any order, then maybe a finish point or a section lead's report,
// with an optional time limit and a reward paid once.
import type { DayField, FieldData, FieldPoint } from './field';
import type { Game } from './game';
import { gridRef } from './grid';

export type PatrolOrder = 'list' | 'shuffle' | 'search';
export type PatrolEnding = 'time' | 'first' | 'all';
export type MissionType = 'recon' | 'route' | 'courier' | 'report' | 'hold' | 'find' | 'task' | 'custom';
/** What finishes a mission once its points are scanned. */
export type MissionDone = 'steps' | 'finish' | 'leader' | 'host';

export interface PatrolMission {
  id: string;
  name: string;
  brief: string;
  /** Free-text clue shown with the mission, e.g. "By the old water tank". */
  clue: string;
  type: MissionType;
  /** Point ids, 0–4 (0 only when a lead reports it). */
  steps: string[];
  done: MissionDone;
  /** With done = finish: scanning this point after the others finishes it. */
  finish: string | null;
  /** With done = leader/host: minutes to hold after the points before reporting. */
  hold: number | null;
  in_order: boolean;
  /** Show each step's grid reference on the card. */
  grid: boolean;
  minutes: number | null;
  reward: number;
  /** Locked to this point: scanning it hands the mission out. */
  start: string | null;
  /** Team numbers (1–4) that play it; empty means every team. */
  teams: number[];
}

export interface PatrolSettings {
  field: string;
  order: PatrolOrder;
  ending: PatrolEnding;
  scoring: boolean;
  /** Points not shown on players' maps. */
  hidden: string[];
  missions: PatrolMission[];
}

/** One team's progress (patrol_teams). */
export interface PatrolTeam {
  game_id: string;
  team_id: string;
  queue: string[];
  total: number;
  current: string | null;
  current_since: number | string;
  progress: Record<string, number[]>;
  outcome: Record<string, 'done' | 'failed' | 'skipped'>;
  score: number;
  /** Active seconds when the current mission's points were all scanned. */
  ready_at: number | string | null;
  /** A lead's report waiting for the host. */
  reported_at: string | null;
}

export interface PatrolScan {
  result: 'step' | 'complete' | 'new' | 'wrong' | 'already' | 'busy' | 'nothing' | 'not_here' | 'ready';
  mission?: string;
  point?: string;
  need?: string;
  reward?: number;
}

export const ORDER_LABEL: Record<PatrolOrder, string> = {
  list: 'In order',
  shuffle: 'Shuffled',
  search: 'Scan to get',
};
export const ORDER_HELP: Record<PatrolOrder, string> = {
  list: 'Each team plays its missions in the order you set.',
  shuffle: 'Each team gets its missions in a random order.',
  search: 'No list. Teams find points; scanning a point hands out the mission locked to it.',
};
export const ENDING_LABEL: Record<PatrolEnding, string> = {
  time: 'Time limit or End',
  first: 'First team finishes',
  all: 'Every team finishes',
};

export const DONE_LABEL: Record<MissionDone, string> = {
  steps: 'Last point scanned',
  finish: 'Scan a finish point',
  leader: 'Section lead reports',
  host: 'Host confirms',
};
export const DONE_HELP: Record<MissionDone, string> = {
  steps: 'The mission is done when its last point is scanned.',
  finish: 'After the points, the team scans the finish point, e.g. back at HQ.',
  leader: 'After the points, the team’s section lead taps Report done.',
  host: 'The section lead reports it done, then you accept or reject it on the Host tab.',
};

/** Mission types: presets for the rules, all editable afterwards. */
export const MISSION_TYPES: { type: MissionType; label: string; help: string; preset: Partial<PatrolMission> }[] = [
  { type: 'recon', label: 'Recon', help: 'Scan 2–4 points in any order.', preset: { in_order: false, done: 'steps', finish: null, hold: null } },
  { type: 'route', label: 'Route', help: 'Scan the points in a set order.', preset: { in_order: true, done: 'steps', finish: null, hold: null } },
  { type: 'courier', label: 'Courier', help: 'Pick up at one point, drop at the finish point.', preset: { in_order: true, done: 'finish', hold: null } },
  { type: 'report', label: 'Report back', help: 'Do the points, then scan the finish point (HQ) to finish.', preset: { in_order: false, done: 'finish', hold: null } },
  { type: 'hold', label: 'Hold', help: 'Scan a point, hold it for a set time, then the section lead reports it done.', preset: { in_order: true, done: 'leader', finish: null, hold: 5 } },
  { type: 'find', label: 'Find', help: 'Find a point from its grid reference or clue and scan it. Hide the point from players’ maps.', preset: { in_order: true, done: 'steps', finish: null, hold: null, grid: true } },
  { type: 'task', label: 'Task', help: 'Nothing to scan, e.g. rescue the pilot. The section lead reports it and you confirm.', preset: { steps: [], done: 'host', finish: null, hold: null } },
  { type: 'custom', label: 'Custom', help: 'Set every rule yourself.', preset: {} },
];
export const typeLabel = (t: MissionType | undefined) => MISSION_TYPES.find((x) => x.type === (t ?? 'custom'))?.label ?? 'Custom';

export const REWARDS = [0, 10, 20, 30, 40, 50, 100];
export const HOLD_MINUTES = [1, 2, 5, 10, 15];
export const MISSION_MINUTES: (number | null)[] = [null, 5, 10, 15, 20, 30];

export const patrolOf = (g: Game | null): PatrolSettings | null =>
  g?.mode === 'patrol' ? ((g.settings as { patrol?: PatrolSettings }).patrol ?? null) : null;

export const newMissionId = () => Math.random().toString(36).slice(2, 10);

export function newMission(n: number): PatrolMission {
  return {
    id: newMissionId(),
    name: `Mission ${n}`,
    brief: '',
    clue: '',
    type: 'custom',
    steps: [],
    done: 'steps',
    finish: null,
    hold: null,
    in_order: true,
    grid: true,
    minutes: null,
    reward: 10,
    start: null,
    teams: [],
  };
}

/** count random missions of 1–3 points from the pool (the points in play). */
export function generateMissions(pool: FieldPoint[], count: number, from: number): PatrolMission[] {
  const out: PatrolMission[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const size = Math.min(pool.length, 1 + Math.floor(Math.random() * 3));
    const steps = [...pool].sort(() => Math.random() - 0.5).slice(0, size);
    out.push({
      ...newMission(from + i),
      name: size === 1 ? 'Check in' : size === 2 ? 'Patrol' : 'Long patrol',
      type: size === 1 ? 'find' : 'route',
      steps: steps.map((p) => p.id!),
      reward: size * 10,
    });
  }
  return out;
}

export const pointById = (data: FieldData | undefined, id: string | null | undefined) =>
  id ? data?.points.find((p) => p.id === id) : undefined;

/** "Point 3" for a point id, or "Removed point". */
export function pointTitle(data: FieldData | undefined, id: string | null | undefined) {
  const p = pointById(data, id);
  return p ? (p.num ? `Point ${p.num}` : p.label) : 'Removed point';
}

/** Old saved missions (0013) lack the 0014 fields. */
export const missionOf = (m: PatrolMission): PatrolMission => ({
  ...m,
  type: m.type ?? 'custom',
  done: m.done ?? 'steps',
  finish: m.finish ?? null,
  hold: m.hold ?? null,
});

/** Short route for a mission row: "3 → 5 → 6", "3, 7 any order", "2, then 9". */
export function routeText(data: FieldData | undefined, mission: PatrolMission) {
  const m = missionOf(mission);
  const num = (id: string) => String(pointById(data, id)?.num ?? '?');
  const nums = m.steps.map(num);
  let text = !nums.length ? '' : m.in_order ? nums.join(' → ') : `${nums.join(', ')}${nums.length > 1 ? ' any order' : ''}`;
  if (m.done === 'finish') text = `${text || 'No points'}, then ${m.finish ? num(m.finish) : '?'}`;
  if (m.done === 'leader' || m.done === 'host') {
    const tail = [m.hold ? `hold ${m.hold} min` : null, m.done === 'host' ? 'host confirms' : 'lead reports'].filter(Boolean).join(', ');
    text = text ? `${text} · ${tail}` : tail;
  }
  return text || 'No points yet';
}

/** What's missing from a mission, or null when it's ready to play. */
export function missionProblem(mission: PatrolMission, order: PatrolOrder): string | null {
  const m = missionOf(mission);
  if (!m.name.trim()) return 'Needs a name';
  if (!m.steps.length && m.done !== 'leader' && m.done !== 'host') return 'Needs at least one point';
  if (m.done === 'finish' && !m.finish) return 'Needs a finish point';
  if (order === 'search' && !m.start) return 'Needs a start point (Scan to get)';
  return null;
}

export interface StepView {
  id: string;
  title: string;
  label: string;
  grid: string;
  done: boolean;
}

/** What a team sees of a mission: its steps with what's done, and the time left. */
export function missionView(field: DayField | null, mission: PatrolMission, t: PatrolTeam, elapsed: number) {
  const m = missionOf(mission);
  const got = t.progress[m.id] ?? [];
  const steps: StepView[] = m.steps.map((id, i) => {
    const p = pointById(field?.data, id);
    return {
      id,
      title: pointTitle(field?.data, id),
      label: p?.label ?? '',
      grid: p && field && m.grid ? gridRef(field.data, p) : '',
      done: got.includes(i),
    };
  });
  const ready = got.length >= m.steps.length;
  let finish: StepView | null = null;
  if (m.done === 'finish' && m.finish) {
    const p = pointById(field?.data, m.finish);
    finish = {
      id: m.finish,
      title: pointTitle(field?.data, m.finish),
      label: p?.label ?? '',
      grid: p && field && m.grid ? gridRef(field.data, p) : '',
      done: false,
    };
  }
  const left = m.minutes && !t.reported_at ? Number(t.current_since) + m.minutes * 60 - elapsed : null;
  // Seconds of the hold still to run, once the points are scanned.
  const holdLeft =
    ready && m.hold && (m.done === 'leader' || m.done === 'host')
      ? Number(t.ready_at ?? t.current_since) + m.hold * 60 - elapsed
      : null;
  const canReport = (m.done === 'leader' || m.done === 'host') && ready && !t.reported_at && (holdLeft ?? 0) <= 0;
  return { mission: m, steps, finish, ready, left, holdLeft, canReport, reported: !!t.reported_at };
}

/** Highest score wins, equal highest draw; null with scoring off or no teams. */
export function patrolWinner(teams: PatrolTeam[], s: PatrolSettings): { team: string | null; draw: boolean } | null {
  if (!s.scoring || !teams.length) return null;
  const top = Math.max(...teams.map((t) => t.score));
  const best = teams.filter((t) => t.score === top);
  return best.length === 1 ? { team: best[0].team_id, draw: false } : { team: null, draw: true };
}

export const finished = (t: PatrolTeam) => Object.keys(t.outcome).length >= t.total;
