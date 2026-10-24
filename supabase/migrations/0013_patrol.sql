-- Patrol (Patrol and tag library plan, phase 2, agreed with Fraser on
-- 24 October 2026; docs/patrol.md).
--
-- A Patrol game is built against one saved field. Its settings hold missions:
--   {"patrol": {"field": uuid, "order": "list" | "shuffle" | "search",
--               "ending": "time" | "first" | "all", "scoring": bool,
--               "hidden": [point id, ...],      -- not shown on players' maps
--               "missions": [{"id", "name", "brief", "clue",
--                             "steps": [point id, ...] (1-4),
--                             "in_order": bool, "grid": bool,
--                             "minutes": 1-60 | null, "reward": 0-1000,
--                             "start": point id | null,   -- locked to that point's tag
--                             "teams": [team number, ...] -- empty = every team
--                            }, ...]}}
-- order: list = each team plays its missions in the order given, shuffle = in a
-- random order per team, search = no list; a mission locked to a point is
-- handed out when the team scans that point (in any order). A locked mission
-- also jumps ahead of the list in list and shuffle games.
--
-- Each team's progress lives in patrol_teams, brought up to date lazily by
-- _advance_game like KOTH: a timed mission that runs out fails and the next
-- one starts; an ending of first/all finishes the game.
--
-- The missions sit in the game's settings, which day members can read, and
-- hidden points are in the day's field copy, so hiding is what the app shows,
-- not a secret kept by the server.

alter table public.games drop constraint games_mode_check;
alter table public.games add constraint games_mode_check check (mode in ('free', 'koth', 'patrol'));
alter table public.game_setups drop constraint game_setups_mode_check;
alter table public.game_setups add constraint game_setups_mode_check check (mode in ('free', 'koth', 'patrol'));

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create function public._patrol_settings(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  m jsonb;
  ids text[] := '{}';
  v_out jsonb := '[]';
  v_order text; v_ending text; v_scoring boolean; v_field uuid; v_hidden jsonb;
  v_steps jsonb; v_teams jsonb; v_min numeric; v_reward numeric; v_in_order boolean; v_grid boolean;
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
    v_steps := m -> 'steps';
    v_teams := coalesce(m -> 'teams', '[]');
    begin
      v_min := (m ->> 'minutes')::numeric;
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
       or jsonb_typeof(v_steps) is distinct from 'array' or jsonb_array_length(v_steps) not between 1 and 4
       or exists (select 1 from jsonb_array_elements(v_steps) e where jsonb_typeof(e.value) <> 'string')
       or (select count(distinct e.value) from jsonb_array_elements(v_steps) e) <> jsonb_array_length(v_steps)
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
      'minutes', v_min::int, 'reward', v_reward::int, 'start', m ->> 'start', 'teams', v_teams));
  end loop;
  return jsonb_build_object('field', v_field, 'order', v_order, 'ending', v_ending,
    'scoring', v_scoring, 'hidden', v_hidden, 'missions', v_out);
end $$;

-- As 0009, plus Patrol.
create or replace function public._game_settings(p_mode text, p_settings jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  s jsonb := coalesce(p_settings, '{}');
  v_teams numeric; v_radius numeric; v_rate numeric; v_reloc numeric; v_scoring boolean;
  v_medic jsonb;
  v_out jsonb;
begin
  if p_mode not in ('free', 'koth', 'patrol') or p_mode is null or jsonb_typeof(s) <> 'object' then
    raise exception 'game_settings_invalid';
  end if;
  begin
    v_teams := coalesce((s ->> 'team_count')::numeric, 2);
    v_radius := coalesce((s ->> 'radius')::numeric, 25);
    v_rate := coalesce((s ->> 'rate')::numeric, 1);
    v_scoring := coalesce((s ->> 'scoring')::boolean, true);
    v_reloc := (s ->> 'relocate_minutes')::numeric;
  exception when others then
    raise exception 'game_settings_invalid';
  end;
  v_medic := public._medic_settings(s);
  if v_teams not in (2, 3, 4) then raise exception 'game_settings_invalid'; end if;
  if p_mode = 'free' then
    v_out := jsonb_build_object('team_count', v_teams::int);
  elsif p_mode = 'patrol' then
    v_out := jsonb_build_object('team_count', v_teams::int, 'patrol', public._patrol_settings(s -> 'patrol'));
  else
    if v_radius not between 10 and 100 or v_radius <> trunc(v_radius)
       or v_rate not between 1 and 10 or v_rate <> trunc(v_rate)
       or (v_reloc is not null and (v_reloc not between 1 and 60 or v_reloc <> trunc(v_reloc))) then
      raise exception 'game_settings_invalid';
    end if;
    v_out := jsonb_build_object('team_count', v_teams::int, 'radius', v_radius::int, 'scoring', v_scoring,
                                'rate', v_rate::int, 'relocate_minutes', v_reloc::int);
  end if;
  if v_medic is not null then v_out := v_out || jsonb_build_object('medic', v_medic); end if;
  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- Team progress
-- ---------------------------------------------------------------------------

create table public.patrol_teams (
  game_id uuid not null references public.games (id) on delete cascade,
  game_day_id uuid not null references public.game_days (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  -- Mission ids this team plays from its list, in order (empty for search).
  queue jsonb not null default '[]',
  -- Every mission this team can play, list and locked.
  total int not null default 0,
  -- The mission in play, or null, and the active seconds when it became current.
  current text,
  current_since numeric not null default 0,
  -- {mission id: [step indexes scanned]} and {mission id: "done" | "failed"}.
  progress jsonb not null default '{}',
  outcome jsonb not null default '{}',
  score int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (game_id, team_id)
);

alter table public.patrol_teams enable row level security;
create policy patrol_teams_read on public.patrol_teams for select to authenticated
  using (public.is_day_member(game_day_id));
revoke insert, update, delete, truncate on public.patrol_teams from anon, authenticated;
revoke all on public.patrol_teams from anon;

create function public._patrol_mission(g public.games, p_id text)
returns jsonb language sql stable set search_path = '' as $$
  select m.value from jsonb_array_elements(g.settings -> 'patrol' -> 'missions') m
  where m.value ->> 'id' = p_id;
$$;

-- Every point a Patrol game uses must be on the day's copy of its field.
create function public._patrol_check(g public.games)
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
               union all select m.value ->> 'start') p
    where p.id is not null and not exists (
      select 1 from jsonb_array_elements(coalesce(f.data -> 'points', '[]')) pt where pt.value ->> 'id' = p.id)) then
    raise exception 'patrol_point_missing';
  end if;
