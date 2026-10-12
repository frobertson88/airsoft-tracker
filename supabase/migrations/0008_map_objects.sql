-- Map tools (plans/map-tools-proposal.md, docs/map-toolbar.md, docs/map-marker-targeting.md).
--
-- Players drop markers and draw labels, waypoints, arrows, lines and areas on the
-- day's map. Each drawing is Friendly or Enemy and is shared with a section, a
-- team or admins only. The server sends each player only the drawings meant for
-- them. Admins see everything only while Host view is on.
--
-- Drawings belong to a game: all of a day's drawings are cleared when a game
-- ends, so drawings made between games (a briefing) carry into the next game.
-- Enemy sightings disappear 30 minutes after they were reported.
-- Creators move and delete their own drawings; admins in Host view can move and
-- delete any.

alter table public.day_members add column map_host_view boolean not null default false;

create table public.map_objects (
  id uuid primary key default gen_random_uuid(),
  game_day_id uuid not null references public.game_days (id) on delete cascade,
  kind text not null check (kind in ('marker', 'label', 'waypoints', 'arrow', 'line', 'area', 'defence', 'attack')),
  marker_type text,
  affiliation text not null check (affiliation in ('friendly', 'enemy')),
  audience text not null check (audience in ('team', 'section', 'admin')),
  team_id uuid,
  section_id uuid,
  -- The team whose colour the drawing uses (null = admin only, neutral).
  colour_team_id uuid,
  label text check (label is null or char_length(label) between 1 and 40),
  points jsonb not null,
  linked boolean not null default true,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, game_day_id) references public.teams (id, game_day_id) on delete cascade,
  foreign key (section_id, team_id) references public.sections (id, team_id) on delete cascade,
  check ((audience = 'admin') = (team_id is null)),
  check ((audience = 'section') = (section_id is not null)),
  check (affiliation = 'friendly' or audience = 'team'),
  check ((kind = 'marker') = (marker_type is not null))
);
create index map_objects_day_idx on public.map_objects (game_day_id);

-- Can the caller see this drawing?
create function public.can_see_map_object(
  p_day uuid, p_audience text, p_team uuid, p_section uuid, p_creator uuid,
  p_affiliation text, p_created_at timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_affiliation = 'friendly' or p_created_at > now() - interval '30 minutes')
    and exists (
      select 1 from public.day_members v
      where v.game_day_id = p_day and v.user_id = auth.uid() and v.status = 'active'
        and ((v.is_admin and v.map_host_view)
             or v.user_id = p_creator
             or (p_audience = 'team' and v.team_id = p_team)
             or (p_audience = 'section' and v.section_id = p_section)));
$$;

alter table public.map_objects enable row level security;
create policy map_objects_read on public.map_objects for select to authenticated
  using (public.can_see_map_object(game_day_id, audience, team_id, section_id, created_by, affiliation, created_at));
revoke insert, update, delete, truncate on public.map_objects from anon, authenticated;
revoke all on public.map_objects from anon;

-- Clear a day's drawings when one of its games ends (any way it ends).
create function public._clear_map_on_game_end()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.state = 'complete' and old.state <> 'complete' then
    delete from public.map_objects where game_day_id = new.game_day_id;
  end if;
  return new;
end $$;
create trigger games_clear_map after update of state on public.games
  for each row execute function public._clear_map_on_game_end();

-- (Applied to Supabase in parts: 0008_map_objects_part1_table … part9_realtime.)

