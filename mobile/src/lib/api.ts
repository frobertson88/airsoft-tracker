// Thin wrappers over the backend command functions (supabase/migrations).
// Every gameplay/membership change goes through these; screens never write tables.
import { supabase } from './supabase';
import type { FieldData } from './field';
import type { DayRole, OpenDay } from './types';

const MESSAGES: Record<string, string> = {
  not_authenticated: 'Please sign in again.',
  profile_required: 'Set your callsign first.',
  day_not_found: 'That Game Day no longer exists.',
  day_closed: 'This Game Day is closed.',
  not_member: 'You are not in this Game Day.',
  not_admin: 'Only day admins can do that.',
  removed: 'You were removed from this Game Day. Ask an admin to readmit you.',
  last_admin: 'Another admin must remain. Make someone else admin first.',
  team_required: 'Choose a team first.',
  team_not_found: 'That team no longer exists.',
  section_not_found: 'That section is not in this team.',
  section_name_taken: 'Your team already has a section with that name.',
  not_removed: 'That player is not removed.',
  not_section_lead: 'Only the section lead or an admin can change the lead.',
  not_in_section: 'That player is not in this section.',
  field_invalid: 'This field couldn’t be saved. Check its shapes and try again.',
  field_view_invalid: 'Move the map to the field before saving.',
  field_boundary_invalid: 'Draw a boundary with at least 3 corners and no crossing edges.',
  field_area_invalid: 'Each No-go and Danger area needs a name and at least 3 corners with no crossing edges.',
  field_point_invalid: 'Each point needs a label.',
  field_too_big: 'Too many areas or points (50 areas and 100 points at most).',
  field_not_found: 'That field no longer exists.',
  not_field_owner: 'Only the person who made this field can change it.',
  field_archived: 'That field is archived. Restore it in Fields first.',
};

export class ApiError extends Error {
  constructor(public key: string, message: string) {
    super(message);
  }
}

export function friendlyError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

async function rpc<T = void>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const key = error.message;
    if (MESSAGES[key]) throw new ApiError(key, MESSAGES[key]);
    if (error.code === '23514') throw new ApiError('invalid', 'Check the name and try again.');
    throw new ApiError('unknown', error.message || 'Could not reach the server.');
  }
  return data as T;
}

export const api = {
  setCallsign: (callsign: string) => rpc('set_callsign', { p_callsign: callsign }),
  createGameDay: (name: string) => rpc<string>('create_game_day', { p_name: name }),
  listOpenDays: () => rpc<OpenDay[]>('list_open_days'),
  joinGameDay: (day: string) => rpc('join_game_day', { p_day: day }),
  leaveGameDay: (day: string) => rpc('leave_game_day', { p_day: day }),
  setDayRole: (day: string, role: DayRole) => rpc('set_day_role', { p_day: day, p_role: role }),
  chooseTeam: (day: string, team: string) => rpc('choose_team', { p_day: day, p_team: team }),
  chooseSection: (day: string, section: string | null) =>
    rpc('choose_section', { p_day: day, p_section: section }),
  createSection: (day: string, name: string) =>
    rpc<string>('create_section', { p_day: day, p_name: name }),
  setSectionLeader: (section: string, user: string) =>
    rpc('set_section_leader', { p_section: section, p_user: user }),
  // Admin
  renameTeam: (team: string, name: string) => rpc('rename_team', { p_team: team, p_name: name }),
  setAssignment: (
    day: string,
    user: string,
    role: DayRole | null,
    team: string | null,
    section: string | null,
  ) =>
    rpc('admin_set_assignment', {
      p_day: day,
      p_user: user,
      p_role: role,
      p_team: team,
      p_section: section,
    }),
  setAdmin: (day: string, user: string, isAdmin: boolean) =>
    rpc('set_admin', { p_day: day, p_user: user, p_is_admin: isAdmin }),
  removeMember: (day: string, user: string) => rpc('remove_member', { p_day: day, p_user: user }),
  readmitMember: (day: string, user: string) => rpc('readmit_member', { p_day: day, p_user: user }),
  closeGameDay: (day: string) => rpc('close_game_day', { p_day: day }),
  // Field Library
  saveField: (field: string | null, name: string, location: string, notes: string, data: FieldData) =>
    rpc<string>('save_field', {
      p_field: field,
      p_name: name,
      p_location: location,
      p_notes: notes,
      p_data: data,
    }),
  duplicateField: (field: string) => rpc<string>('duplicate_field', { p_field: field }),
  archiveField: (field: string, archived: boolean) =>
    rpc('archive_field', { p_field: field, p_archived: archived }),
  selectDayField: (day: string, field: string) => rpc('select_day_field', { p_day: day, p_field: field }),
};
