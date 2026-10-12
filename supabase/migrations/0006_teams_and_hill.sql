-- Stage 5: team count per game (plans/teams-per-game-proposal.md) and admins moving the hill.
--
-- A Game Day uses 2, 3 or 4 teams (Blue, Red, Yellow, Purple). The count is part
-- of game setup (settings.team_count, any mode) and is applied between games by
-- arrange_teams, which also fills teams: keep, shuffle (random and balanced) or
-- clear (everyone picks again). Teams beyond the count stay in the table but are
-- inactive, so past results keep their team names.
--
-- While a game is running, players already on a team can't switch; players with
-- no team can still pick one, and admins can still move anyone.

alter table public.teams drop constraint teams_colour_check;
alter table public.teams add constraint teams_colour_check
  check (colour in ('blue', 'red', 'yellow', 'purple'));
alter table public.teams add column active boolean not null default true;
alter table public.game_days add column team_count int not null default 2
  check (team_count between 2 and 4);

-- True while a game in this day is counting down, live, paused or resuming.
create function public._game_running(p_day uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.games
                 where game_day_id = p_day and state in ('countdown', 'live', 'paused', 'resuming'));
$$;

-- Same as 0005, plus settings.team_count (2–4, default 2) for every mode.
create or replace function public._game_settings(p_mode text, p_settings jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  s jsonb := coalesce(p_settings, '{}');
  v_teams numeric; v_radius numeric; v_rate numeric; v_reloc numeric; v_scoring boolean;
begin
  if p_mode not in ('free', 'koth') or p_mode is null or jsonb_typeof(s) <> 'object' then
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
  if v_teams not in (2, 3, 4) then raise exception 'game_settings_invalid'; end if;
  if p_mode = 'free' then return jsonb_build_object('team_count', v_teams::int); end if;
  if v_radius not between 10 and 100 or v_radius <> trunc(v_radius)
     or v_rate not between 1 and 10 or v_rate <> trunc(v_rate)
     or (v_reloc is not null and (v_reloc not between 1 and 60 or v_reloc <> trunc(v_reloc))) then
    raise exception 'game_settings_invalid';
  end if;
  return jsonb_build_object('team_count', v_teams::int, 'radius', v_radius::int, 'scoring', v_scoring,
                            'rate', v_rate::int, 'relocate_minutes', v_reloc::int);
end $$;

-- Set the number of teams and how players are placed on them (between games).
--   keep:    players stay; anyone on a team that is no longer used picks again.
--   shuffle: everyone who was on a team is dealt onto random, balanced teams.
--   clear:   everyone picks a team again.
-- Sections are cleared for anyone whose team changes.
create function public.arrange_teams(p_day uuid, p_count int, p_fill text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_teams uuid[];
  v_players uuid[];
  i int;
begin
  perform public._lock_open_day(p_day);
  perform public._require_admin(p_day, v_user);
  if p_count is null or p_count not between 2 and 4 then raise exception 'team_count_invalid'; end if;
  if p_fill is null or p_fill not in ('keep', 'shuffle', 'clear') then raise exception 'team_fill_invalid'; end if;
  if public._game_running(p_day) then raise exception 'game_running'; end if;

  insert into public.teams (game_day_id, name, colour, sort_order)
  select p_day, t.name, t.colour, t.sort_order
  from (values ('Blue', 'blue', 1), ('Red', 'red', 2), ('Yellow', 'yellow', 3), ('Purple', 'purple', 4))
         as t (name, colour, sort_order)
  where t.sort_order <= p_count
  on conflict (game_day_id, sort_order) do nothing;
  update public.teams set active = sort_order <= p_count where game_day_id = p_day;
  update public.game_days set team_count = p_count where id = p_day;

  -- Who was playing before the change (shuffle deals these out again).
  select coalesce(array_agg(user_id order by random()), '{}') into v_players
  from public.day_members
  where game_day_id = p_day and status = 'active' and team_id is not null;

  if p_fill = 'clear' then
    update public.day_members set team_id = null, section_id = null, updated_at = now()
    where game_day_id = p_day and team_id is not null;
  elsif p_fill = 'shuffle' then
    select array_agg(id order by random()) into v_teams
    from public.teams where game_day_id = p_day and active;
    for i in 1 .. coalesce(array_length(v_players, 1), 0) loop
      update public.day_members
      set team_id = v_teams[(i - 1) % p_count + 1],
          section_id = case when team_id = v_teams[(i - 1) % p_count + 1] then section_id else null end,
          updated_at = now()
      where game_day_id = p_day and user_id = v_players[i];
    end loop;
  end if;

  -- Nobody stays on a team that is no longer used.
  update public.day_members m set team_id = null, section_id = null, updated_at = now()
  from public.teams t
  where m.game_day_id = p_day and t.id = m.team_id and not t.active;
end $$;

-- Same as 0001, plus: only active teams, and no switching mid-game.
create or replace function public.choose_team(p_day uuid, p_team uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  r public.day_members;
begin
  perform public._lock_open_day(p_day);
  r := public._require_member(p_day, v_user);
  if not exists (select 1 from public.teams where id = p_team and game_day_id = p_day and active) then
    raise exception 'team_not_found';
  end if;
  if r.team_id is not null and r.team_id <> p_team and public._game_running(p_day) then
    raise exception 'team_locked';
  end if;
  update public.day_members
  set team_id = p_team,
      section_id = case when r.team_id = p_team then section_id else null end,
      updated_at = now()
  where game_day_id = p_day and user_id = v_user;
end $$;

-- Same as 0001, plus: only active teams.
create or replace function public.admin_set_assignment(
  p_day uuid, p_user uuid, p_role text, p_team uuid, p_section uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public._require_user();
begin
  perform public._lock_open_day(p_day);
  perform public._require_admin(p_day, v_user);
  perform public._require_member(p_day, p_user);
  if p_team is not null and not exists (
    select 1 from public.teams where id = p_team and game_day_id = p_day and active) then
    raise exception 'team_not_found';
  end if;
  if p_section is not null and not exists (
    select 1 from public.sections where id = p_section and team_id = p_team) then
    raise exception 'section_not_found';
  end if;
  update public.day_members
  set day_role = p_role, team_id = p_team, section_id = p_section, updated_at = now()
  where game_day_id = p_day and user_id = p_user;
end $$;

-- ---------------------------------------------------------------------------
-- Moving the hill
-- ---------------------------------------------------------------------------

-- Is a hill of this radius at this spot fully inside the boundary and clear of
-- every No-go and Danger area? (Same geometry as _koth_place.)
create function public._koth_spot_ok(p_data jsonb, p_radius double precision,
                                     p_lat double precision, p_lng double precision)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  polys jsonb;
  lat0 double precision := (p_data -> 'boundary' -> 0 ->> 'lat')::float8;
  lng0 double precision := (p_data -> 'boundary' -> 0 ->> 'lng')::float8;
  kx double precision;
  ky constant double precision := 110540;
  x double precision; y double precision;
  i int; j int; n int;
  ax double precision; ay double precision; qx double precision; qy double precision;
  dx double precision; dy double precision; len2 double precision; t double precision;
  d double precision; inside boolean;
begin
  if lat0 is null or lng0 is null or p_lat is null or p_lng is null then return false; end if;
  kx := 111320 * cos(radians(lat0));
  x := (p_lng - lng0) * kx;
  y := (p_lat - lat0) * ky;
  polys := jsonb_build_array(p_data -> 'boundary')
    || coalesce((select jsonb_agg(a -> 'points') from jsonb_array_elements(coalesce(p_data -> 'areas', '[]')) a), '[]');
  for i in 0 .. jsonb_array_length(polys) - 1 loop
    n := jsonb_array_length(polys -> i);
    inside := false;
    d := 'Infinity';
    for j in 0 .. n - 1 loop
      ax := ((polys -> i -> j ->> 'lng')::float8 - lng0) * kx;
      ay := ((polys -> i -> j ->> 'lat')::float8 - lat0) * ky;
      qx := ((polys -> i -> ((j + 1) % n) ->> 'lng')::float8 - lng0) * kx;
      qy := ((polys -> i -> ((j + 1) % n) ->> 'lat')::float8 - lat0) * ky;
      if (ay > y) <> (qy > y) and x < (qx - ax) * (y - ay) / (qy - ay) + ax then
        inside := not inside;
      end if;
      dx := qx - ax; dy := qy - ay;
      len2 := dx * dx + dy * dy;
      t := case when len2 = 0 then 0 else greatest(0, least(1, ((x - ax) * dx + (y - ay) * dy) / len2)) end;
      d := least(d, sqrt((x - ax - t * dx) ^ 2 + (y - ay - t * dy) ^ 2));
    end loop;
    if (i = 0) <> inside or d < p_radius then return false; end if;
  end loop;
  return true;
end $$;

-- An admin moves the hill of a running KOTH game: to a spot they chose, or to a
-- new random spot when p_lat/p_lng are null. Scores up to now are kept, and an
-- automatic relocation timer restarts from the move.
create function public.move_hill(p_game uuid, p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.games := public._admin_game(p_game);
  k public.koth_state;
  v_data jsonb;
  v_radius double precision := (g.settings ->> 'radius')::float8;
  v_spot double precision[];
begin
  if g.mode <> 'koth' then raise exception 'not_koth'; end if;
  if g.state not in ('countdown', 'live', 'paused', 'resuming') then raise exception 'game_not_running'; end if;
  select * into k from public.koth_state where game_id = p_game for update;
  select data into v_data from public.day_fields where game_day_id = g.game_day_id;
  if p_lat is null or p_lng is null then
    v_spot := public._koth_place(v_data, v_radius, k.hill_lat, k.hill_lng);
    if v_spot is null then raise exception 'koth_no_space'; end if;
  else
    if not public._koth_spot_ok(v_data, v_radius, p_lat, p_lng) then raise exception 'hill_spot_invalid'; end if;
    v_spot := array[p_lat, p_lng];
  end if;
  update public.koth_state
  set hill_lat = v_spot[1], hill_lng = v_spot[2], hill_number = hill_number + 1,
      placed_active = public._game_active(g, clock_timestamp()),
      control = 'empty', holder_team_id = null, counts = '{}', updated_at = now()
  where game_id = p_game;
  perform public._koth_update(p_game);
end $$;

revoke execute on function
  public._game_running(uuid),
  public._koth_spot_ok(jsonb, double precision, double precision, double precision),
  public.arrange_teams(uuid, int, text),
  public.move_hill(uuid, double precision, double precision)
from public, anon, authenticated;
grant execute on function
  public.arrange_teams(uuid, int, text),
  public.move_hill(uuid, double precision, double precision)
to authenticated;