end $$;

-- Each playing team's list when the game starts (or restarts after a
-- cancelled countdown).
create function public._patrol_start(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
  tm record;
  v_queue jsonb;
  v_total int;
begin
  select * into g from public.games where id = p_game;
  perform public._patrol_check(g);
  -- A restart resets every row; a team that has dropped out keeps a row with
  -- no missions, which play and the app ignore.
  update public.patrol_teams
  set queue = '[]', total = 0, current = null, current_since = 0, progress = '{}', outcome = '{}',
      score = 0, updated_at = now()
  where game_id = p_game;
  for tm in select id, sort_order from public.teams
            where game_day_id = g.game_day_id and active
              and sort_order <= coalesce((g.settings ->> 'team_count')::int, 2) loop
    select coalesce(jsonb_agg(m.value -> 'id' order by
             case when g.settings -> 'patrol' ->> 'order' = 'shuffle' then random() else m.i::float8 end)
             filter (where m.value ->> 'start' is null), '[]'),
           count(*)
    into v_queue, v_total
    from jsonb_array_elements(g.settings -> 'patrol' -> 'missions') with ordinality m (value, i)
    where jsonb_array_length(m.value -> 'teams') = 0 or m.value -> 'teams' @> to_jsonb(tm.sort_order);
    insert into public.patrol_teams (game_id, game_day_id, team_id, queue, total, current)
    values (p_game, g.game_day_id, tm.id, v_queue, v_total, v_queue ->> 0)
    on conflict (game_id, team_id) do update
    set queue = excluded.queue, total = excluded.total, current = excluded.current;
  end loop;
end $$;

-- Finish the team's current mission (done or failed) at p_at active seconds
-- and move on to the next mission in its list, if any.
create function public._patrol_close(p_game uuid, p_team uuid, p_outcome text, p_at numeric)
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
      score = score + case when p_outcome = 'done'
                           then coalesce((public._patrol_mission(g, t.current) ->> 'reward')::int, 0) else 0 end,
      updated_at = now()
  where game_id = p_game and team_id = p_team;
end $$;

-- Fail missions whose time ran out, and end the game when the chosen ending
-- is reached. The caller holds the game's row lock (via _advance_game).
create function public._patrol_update(p_game uuid)
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
  for t in select * from public.patrol_teams where game_id = p_game and current is not null loop
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

-- ---------------------------------------------------------------------------
-- Lifecycle (0005 functions, updated for Patrol)
-- ---------------------------------------------------------------------------

-- Same as 0005, plus bringing Patrol up to date.
create or replace function public._advance_game(p_game uuid)
returns public.games language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
  v_now timestamptz := clock_timestamp();
  v_total numeric;
  v_end timestamptz;
begin
  select * into g from public.games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;

  if g.state in ('countdown', 'resuming') and v_now >= g.countdown_ends_at then
    update public.games
    set state = 'live', live_since = g.countdown_ends_at, countdown_ends_at = null,
        started_at = coalesce(started_at, g.countdown_ends_at), updated_at = v_now
    where id = p_game returning * into g;
  end if;

  if g.state = 'live' and g.length_seconds is not null then
    v_total := g.length_seconds + g.extra_seconds;
    v_end := g.live_since + make_interval(secs => v_total - g.active_seconds);
    if v_now >= v_end then
      update public.games
      set state = 'complete', active_seconds = v_total, live_since = null,
          ended_at = v_end, end_reason = 'time', updated_at = v_now
      where id = p_game returning * into g;
    end if;
  end if;

  if g.mode = 'koth' then perform public._koth_update(p_game); end if;
  if g.mode = 'patrol' then
    perform public._patrol_update(p_game);
    select * into g from public.games where id = p_game;
  end if;
  return g;
end $$;

-- Same as 0005, plus setting up each team's missions for Patrol.
create or replace function public.start_game(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.games := public._admin_game(p_game);
  v_now timestamptz := clock_timestamp();
begin
  if g.state <> 'ready' then raise exception 'game_not_ready'; end if;
  if not exists (select 1 from public.day_fields where game_day_id = g.game_day_id) then
    raise exception 'field_required';
  end if;
  if g.mode = 'koth' then perform public._koth_start(p_game); end if;
  if g.mode = 'patrol' then perform public._patrol_start(p_game); end if;
  if g.countdown_seconds > 0 then
    update public.games
    set state = 'countdown', countdown_ends_at = v_now + make_interval(secs => g.countdown_seconds),
        updated_at = v_now
    where id = p_game;
  else
    update public.games
    set state = 'live', live_since = v_now, started_at = v_now, updated_at = v_now
    where id = p_game;
  end if;
  perform public._koth_update(p_game);
end $$;

-- ---------------------------------------------------------------------------
-- Scanning a point
-- ---------------------------------------------------------------------------

-- A player scans a point's code during a live Patrol game. Returns what it
-- did: {"result": "step" | "complete" | "new" | "wrong" | "already" | "busy"
-- | "nothing" | "not_here", "mission"?, "point"?, "need"?, "reward"?}.
create function public.patrol_scan(p_game uuid, p_code text)
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

  -- A step of the current mission.
  if t.current is not null then
    m := public._patrol_mission(g, t.current);
    v_got := coalesce(t.progress -> t.current, '[]');
    select (s.i - 1)::int into v_idx from jsonb_array_elements_text(m -> 'steps') with ordinality s (id, i)
    where s.id = v_point;
    if v_idx is not null then
      if v_got @> to_jsonb(v_idx) then
        return jsonb_build_object('result', 'already', 'mission', t.current, 'point', v_point);
      end if;
      if (m ->> 'in_order')::boolean and v_idx <> jsonb_array_length(v_got) then
        return jsonb_build_object('result', 'wrong', 'mission', t.current,
          'need', m -> 'steps' ->> jsonb_array_length(v_got));
      end if;
      v_got := v_got || to_jsonb(v_idx);
      update public.patrol_teams
      set progress = progress || jsonb_build_object(t.current, v_got), updated_at = now()
      where game_id = p_game and team_id = v_team;
      if jsonb_array_length(v_got) = jsonb_array_length(m -> 'steps') then
        perform public._patrol_close(p_game, v_team, 'done', v_active);
        perform public._patrol_update(p_game);
        return jsonb_build_object('result', 'complete', 'mission', t.current, 'point', v_point,
          'reward', (m ->> 'reward')::int);
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
    -- One locked mission at a time; a list mission waits and carries on after.
    if t.current is not null and public._patrol_mission(g, t.current) ->> 'start' is not null then
      return jsonb_build_object('result', 'busy', 'mission', t.current);
    end if;
    update public.patrol_teams
    set current = v_start ->> 'id', current_since = v_active, updated_at = now()
    where game_id = p_game and team_id = v_team;
    return jsonb_build_object('result', 'new', 'mission', v_start ->> 'id', 'point', v_point);
  end if;

  if t.current is not null then
    select s.id into v_need from jsonb_array_elements_text(m -> 'steps') with ordinality s (id, i)
    where not (v_got @> to_jsonb((s.i - 1)::int)) order by s.i limit 1;
    return jsonb_build_object('result', 'wrong', 'mission', t.current, 'point', v_point, 'need', v_need);
  end if;
  return jsonb_build_object('result', 'nothing', 'point', v_point);
end $$;

revoke execute on function
  public._patrol_settings(jsonb), public._patrol_mission(public.games, text),
  public._patrol_check(public.games), public._patrol_start(uuid),
  public._patrol_close(uuid, uuid, text, numeric), public._patrol_update(uuid),
  public.patrol_scan(uuid, text)
from public, anon, authenticated;
grant execute on function public.patrol_scan(uuid, text) to authenticated;

alter publication supabase_realtime add table public.patrol_teams;
