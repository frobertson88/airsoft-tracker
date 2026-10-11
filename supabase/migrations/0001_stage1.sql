-- Stage 1: profiles, Game Days, teams, sections, membership and admin commands.
-- Clients read through Row Level Security and change state only through the
-- command functions below (docs/architecture.md §3, §9).
-- Errors are raised with a short machine key as the message (e.g. 'last_admin');
-- the app maps keys to user-facing text.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create type public.day_status as enum ('open', 'closed');
create type public.member_status as enum ('active', 'left', 'removed');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  callsign text not null check (char_length(btrim(callsign)) between 1 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_days (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  status public.day_status not null default 'open',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  game_day_id uuid not null references public.game_days (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 24),
  colour text not null check (colour in ('blue', 'red')),
  sort_order int not null,
  unique (game_day_id, sort_order),
  unique (id, game_day_id)
);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  game_day_id uuid not null,
  team_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 24),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (team_id, game_day_id) references public.teams (id, game_day_id) on delete cascade,
  unique (id, team_id)
);
create unique index sections_team_name_key on public.sections (team_id, lower(btrim(name)));

create table public.day_members (
  game_day_id uuid not null references public.game_days (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  day_role text check (day_role in (
    'Rifleman', 'Machine Gunner', 'Sniper', 'Medic',
    'Section Leader', 'Team Commander', 'Other')),
  team_id uuid,
  section_id uuid,
  is_admin boolean not null default false,
  status public.member_status not null default 'active',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_day_id, user_id),
  -- team must belong to this day; section must belong to the member's team
  foreign key (team_id, game_day_id) references public.teams (id, game_day_id),
  foreign key (section_id, team_id) references public.sections (id, team_id),
  check (section_id is null or team_id is not null),
  check (status = 'active' or is_admin = false)
);
create index day_members_user_idx on public.day_members (user_id);

-- ---------------------------------------------------------------------------
-- Read access (RLS). No write policies: writes go through command functions.
-- ---------------------------------------------------------------------------

create function public.is_day_member(p_day uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.day_members m
    where m.game_day_id = p_day and m.user_id = auth.uid() and m.status = 'active');
$$;

create function public.is_day_admin(p_day uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.day_members m
    where m.game_day_id = p_day and m.user_id = auth.uid()
      and m.status = 'active' and m.is_admin);
$$;

alter table public.profiles enable row level security;
alter table public.game_days enable row level security;
alter table public.teams enable row level security;
alter table public.sections enable row level security;
alter table public.day_members enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy game_days_read on public.game_days for select to authenticated using (true);
create policy teams_read on public.teams for select to authenticated using (true);
create policy sections_read on public.sections for select to authenticated using (true);
create policy day_members_read on public.day_members for select to authenticated
  using (user_id = auth.uid() or public.is_day_member(game_day_id));

revoke insert, update, delete, truncate on
  public.profiles, public.game_days, public.teams, public.sections, public.day_members
  from anon, authenticated;
revoke all on public.profiles, public.game_days, public.teams, public.sections, public.day_members
  from anon;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

create function public._require_user()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'not_authenticated'; end if;
  return v;
end $$;

