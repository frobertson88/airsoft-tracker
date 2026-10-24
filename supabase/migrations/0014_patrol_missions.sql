-- Patrol missions, round 2 (agreed with Fraser on 24 October 2026; docs/patrol.md).
--
-- Each mission now has a type and a "done when" rule:
--   "type": "recon" | "route" | "courier" | "report" | "hold" | "find" | "task" | "custom"
--           (a preset in the app; the server only keeps it)
--   "done": "steps"  - the last point scanned finishes it (as before)
--         | "finish" - after the points, scan the finish point ("finish": point id)
--         | "leader" - after the points (and any hold), a section lead reports it done
--         | "host"   - as leader, then a day admin accepts or rejects the report
--   "hold": 1-60 minutes | null - with leader/host, how long after the points
--           before it can be reported
-- Leader and host missions may have no points at all (a task). Games made
-- before 0014 have no "done" in their missions, which reads as steps.
--
-- During play a section lead of the team (or a day admin on that team) can
-- report done (patrol_report) or abort (patrol_abort, fails it straight away).
-- A day admin can mark any team's mission done, failed or skipped, or reject a
-- report (patrol_mark). Failed and skipped missions pay nothing.

alter table public.patrol_teams
  -- Active seconds when the current mission's points were all scanned.
  add column ready_at numeric,
  -- A section lead's report waiting for an admin (done = host).
  add column reported_at timestamptz,
  add column reported_by uuid references auth.users (id);

create or replace function public._patrol_settings(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  m jsonb;
  ids text[] := '{}';
  v_out jsonb := '[]';
  v_order text; v_ending text; v_scoring boolean; v_field uuid; v_hidden jsonb;
  v_steps jsonb; v_teams jsonb; v_min numeric; v_reward numeric; v_in_order boolean; v_grid boolean;
  v_type text; v_done text; v_finish text; v_hold numeric;
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'patrol_invalid'; end if;
  v_order := coalesce(p ->> 'order', 'list');
  v_ending := coalesce(p ->> 'ending', 'time');
  v_hidden := coalesce(p -> 'hidden', '[]');
  begin
    v_field := (p ->> 'field')::uuid;
    v_scoring := coalesce((p ->> 'scoring')::boolean, true);
  exception when others then
    raise exception 'patrol_invalid';
  end;
  if v_order not in ('list', 'shuffle', 'search') or v_ending not in ('time', 'first', 'all')
     or jsonb_typeof(v_hidden) <> 'array' or jsonb_array_length(v_hidden) > 100
     or exists (select 1 from jsonb_array_elements(v_hidden) h where jsonb_typeof(h.value) <> 'string') then
    raise exception 'patrol_invalid';
  end if;
  if v_field is null then raise exception 'patrol_field_required'; end if;
  if jsonb_typeof(p -> 'missions') is distinct from 'array'
     or jsonb_array_length(p -> 'missions') not between 1 and 50 then
    raise exception 'patrol_missions_required';
  end if;
  for m in select value from jsonb_array_elements(p -> 'missions') loop
    if jsonb_typeof(m) <> 'object' then raise exception 'patrol_mission_invalid'; end if;
    v_steps := coalesce(m -> 'steps', '[]');
    v_teams := coalesce(m -> 'teams', '[]');
    v_type := coalesce(m ->> 'type', 'custom');
    v_done := coalesce(m ->> 'done', 'steps');
    v_finish := m ->> 'finish';
    begin
      v_min := (m ->> 'minutes')::numeric;
      v_hold := (m ->> 'hold')::numeric;
      v_reward := coalesce((m ->> 'reward')::numeric, 10);
      v_in_order := coalesce((m ->> 'in_order')::boolean, true);
      v_grid := coalesce((m ->> 'grid')::boolean, true);
    exception when others then
      raise exception 'patrol_mission_invalid';
    end;
    if jsonb_typeof(m -> 'id') is distinct from 'string' or char_length(m ->> 'id') not between 1 and 40
       or (m ->> 'id') = any(ids)
       or char_length(btrim(coalesce(m ->> 'name', ''))) not between 1 and 40
       or char_length(coalesce(m ->> 'brief', '')) > 200
       or char_length(coalesce(m ->> 'clue', '')) > 200
       or v_type not in ('recon', 'route', 'courier', 'report', 'hold', 'find', 'task', 'custom')
       or v_done not in ('steps', 'finish', 'leader', 'host')
       or jsonb_typeof(v_steps) <> 'array' or jsonb_array_length(v_steps) > 4
       or (jsonb_array_length(v_steps) = 0 and v_done not in ('leader', 'host'))
       or exists (select 1 from jsonb_array_elements(v_steps) e where jsonb_typeof(e.value) <> 'string')
       or (select count(distinct e.value) from jsonb_array_elements(v_steps) e) <> jsonb_array_length(v_steps)
       or coalesce(jsonb_typeof(m -> 'finish'), 'null') not in ('string', 'null')
       or (v_done = 'finish') <> (v_finish is not null)
       or (v_finish is not null and v_steps ? v_finish)
       or (v_hold is not null and (v_done not in ('leader', 'host') or v_hold not between 1 and 60 or v_hold <> trunc(v_hold)))
       or (v_min is not null and (v_min not between 1 and 60 or v_min <> trunc(v_min)))
       or v_reward not between 0 and 1000 or v_reward <> trunc(v_reward)
       or coalesce(jsonb_typeof(m -> 'start'), 'null') not in ('string', 'null')
       or jsonb_typeof(v_teams) <> 'array'
       or exists (select 1 from jsonb_array_elements(v_teams) e
                  where e.value not in ('1'::jsonb, '2'::jsonb, '3'::jsonb, '4'::jsonb)) then
      raise exception 'patrol_mission_invalid';
    end if;
    if v_order = 'search' and m ->> 'start' is null then raise exception 'patrol_search_needs_start'; end if;
    ids := ids || (m ->> 'id');
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', m ->> 'id', 'name', btrim(m ->> 'name'), 'brief', coalesce(m ->> 'brief', ''),
      'clue', coalesce(m ->> 'clue', ''), 'steps', v_steps, 'in_order', v_in_order, 'grid', v_grid,
      'minutes', v_min::int, 'reward', v_reward::int, 'start', m ->> 'start', 'teams', v_teams,
      'type', v_type, 'done', v_done, 'finish', v_finish, 'hold', v_hold::int));
  end loop;
  return jsonb_build_object('field', v_field, 'order', v_order, 'ending', v_ending,
    'scoring', v_scoring, 'hidden', v_hidden, 'missions', v_out);
