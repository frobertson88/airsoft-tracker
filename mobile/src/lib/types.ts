export const DAY_ROLES = [
  'Rifleman',
  'Machine Gunner',
  'Sniper',
  'Medic',
  'Section Leader',
  'Team Commander',
  'Other',
] as const;
export type DayRole = (typeof DAY_ROLES)[number];
/** Roles a player can pick. Leading is per section (Section.leader_id), not a role. */
export const ROLE_CHOICES = DAY_ROLES.filter((r) => r !== 'Section Leader');

export type DayStatus = 'open' | 'closed';
export type MemberStatus = 'active' | 'left' | 'removed';

export interface Profile {
  id: string;
  callsign: string;
}

export interface GameDay {
  id: string;
  name: string;
  status: DayStatus;
  created_by: string;
  created_at: string;
  closed_at: string | null;
}

export interface Team {
  id: string;
  game_day_id: string;
  name: string;
  colour: 'blue' | 'red' | 'yellow' | 'purple';
  sort_order: number;
}

export interface Section {
  id: string;
  game_day_id: string;
  team_id: string;
  name: string;
  created_at: string;
  leader_id: string | null;
}

export interface DayMember {
  game_day_id: string;
  user_id: string;
  day_role: DayRole | null;
  team_id: string | null;
  section_id: string | null;
  is_admin: boolean;
  status: MemberStatus;
  joined_at: string;
}

export interface OpenDay {
  id: string;
  name: string;
  host_callsign: string | null;
  player_count: number;
  created_at: string;
  my_status: MemberStatus | null;
}
