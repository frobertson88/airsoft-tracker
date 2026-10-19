// Thin wrappers over the backend command functions (supabase/migrations).
// Every gameplay/membership change goes through these; screens never write tables.
import { supabase } from './supabase';
import type { Coord, FieldData } from './field';
import type { GameMode, KothSettings } from './game';
import type { TeamColour } from '../theme';
import type { Affiliation, MapObjectKind, Target } from './mapTools';
import type { MedicRules, MyMedic, ScanResult } from './medic';
import type { DayRole, OpenDay } from './types';

/** How arrange_teams fills teams: keep players, deal them out at random, or everyone picks again. */
export type TeamFill = 'keep' | 'shuffle' | 'clear';

/** What a game or saved setup is: name, length, countdown, mode and its settings. */
export interface GameConfig {
  name: string;
  length_seconds: number | null;
  countdown_seconds: number;
  mode: GameMode;
  settings: Partial<KothSettings>;
}

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
  field_preview_invalid: 'The field picture couldn’t be saved.',
  not_field_owner: 'Only the person who made this field can change it.',
  field_archived: 'That field is archived. Restore it in Fields first.',
  game_not_found: 'That game no longer exists.',
  game_in_progress: 'Finish the current game first.',
  game_not_ready: 'That game has already started.',
  game_not_counting_down: 'There’s no countdown running.',
  game_not_live: 'The game isn’t live.',
  game_not_paused: 'The game isn’t paused.',
  game_not_complete: 'The game hasn’t finished yet.',
  game_complete: 'The game has finished.',
  game_unlimited: 'Unlimited games can’t have time added.',
  field_required: 'Pick a field for the day before starting.',
  invalid_time: 'Check the time and try again.',
  game_settings_invalid: 'Check the game settings and try again.',
  koth_no_space: 'The hill doesn’t fit on this field clear of No-go and Danger areas. Try a smaller hill.',
  team_count_invalid: 'Pick 2, 3 or 4 teams.',
  team_colour_invalid: 'Pick one of the team colours.',
  map_kind_invalid: 'That marker can’t be used here.',
  map_label_required: 'Type the label first.',
  map_label_invalid: 'Keep labels to 40 characters.',
  map_points_invalid: 'That drawing has the wrong number of points.',
  map_audience_invalid: 'You can’t share that drawing with them.',
  map_no_team: 'Pick a team before drawing on the map.',
  map_full: 'The map is full. Delete some drawings first.',
  map_object_not_found: 'That drawing has already gone.',
  map_not_allowed: 'Only the person who drew it, or an admin in Host view, can change it.',
  team_fill_invalid: 'Choose how to fill the teams.',
  game_running: 'Finish the current game before changing teams.',
  team_locked: 'Teams are locked while a game is running. Ask an admin to move you.',
  not_koth: 'Only King of the Hill games have a hill.',
  game_not_running: 'The game isn’t running.',
  hill_spot_invalid: 'The hill must fit inside the boundary, clear of No-go and Danger areas. Pick another spot.',
  setup_not_found: 'That saved setup no longer exists.',
  too_many_setups: 'You have 50 saved setups. Delete one first.',
  medic_off: 'Medic rules are off for this game.',
  medic_self: 'That’s your own code. Ask a teammate to scan it.',
  medic_code_invalid: 'That code is out of date. Ask the player to show their code again.',
  medic_not_allowed: 'You can’t treat this wound.',
  medic_not_hurt: 'That player is already back in play.',
  medic_reason_required: 'Give a reason for undoing the hit.',
  medic_nothing_to_undo: 'That player has no hit to undo.',
  medic_rules_invalid: 'Each hit needs a name and at least one person who can help.',
  medic_name_invalid: 'Give the rules a name (40 characters at most).',
  too_many_rulesets: 'You have 50 medic rule sets. Delete one first.',
  ruleset_not_found: 'Those medic rules no longer exist.',
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
  setTeamColour: (team: string, colour: TeamColour) => rpc('set_team_colour', { p_team: team, p_colour: colour }),
  setMapHostView: (day: string, on: boolean) => rpc('set_map_host_view', { p_day: day, p_on: on }),
  placeMapObject: (
    day: string,
    o: { kind: MapObjectKind; marker_type?: string | null; affiliation: Affiliation; target: Target; label?: string | null; points: Coord[]; linked?: boolean },
  ) =>
    rpc<string>('place_map_object', {
      p_day: day,
      p_kind: o.kind,
      p_marker_type: o.marker_type ?? null,
      p_affiliation: o.affiliation,
      p_audience: o.target.audience,
      p_team: o.target.team_id,
      p_section: o.target.section_id,
      p_label: o.label ?? null,
      p_points: o.points.map((c) => ({ lat: c.lat, lng: c.lng })),
      p_linked: o.linked ?? true,
    }),
  moveMapObject: (object: string, points: Coord[]) =>
    rpc('move_map_object', { p_object: object, p_points: points.map((c) => ({ lat: c.lat, lng: c.lng })) }),
  deleteMapObjects: (day: string, objects: string[]) => rpc<number>('delete_map_objects', { p_day: day, p_objects: objects }),
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
  setFieldPreview: (field: string, preview: string | null) =>
    rpc('set_field_preview', { p_field: field, p_preview: preview }),
  duplicateField: (field: string) => rpc<string>('duplicate_field', { p_field: field }),
  archiveField: (field: string, archived: boolean) =>
    rpc('archive_field', { p_field: field, p_archived: archived }),
  selectDayField: (day: string, field: string) => rpc('select_day_field', { p_day: day, p_field: field }),
  // Games
  createGame: (day: string, c: GameConfig) =>
    rpc<string>('create_game', {
      p_day: day,
      p_name: c.name,
      p_length_seconds: c.length_seconds,
      p_countdown_seconds: c.countdown_seconds,
      p_mode: c.mode,
      p_settings: c.settings,
    }),
  updateGame: (game: string, c: GameConfig) =>
    rpc('update_game', {
      p_game: game,
      p_name: c.name,
      p_length_seconds: c.length_seconds,
      p_countdown_seconds: c.countdown_seconds,
      p_mode: c.mode,
      p_settings: c.settings,
    }),
  saveGameSetup: (setup: string | null, c: GameConfig) =>
    rpc<string>('save_game_setup', {
      p_setup: setup,
      p_name: c.name,
      p_mode: c.mode,
      p_length_seconds: c.length_seconds,
      p_countdown_seconds: c.countdown_seconds,
      p_settings: c.settings,
    }),
  deleteGameSetup: (setup: string) => rpc('delete_game_setup', { p_setup: setup }),
  arrangeTeams: (day: string, count: number, fill: TeamFill) =>
    rpc('arrange_teams', { p_day: day, p_count: count, p_fill: fill }),
  /** Move the KOTH hill; no spot means a new random one. */
  moveHill: (game: string, spot?: { lat: number; lng: number }) =>
    rpc('move_hill', { p_game: game, p_lat: spot?.lat ?? null, p_lng: spot?.lng ?? null }),
  startGame: (game: string) => rpc('start_game', { p_game: game }),
  forceStart: (game: string) => rpc('force_start', { p_game: game }),
  cancelCountdown: (game: string) => rpc('cancel_countdown', { p_game: game }),
  pauseGame: (game: string) => rpc('pause_game', { p_game: game }),
  resumeGame: (game: string, countdownSeconds = 10) =>
    rpc('resume_game', { p_game: game, p_countdown_seconds: countdownSeconds }),
  addTime: (game: string, seconds: number) => rpc('add_time', { p_game: game, p_seconds: seconds }),
  endGame: (game: string) => rpc('end_game', { p_game: game }),
  playAgain: (game: string) => rpc<string>('play_again', { p_game: game }),
  tickGame: (game: string) => rpc('tick_game', { p_game: game }),
  serverNow: () => rpc<string>('server_now'),
  // Medic
  saveMedicRuleset: (ruleset: string | null, name: string, rules: MedicRules) =>
    rpc<string>('save_medic_ruleset', { p_id: ruleset, p_name: name, p_rules: rules }),
  deleteMedicRuleset: (ruleset: string) => rpc('delete_medic_ruleset', { p_id: ruleset }),
  setDefaultMedicRuleset: (ruleset: string | null) => rpc('set_default_medic_ruleset', { p_id: ruleset }),
  reportHit: (game: string) => rpc<MyMedic>('report_hit', { p_game: game }),
  myMedicStatus: (game: string) => rpc<MyMedic>('my_medic_status', { p_game: game }),
  medicTick: (game: string) => rpc('medic_tick', { p_game: game }),
  scanPlayer: (game: string, user: string, code: string) =>
    rpc<ScanResult>('scan_player', { p_game: game, p_user: user, p_code: code }),
  treatPlayer: (game: string, user: string, code: string) =>
    rpc('treat_player', { p_game: game, p_user: user, p_code: code }),
  undoHit: (game: string, user: string, reason: string) =>
    rpc('undo_hit', { p_game: game, p_user: user, p_reason: reason }),
  reportPosition: (day: string, lat: number, lng: number, accuracy: number | null, recordedAt: string) =>
    rpc('report_position', {
      p_day: day,
      p_lat: lat,
      p_lng: lng,
      p_accuracy: accuracy,
      p_recorded_at: recordedAt,
    }),
};