-- Checks a list of points for a kind of drawing and returns it cleaned up.
create function public._map_points(p_kind text, p_points jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  n int;
  v_min int := case p_kind when 'marker' then 1 when 'label' then 1 when 'area' then 3 else 2 end;
  v_max int := case p_kind when 'marker' then 1 when 'label' then 1 when 'arrow' then 2 else 50 end;
  v_out jsonb;
begin
  if p_points is null or jsonb_typeof(p_points) <> 'array' then raise exception 'map_points_invalid'; end if;
  n := jsonb_array_length(p_points);
  if n < v_min or n > v_max then raise exception 'map_points_invalid'; end if;
  begin
    select jsonb_agg(jsonb_build_object('lat', (p ->> 'lat')::float8, 'lng', (p ->> 'lng')::float8) order by i)
    into v_out
    from jsonb_array_elements(p_points) with ordinality as e (p, i);
  exception when others then
    raise exception 'map_points_invalid';
  end;
  if exists (select 1 from jsonb_array_elements(v_out) p
             where (p ->> 'lat') is null or (p ->> 'lng') is null
                or abs((p ->> 'lat')::float8) > 90 or abs((p ->> 'lng')::float8) > 180) then
    raise exception 'map_points_invalid';
  end if;
  return v_out;
end $$;

-- Is the caller allowed to move or delete this drawing?
create function public._can_change_map_object(o public.map_objects, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select o.created_by = p_user or exists (
    select 1 from public.day_members v
    where v.game_day_id = o.game_day_id and v.user_id = p_user and v.status = 'active'
      and v.is_admin and v.map_host_view);
$$;

-- Checks the kind of drawing, marker type and label.
create function public._map_check_kind(p_kind text, p_marker_type text, p_affiliation text, p_label text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_kind is null or p_kind not in ('marker', 'label', 'waypoints', 'arrow', 'line', 'area', 'defence', 'attack') then
    raise exception 'map_kind_invalid';
  end if;
  if p_affiliation is null or p_affiliation not in ('friendly', 'enemy') then raise exception 'map_kind_invalid'; end if;
  if p_kind = 'marker' then
    if p_marker_type is null or not (
      (p_affiliation = 'friendly' and p_marker_type in ('infantry', 'recon', 'mg', 'sniper', 'leader', '2ic', 'fob', 'rally'))
      or (p_affiliation = 'enemy' and p_marker_type in ('infantry', 'fob', 'rally', 'sniper', 'mg', 'drone', 'vehicle', 'package'))) then
      raise exception 'map_kind_invalid';
    end if;
  end if;
  if p_kind = 'label' and p_label is null then raise exception 'map_label_required'; end if;
  if char_length(coalesce(p_label, '')) > 40 then raise exception 'map_label_invalid'; end if;
end $$;

-- Tidy away expired enemy sightings.
create function public._map_tidy(p_day uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.map_objects
  where game_day_id = p_day and affiliation = 'enemy' and created_at <= now() - interval '30 minutes';
$$;

-- Admins switch Host view on the map on or off.
create function public.set_map_host_view(p_day uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public._require_user();
begin
  perform public._lock_open_day(p_day);
  perform public._require_admin(p_day, v_user);
  update public.day_members set map_host_view = coalesce(p_on, false), updated_at = now()
  where game_day_id = p_day and user_id = v_user;
end $$;

-- Place a marker or drawing. Audience:
--   team:    p_team (players: their own team; null means their own team)
--   section: p_section (players: their own section)
--   admin:   admins in Host view only
-- Enemy drawings always go to a whole team.
create function public.place_map_object(
  p_day uuid, p_kind text, p_marker_type text, p_affiliation text,
  p_audience text, p_team uuid, p_section uuid, p_label text, p_points jsonb, p_linked boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  r public.day_members;
  v_host boolean;
  v_team uuid := p_team;
  v_points jsonb;
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_id uuid;
begin
  perform public._lock_open_day(p_day);
  r := public._require_member(p_day, v_user);
  v_host := r.is_admin and r.map_host_view;

  perform public._map_check_kind(p_kind, p_marker_type, p_affiliation, v_label);
  v_points := public._map_points(p_kind, p_points);

  if p_audience is null or p_audience not in ('team', 'section', 'admin') then raise exception 'map_audience_invalid'; end if;
  if p_affiliation = 'enemy' and p_audience <> 'team' then raise exception 'map_audience_invalid'; end if;

  if p_audience = 'admin' then
    if not v_host then raise exception 'map_audience_invalid'; end if;
    v_team := null;
  elsif p_audience = 'section' then
    select team_id into v_team from public.sections s
    join public.teams t on t.id = s.team_id
    where s.id = p_section and t.game_day_id = p_day and t.active;
    if v_team is null then raise exception 'map_audience_invalid'; end if;
    if not v_host and p_section is distinct from r.section_id then raise exception 'map_audience_invalid'; end if;
  else
    v_team := coalesce(p_team, r.team_id);
    if v_team is null then raise exception 'map_no_team'; end if;
    if not exists (select 1 from public.teams where id = v_team and game_day_id = p_day and active) then
      raise exception 'map_audience_invalid';
    end if;
    if not v_host and v_team is distinct from r.team_id then raise exception 'map_audience_invalid'; end if;
  end if;

  if (select count(*) from public.map_objects where game_day_id = p_day) >= 500 then
    raise exception 'map_full';
  end if;
  perform public._map_tidy(p_day);

  insert into public.map_objects (game_day_id, kind, marker_type, affiliation, audience, team_id, section_id,
                                  colour_team_id, label, points, linked, created_by)
  values (p_day, p_kind, case when p_kind = 'marker' then p_marker_type end, p_affiliation, p_audience, v_team,
          case when p_audience = 'section' then p_section end,
          -- Host view uses the audience's team; players use their own team.
          case when v_host then v_team else coalesce(r.team_id, v_team) end,
          v_label, v_points, coalesce(p_linked, true), v_user)
  returning id into v_id;
  return v_id;
end $$;

-- Move a drawing (new points for the same kind of drawing).
create function public.move_map_object(p_object uuid, p_points jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  o public.map_objects;
begin
  select * into o from public.map_objects where id = p_object;
  if not found then raise exception 'map_object_not_found'; end if;
  perform public._lock_open_day(o.game_day_id);
  perform public._require_member(o.game_day_id, v_user);
  if not public._can_change_map_object(o, v_user) then raise exception 'map_not_allowed'; end if;
  update public.map_objects set points = public._map_points(o.kind, p_points), updated_at = now()
  where id = p_object;
end $$;

-- Delete drawings. Each one is checked; returns how many were deleted (the
-- rest were already gone or not yours to delete).
create function public.delete_map_objects(p_day uuid, p_objects uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_count int;
begin
  perform public._lock_open_day(p_day);
  perform public._require_member(p_day, v_user);
  if coalesce(array_length(p_objects, 1), 0) > 500 then raise exception 'map_points_invalid'; end if;
  with gone as (
    delete from public.map_objects o
    where o.game_day_id = p_day and o.id = any (p_objects) and public._can_change_map_object(o, v_user)
    returning 1)
  select count(*) into v_count from gone;
  return v_count;
end $$;

-- Host view ends when someone stops being an admin.
create function public._clear_host_view()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not new.is_admin then new.map_host_view := false; end if;
  return new;
end $$;
create trigger day_members_clear_host_view before update of is_admin, status on public.day_members
  for each row execute function public._clear_host_view();

revoke execute on function
  public.can_see_map_object(uuid, text, uuid, uuid, uuid, text, timestamptz),
  public._clear_map_on_game_end(),
  public._map_points(text, jsonb),
  public._map_check_kind(text, text, text, text),
  public._map_tidy(uuid),
  public._can_change_map_object(public.map_objects, uuid),
  public.set_map_host_view(uuid, boolean),
  public.place_map_object(uuid, text, text, text, text, uuid, uuid, text, jsonb, boolean),
  public.move_map_object(uuid, jsonb),
  public.delete_map_objects(uuid, uuid[]),
  public._clear_host_view()
from public, anon, authenticated;
grant execute on function
  public.can_see_map_object(uuid, text, uuid, uuid, uuid, text, timestamptz),
  public.set_map_host_view(uuid, boolean),
  public.place_map_object(uuid, text, text, text, text, uuid, uuid, text, jsonb, boolean),
  public.move_map_object(uuid, jsonb),
  public.delete_map_objects(uuid, uuid[])
to authenticated;

alter publication supabase_realtime add table public.map_objects;