-- Locks the day row (serialises admin-count changes) and checks it is open.
create function public._lock_open_day(p_day uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.day_status;
begin
  select status into v_status from public.game_days where id = p_day for update;
  if not found then raise exception 'day_not_found'; end if;
  if v_status <> 'open' then raise exception 'day_closed'; end if;
end $$;

create function public._require_member(p_day uuid, p_user uuid)
returns public.day_members language plpgsql security definer set search_path = '' as $$
declare r public.day_members;
begin
  select * into r from public.day_members
  where game_day_id = p_day and user_id = p_user and status = 'active';
  if not found then raise exception 'not_member'; end if;
  return r;
end $$;

create function public._require_admin(p_day uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public._require_member(p_day, p_user)).is_admin then
    raise exception 'not_admin';
  end if;
end $$;

create function public._other_admin_count(p_day uuid, p_user uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.day_members
  where game_day_id = p_day and user_id <> p_user and status = 'active' and is_admin;
$$;

-- ---------------------------------------------------------------------------
-- Profile
-- ---------------------------------------------------------------------------

create function public.set_callsign(p_callsign text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public._require_user();
begin
  insert into public.profiles (id, callsign) values (v_user, btrim(p_callsign))
  on conflict (id) do update set callsign = excluded.callsign, updated_at = now();
end $$;

-- ---------------------------------------------------------------------------
-- Game Days
-- ---------------------------------------------------------------------------

create function public.create_game_day(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_day uuid;
begin
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'profile_required';
  end if;
  insert into public.game_days (name, created_by) values (btrim(p_name), v_user)
  returning id into v_day;
  insert into public.teams (game_day_id, name, colour, sort_order)
  values (v_day, 'Blue', 'blue', 1), (v_day, 'Red', 'red', 2);
  insert into public.day_members (game_day_id, user_id, is_admin)
  values (v_day, v_user, true);
  return v_day;
end $$;

-- Public list of open days with host and active player count.
create function public.list_open_days()
returns table (id uuid, name text, host_callsign text, player_count int,
               created_at timestamptz, my_status public.member_status)
language sql stable security definer set search_path = '' as $$
  select d.id, d.name, p.callsign,
    (select count(*)::int from public.day_members m
      where m.game_day_id = d.id and m.status = 'active'),
    d.created_at,
    (select m.status from public.day_members m
      where m.game_day_id = d.id and m.user_id = auth.uid())
  from public.game_days d
  left join public.profiles p on p.id = d.created_by
  where d.status = 'open' and auth.uid() is not null
  order by d.created_at desc;
$$;

-- Idempotent: joining an already-joined day is a no-op.
create function public.join_game_day(p_day uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_status public.member_status;
begin
  perform public._lock_open_day(p_day);
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'profile_required';
  end if;
  select status into v_status from public.day_members
  where game_day_id = p_day and user_id = v_user;
  if v_status = 'removed' then raise exception 'removed'; end if;
  if v_status = 'left' then
    update public.day_members set status = 'active', updated_at = now()
    where game_day_id = p_day and user_id = v_user;
  elsif v_status is null then
    insert into public.day_members (game_day_id, user_id) values (p_day, v_user);
  end if;
end $$;

create function public.leave_game_day(p_day uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  r public.day_members;
begin
  perform public._lock_open_day(p_day);
  r := public._require_member(p_day, v_user);
  if r.is_admin and public._other_admin_count(p_day, v_user) = 0 then
    raise exception 'last_admin';
  end if;
  update public.day_members set status = 'left', is_admin = false, updated_at = now()
  where game_day_id = p_day and user_id = v_user;
end $$;

-- ---------------------------------------------------------------------------
-- Player setup: role, team, section
-- ---------------------------------------------------------------------------

create function public.set_day_role(p_day uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public._require_user();
begin
  perform public._lock_open_day(p_day);
  perform public._require_member(p_day, v_user);
  update public.day_members set day_role = p_role, updated_at = now()
  where game_day_id = p_day and user_id = v_user;
end $$;

-- Moving team clears a section that belonged to the previous team.
create function public.choose_team(p_day uuid, p_team uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  r public.day_members;
begin
  perform public._lock_open_day(p_day);
  r := public._require_member(p_day, v_user);
  if not exists (select 1 from public.teams where id = p_team and game_day_id = p_day) then
    raise exception 'team_not_found';
  end if;
  update public.day_members
  set team_id = p_team,
      section_id = case when r.team_id = p_team then section_id else null end,
      updated_at = now()
  where game_day_id = p_day and user_id = v_user;
end $$;

-- p_section null = Unassigned.
create function public.choose_section(p_day uuid, p_section uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  r public.day_members;
begin
  perform public._lock_open_day(p_day);
  r := public._require_member(p_day, v_user);
  if r.team_id is null then raise exception 'team_required'; end if;
  if p_section is not null and not exists (
    select 1 from public.sections where id = p_section and team_id = r.team_id) then
    raise exception 'section_not_found';
  end if;
  update public.day_members set section_id = p_section, updated_at = now()
  where game_day_id = p_day and user_id = v_user;
end $$;

-- Create a section in the caller's own team and join it.
create function public.create_section(p_day uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  r public.day_members;
  v_section uuid;
begin
  perform public._lock_open_day(p_day);
  r := public._require_member(p_day, v_user);
  if r.team_id is null then raise exception 'team_required'; end if;
  begin
    insert into public.sections (game_day_id, team_id, name, created_by)
    values (p_day, r.team_id, btrim(p_name), v_user)
    returning id into v_section;
  exception when unique_violation then
    raise exception 'section_name_taken';
  end;
  update public.day_members set section_id = v_section, updated_at = now()
  where game_day_id = p_day and user_id = v_user;
  return v_section;
end $$;

-- ---------------------------------------------------------------------------
-- Admin commands
-- ---------------------------------------------------------------------------

create function public.rename_team(p_team uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_day uuid;
begin
  select game_day_id into v_day from public.teams where id = p_team;
  if not found then raise exception 'team_not_found'; end if;
  perform public._lock_open_day(v_day);
  perform public._require_admin(v_day, v_user);
  update public.teams set name = btrim(p_name) where id = p_team;
end $$;

-- Correct another player's role/team/section (any may be null).
create function public.admin_set_assignment(
  p_day uuid, p_user uuid, p_role text, p_team uuid, p_section uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public._require_user();
begin
  perform public._lock_open_day(p_day);
  perform public._require_admin(p_day, v_user);
  perform public._require_member(p_day, p_user);
  if p_team is not null and not exists (
    select 1 from public.teams where id = p_team and game_day_id = p_day) then
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

create function public.set_admin(p_day uuid, p_user uuid, p_is_admin boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  r public.day_members;
begin
  perform public._lock_open_day(p_day);
  perform public._require_admin(p_day, v_user);
  r := public._require_member(p_day, p_user);
  if r.is_admin and not p_is_admin and public._other_admin_count(p_day, p_user) = 0 then
    raise exception 'last_admin';
  end if;
  update public.day_members set is_admin = p_is_admin, updated_at = now()
  where game_day_id = p_day and user_id = p_user;
end $$;

create function public.remove_member(p_day uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  r public.day_members;
begin
  perform public._lock_open_day(p_day);
  perform public._require_admin(p_day, v_user);
  r := public._require_member(p_day, p_user);
  if r.is_admin and public._other_admin_count(p_day, p_user) = 0 then
    raise exception 'last_admin';
  end if;
  update public.day_members
  set status = 'removed', is_admin = false, team_id = null, section_id = null,
      updated_at = now()
  where game_day_id = p_day and user_id = p_user;
end $$;

create function public.readmit_member(p_day uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public._require_user();
begin
  perform public._lock_open_day(p_day);
  perform public._require_admin(p_day, v_user);
  update public.day_members set status = 'active', updated_at = now()
  where game_day_id = p_day and user_id = p_user and status = 'removed';
  if not found then raise exception 'not_removed'; end if;
end $$;

create function public.close_game_day(p_day uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public._require_user();
begin
  perform public._lock_open_day(p_day);
  perform public._require_admin(p_day, v_user);
  update public.game_days set status = 'closed', closed_at = now() where id = p_day;
end $$;

-- ---------------------------------------------------------------------------
-- Function access: helpers private; commands for signed-in users only.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_day_member(uuid), public.is_day_admin(uuid),
  public.set_callsign(text), public.create_game_day(text), public.list_open_days(),
  public.join_game_day(uuid), public.leave_game_day(uuid),
  public.set_day_role(uuid, text), public.choose_team(uuid, uuid),
  public.choose_section(uuid, uuid), public.create_section(uuid, text),
  public.rename_team(uuid, text),
  public.admin_set_assignment(uuid, uuid, text, uuid, uuid),
  public.set_admin(uuid, uuid, boolean), public.remove_member(uuid, uuid),
  public.readmit_member(uuid, uuid), public.close_game_day(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: clients refetch when these change (RLS still applies).
-- ---------------------------------------------------------------------------

alter publication supabase_realtime
  add table public.game_days, public.teams, public.sections, public.day_members, public.profiles;