end $$;

-- As 0013, plus finish points.
create or replace function public._patrol_check(g public.games)
returns void language plpgsql stable set search_path = '' as $$
declare f public.day_fields;
begin
  select * into f from public.day_fields where game_day_id = g.game_day_id;
  if f.field_id is distinct from (g.settings -> 'patrol' ->> 'field')::uuid then
    raise exception 'patrol_field_mismatch';
  end if;
  if exists (
    select 1 from jsonb_array_elements(g.settings -> 'patrol' -> 'missions') m,
      lateral (select s.id from jsonb_array_elements_text(m.value -> 'steps') s (id)
               union all select m.value ->> 'start'
               union all select m.value ->> 'finish') p
    where p.id is not null and not exists (
      select 1 from jsonb_array_elements(coalesce(f.data -> 'points', '[]')) pt where pt.value ->> 'id' = p.id)) then
    raise exception 'patrol_point_missing';
  end if;
end $$;

-- As 0013, plus 'skipped' (pays nothing) and clearing the ready and report marks.
create or replace function public._patrol_close(p_game uuid, p_team uuid, p_outcome text, p_at numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
  t public.patrol_teams;
  v_outcome jsonb;
  v_next text;
begin
  select * into g from public.games where id = p_game;
  select * into t from public.patrol_teams where game_id = p_game and team_id = p_team;
  if t.current is null then return; end if;
  v_outcome := t.outcome || jsonb_build_object(t.current, p_outcome);
  select q.id into v_next from jsonb_array_elements_text(t.queue) with ordinality q (id, i)
  where not (v_outcome ? q.id) order by q.i limit 1;
  update public.patrol_teams
  set outcome = v_outcome, current = v_next, current_since = p_at,
      ready_at = null, reported_at = null, reported_by = null,
      score = score + case when p_outcome = 'done'
                           then coalesce((public._patrol_mission(g, t.current) ->> 'reward')::int, 0) else 0 end,
      updated_at = now()
  where game_id = p_game and team_id = p_team;
end $$;

-- As 0013 (with 0013's fix for teams without missions), but a mission whose
-- report is waiting for an admin doesn't time out.
create or replace function public._patrol_update(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
  t public.patrol_teams;
  v_active numeric;
  v_minutes int;
  v_ending text;
  v_finished int;
  v_teams int;
begin
  select * into g from public.games where id = p_game;
  if g.state = 'ready' then return; end if;
  v_active := public._game_active(g, clock_timestamp());
  for t in select * from public.patrol_teams
           where game_id = p_game and current is not null and reported_at is null loop
    v_minutes := (public._patrol_mission(g, t.current) ->> 'minutes')::int;
    if v_minutes is not null and v_active >= t.current_since + v_minutes * 60 then
      perform public._patrol_close(p_game, t.team_id, 'failed', t.current_since + v_minutes * 60);
    end if;
  end loop;
  v_ending := g.settings -> 'patrol' ->> 'ending';
  if g.state <> 'complete' and v_ending in ('first', 'all') then
    select count(*) filter (where (select count(*) from jsonb_object_keys(p.outcome)) >= p.total), count(*)
    into v_finished, v_teams
    from public.patrol_teams p where p.game_id = p_game and p.total > 0;
    if v_teams > 0 and ((v_ending = 'first' and v_finished > 0) or (v_ending = 'all' and v_finished = v_teams)) then
      update public.games
      set state = 'complete', active_seconds = v_active, live_since = null, countdown_ends_at = null,
          ended_at = clock_timestamp(), end_reason = 'ended', updated_at = clock_timestamp()
      where id = p_game;
    end if;
  end if;
end $$;

-- As 0013, plus finish points and missions a lead reports. New results:
-- "ready" (all points scanned; now report it, or hold first) and "step" with
-- "finish" (all points scanned; now scan the finish point).
create or replace function public.patrol_scan(p_game uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_code text := public._tag_code(p_code);
  g public.games;
  t public.patrol_teams;
  v_team uuid;
  v_sort int;
  v_point text;
  v_active numeric;
  m jsonb;
  v_got jsonb;
  v_idx int;
  v_need text;
  v_start jsonb;
  v_all boolean;
begin
  g := public._advance_game(p_game);
  if g.mode <> 'patrol' then raise exception 'not_patrol'; end if;
  if g.state <> 'live' then raise exception 'game_not_live'; end if;
  select team_id into v_team from public.day_members
  where game_day_id = g.game_day_id and user_id = v_user and status = 'active';
  if not found then raise exception 'not_member'; end if;
  if v_team is null then raise exception 'team_required'; end if;
  select sort_order into v_sort from public.teams where id = v_team;
  select * into t from public.patrol_teams where game_id = p_game and team_id = v_team for update;
  if not found or t.total = 0 then raise exception 'patrol_team_out'; end if;
  if exists (select 1 from public.medic_lives
             where game_id = p_game and user_id = v_user and state <> 'in_play') then
    raise exception 'patrol_not_in_play';
  end if;

  select tg.point_id into v_point from public.tags tg
  join public.day_fields f on f.field_id = tg.field_id and f.game_day_id = g.game_day_id
  where tg.code = v_code;
  if v_point is null then return jsonb_build_object('result', 'not_here'); end if;
  v_active := public._game_active(g, clock_timestamp());

  if t.current is not null then
    m := public._patrol_mission(g, t.current);
    v_got := coalesce(t.progress -> t.current, '[]');
    v_all := jsonb_array_length(v_got) >= jsonb_array_length(m -> 'steps');

    -- The finish point, once every point is scanned.
    if m ->> 'finish' = v_point and v_all then
      perform public._patrol_close(p_game, v_team, 'done', v_active);
      perform public._patrol_update(p_game);
      return jsonb_build_object('result', 'complete', 'mission', t.current, 'point', v_point,
        'reward', (m ->> 'reward')::int);
    end if;

    select (s.i - 1)::int into v_idx from jsonb_array_elements_text(m -> 'steps') with ordinality s (id, i)
    where s.id = v_point;
    if v_idx is not null then
      if v_got @> to_jsonb(v_idx) then
        return jsonb_build_object('result', 'already', 'mission', t.current, 'point', v_point,
          'need', case when v_all then m ->> 'finish' end);
      end if;
      if (m ->> 'in_order')::boolean and v_idx <> jsonb_array_length(v_got) then
        return jsonb_build_object('result', 'wrong', 'mission', t.current,
          'need', m -> 'steps' ->> jsonb_array_length(v_got));
      end if;
      v_got := v_got || to_jsonb(v_idx);
      v_all := jsonb_array_length(v_got) >= jsonb_array_length(m -> 'steps');
      update public.patrol_teams
      set progress = progress || jsonb_build_object(t.current, v_got),
          ready_at = case when v_all then v_active end, updated_at = now()
      where game_id = p_game and team_id = v_team;
      if v_all and coalesce(m ->> 'done', 'steps') = 'steps' then
        perform public._patrol_close(p_game, v_team, 'done', v_active);
        perform public._patrol_update(p_game);
        return jsonb_build_object('result', 'complete', 'mission', t.current, 'point', v_point,
          'reward', (m ->> 'reward')::int);
      end if;
      if v_all and coalesce(m ->> 'done', 'steps') = 'finish' then
        return jsonb_build_object('result', 'step', 'mission', t.current, 'point', v_point, 'need', m ->> 'finish');
      end if;
      if v_all then
        return jsonb_build_object('result', 'ready', 'mission', t.current, 'point', v_point);
      end if;
      return jsonb_build_object('result', 'step', 'mission', t.current, 'point', v_point);
    end if;
  end if;

  -- A mission locked to this point, for this team, not played yet.
  select x.value into v_start from jsonb_array_elements(g.settings -> 'patrol' -> 'missions') x
  where x.value ->> 'start' = v_point and not (t.outcome ? (x.value ->> 'id'))
    and (jsonb_array_length(x.value -> 'teams') = 0 or x.value -> 'teams' @> to_jsonb(v_sort))
  limit 1;
  if v_start is not null and (v_start ->> 'id') is distinct from t.current then
    if t.current is not null and (public._patrol_mission(g, t.current) ->> 'start' is not null
                                  or t.reported_at is not null) then
      return jsonb_build_object('result', 'busy', 'mission', t.current);
    end if;
    update public.patrol_teams
    set current = v_start ->> 'id', current_since = v_active, ready_at = null, updated_at = now()
    where game_id = p_game and team_id = v_team;
    return jsonb_build_object('result', 'new', 'mission', v_start ->> 'id', 'point', v_point);
  end if;

  if t.current is not null then
    if v_all then
      return jsonb_build_object('result', 'wrong', 'mission', t.current, 'point', v_point, 'need', m ->> 'finish');
    end if;
    select s.id into v_need from jsonb_array_elements_text(m -> 'steps') with ordinality s (id, i)
    where not (v_got @> to_jsonb((s.i - 1)::int)) order by s.i limit 1;
    return jsonb_build_object('result', 'wrong', 'mission', t.current, 'point', v_point, 'need', v_need);
  end if;
  return jsonb_build_object('result', 'nothing', 'point', v_point);
end $$;

-- The caller's team's row in a live Patrol game, locked, if the caller leads a
-- section on that team or is a day admin on it.
create function public._patrol_lead(p_game uuid)
returns public.patrol_teams language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_team uuid;
  g public.games;
  t public.patrol_teams;
begin
  g := public._advance_game(p_game);
  if g.mode <> 'patrol' then raise exception 'not_patrol'; end if;
  if g.state <> 'live' then raise exception 'game_not_live'; end if;
  select team_id into v_team from public.day_members
  where game_day_id = g.game_day_id and user_id = v_user and status = 'active';
  if not found then raise exception 'not_member'; end if;
  if v_team is null then raise exception 'team_required'; end if;
  if not public.is_day_admin(g.game_day_id) and not exists (
    select 1 from public.sections s where s.team_id = v_team and s.leader_id = v_user) then
    raise exception 'not_section_lead';
  end if;
  select * into t from public.patrol_teams where game_id = p_game and team_id = v_team for update;
  if not found or t.total = 0 then raise exception 'patrol_team_out'; end if;
  if t.current is null then raise exception 'patrol_no_mission'; end if;
  return t;
end $$;

-- A section lead reports the team's mission done. Returns {"result": "done"}
-- or {"result": "reported"} (waiting for an admin).
create function public.patrol_report(p_game uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
  t public.patrol_teams;
  m jsonb;
  v_active numeric;
begin
  t := public._patrol_lead(p_game);
  select * into g from public.games where id = p_game;
  m := public._patrol_mission(g, t.current);
  if coalesce(m ->> 'done', 'steps') not in ('leader', 'host') then raise exception 'patrol_not_reportable'; end if;
  if t.reported_at is not null then raise exception 'patrol_already_reported'; end if;
  if jsonb_array_length(coalesce(t.progress -> t.current, '[]')) < jsonb_array_length(m -> 'steps') then
    raise exception 'patrol_not_ready';
  end if;
  v_active := public._game_active(g, clock_timestamp());
  if (m ->> 'hold') is not null
     and v_active < coalesce(t.ready_at, t.current_since) + (m ->> 'hold')::int * 60 then
    raise exception 'patrol_hold_running';
  end if;
  if coalesce(m ->> 'done', 'steps') = 'host' then
    update public.patrol_teams set reported_at = now(), reported_by = auth.uid(), updated_at = now()
    where game_id = p_game and team_id = t.team_id;
    return jsonb_build_object('result', 'reported', 'mission', t.current);
  end if;
  perform public._patrol_close(p_game, t.team_id, 'done', v_active);
  perform public._patrol_update(p_game);
  return jsonb_build_object('result', 'done', 'mission', t.current, 'reward', (m ->> 'reward')::int);
end $$;

-- A section lead aborts the team's mission: it fails and the next one starts.
create function public.patrol_abort(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
  t public.patrol_teams;
begin
  t := public._patrol_lead(p_game);
  select * into g from public.games where id = p_game;
  perform public._patrol_close(p_game, t.team_id, 'failed', public._game_active(g, clock_timestamp()));
  perform public._patrol_update(p_game);
end $$;

-- A day admin marks a team's current mission: done (pays its reward), failed,
-- skip (pays nothing, counts as played) or reject (clears a waiting report).
create function public.patrol_mark(p_game uuid, p_team uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.games := public._admin_game(p_game);
  t public.patrol_teams;
begin
  if g.mode <> 'patrol' then raise exception 'not_patrol'; end if;
  if g.state not in ('live', 'paused', 'resuming') then raise exception 'game_not_live'; end if;
  if p_action not in ('done', 'failed', 'skip', 'reject') then raise exception 'patrol_invalid'; end if;
  select * into t from public.patrol_teams where game_id = p_game and team_id = p_team for update;
  if not found or t.total = 0 then raise exception 'patrol_team_out'; end if;
  if t.current is null then raise exception 'patrol_no_mission'; end if;
  if p_action = 'reject' then
    if t.reported_at is null then raise exception 'patrol_no_report'; end if;
    update public.patrol_teams set reported_at = null, reported_by = null, updated_at = now()
    where game_id = p_game and team_id = p_team;
    return;
  end if;
  perform public._patrol_close(p_game, p_team,
    case p_action when 'skip' then 'skipped' else p_action end,
    public._game_active(g, clock_timestamp()));
  perform public._patrol_update(p_game);
end $$;

revoke execute on function public._patrol_lead(uuid), public.patrol_report(uuid),
  public.patrol_abort(uuid), public.patrol_mark(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.patrol_report(uuid), public.patrol_abort(uuid),
  public.patrol_mark(uuid, uuid, text) to authenticated;
