// Patrol (plans: Patrol and tag library, phase 2; supabase/migrations/0013_patrol.sql).
// Teams play missions: scan one to four points, in order or any order, with an
// optional time limit and a reward paid once.
import type { DayField, FieldData, FieldPoint } from './field';
import type { Game } from './game';
import { gridRef } from './grid';

export type PatrolOrder = 'list' | 'shuffle' | 'search';
export type PatrolEnding = 'time' | 'first' | 'all';

export interface PatrolMission {
  id: string;
  name: string;
  brief: string;
  /** Free-text clue shown with the mission, e.g. "By the old water tank". */
  clue: string;
  /** Point ids, 1–4. */
  steps: string[];
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
  outcome: Record<string, 'done' | 'failed'>;
  score: number;
}

export interface PatrolScan {
  result: 'step' | 'complete' | 'new' | 'wrong' | 'already' | 'busy' | 'nothing' | 'not_here';
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

export const REWARDS = [0, 10, 20, 30, 50, 100];
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
    steps: [],
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

/** Short route for a mission row: "3 → 5 → 6" or "3, 7 any order". */
export function routeText(data: FieldData | undefined, m: PatrolMission) {
  const nums = m.steps.map((s) => String(pointById(data, s)?.num ?? '?'));
  if (!nums.length) return 'No points yet';
  return m.in_order ? nums.join(' → ') : `${nums.join(', ')}${nums.length > 1 ? ' any order' : ''}`;
}

export interface StepView {
  id: string;
  title: string;
  label: string;
  grid: string;
  done: boolean;
}

/** What a team sees of a mission: its steps with what's done, and the time left. */
export function missionView(field: DayField | null, m: PatrolMission, t: PatrolTeam, elapsed: number) {
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
  const left = m.minutes ? Number(t.current_since) + m.minutes * 60 - elapsed : null;
  return { steps, left };
}

/** Highest score wins, equal highest draw; null with scoring off or no teams. */
export function patrolWinner(teams: PatrolTeam[], s: PatrolSettings): { team: string | null; draw: boolean } | null {
  if (!s.scoring || !teams.length) return null;
  const top = Math.max(...teams.map((t) => t.score));
  const best = teams.filter((t) => t.score === top);
  return best.length === 1 ? { team: best[0].team_id, draw: false } : { team: null, draw: true };
}

export const finished = (t: PatrolTeam) => Object.keys(t.outcome).length >= t.total;
