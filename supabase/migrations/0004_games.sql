-- Stage 3: games with a shared lifecycle and clock, and live positions.
-- Lifecycle (docs/architecture.md §4, docs/app-flow.md §8):
--   ready → countdown → live ⇄ paused → resuming → live … → complete
-- Time-based steps (countdown/resume ending, a timed game running out) happen
-- lazily: any command or tick_game() call advances the game to where the clock
-- says it should be. Phones call tick_game() when their own timer reaches zero.

create type public.game_state as enum ('ready', 'countdown', 'live', 'paused', 'resuming', 'complete');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  game_day_id uuid not null references public.game_days (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  -- null = Unlimited
  length_seconds int check (length_seconds between 60 and 86400),
  countdown_seconds int not null default 0 check (countdown_seconds between 0 and 1800),
  extra_seconds int not null default 0 check (extra_seconds >= 0),
  state public.game_state not null default 'ready',
  -- Active play before the current live stretch began.
  active_seconds numeric not null default 0,
  -- Start of the current live stretch (state = live only).
  live_since timestamptz,
  -- When the current start or resume countdown finishes.
  countdown_ends_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  end_reason text check (end_reason in ('ended', 'time')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index games_day_idx on public.games (game_day_id, created_at desc);
-- At most one unfinished game per Game Day.
create unique index games_one_open on public.games (game_day_id) where state <> 'complete';

-- Latest position of each player in a Game Day (no route history in Stage 3).
create table public.positions (
  game_day_id uuid not null references public.game_days (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy real check (accuracy >= 0),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (game_day_id, user_id)
);

-- Can the caller see this player's position? Yourself; your own team; or
-- everyone if you're an admin hosting without a team (docs/location-and-device-operation.md).
create function public.can_see_position(p_day uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.day_members viewer
    join public.day_members target
      on target.game_day_id = viewer.game_day_id and target.user_id = p_user
    where viewer.game_day_id = p_day
      and viewer.user_id = auth.uid()
      and viewer.status = 'active' and target.status = 'active'
      and (viewer.user_id = target.user_id
           or (viewer.team_id is not null and viewer.team_id = target.team_id)
           or (viewer.is_admin and viewer.team_id is null)));
$$;

alter table public.games enable row level security;
alter table public.positions enable row level security;
create policy games_read on public.games for select to authenticated
  using (public.is_day_member(game_day_id));
create policy positions_read on public.positions for select to authenticated
  using (public.can_see_position(game_day_id, user_id));
revoke insert, update, delete, truncate on public.games, public.positions from anon, authenticated;
revoke all on public.games, public.positions from anon;

-- ---------------------------------------------------------------------------
-- Clock helpers
-- ---------------------------------------------------------------------------

-- Bring a locked game up to date with the clock and return it.
create function public._advance_game(p_game uuid)
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
  return g;
end $$;

-- Lock and advance a game, check the day is open and the caller is an admin.
create function public._admin_game(p_game uuid)
returns public.games language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_day uuid;
begin
  select game_day_id into v_day from public.games where id = p_game;
  if not found then raise exception 'game_not_found'; end if;
  perform public._lock_open_day(v_day);
  perform public._require_admin(v_day, v_user);
  return public._advance_game(p_game);
end $$;

-- ---------------------------------------------------------------------------
-- Commands
-- ---------------------------------------------------------------------------

create function public.create_game(
  p_day uuid, p_name text, p_length_seconds int, p_countdown_seconds int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_game uuid;
begin
  perform public._lock_open_day(p_day);
  perform public._require_admin(p_day, v_user);
  -- Finish off a timed game that has run out before checking for an open one.
  perform public._advance_game(id) from public.games
  where game_day_id = p_day and state <> 'complete';
  if exists (select 1 from public.games where game_day_id = p_day and state <> 'complete') then
    raise exception 'game_in_progress';
  end if;
  insert into public.games (game_day_id, name, length_seconds, countdown_seconds, created_by)
  values (p_day, btrim(p_name), p_length_seconds, coalesce(p_countdown_seconds, 0), v_user)
  returning id into v_game;
  return v_game;
end $$;

-- Change a ready game's settings.
create function public.update_game(
  p_game uuid, p_name text, p_length_seconds int, p_countdown_seconds int)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.games := public._admin_game(p_game);
begin
  if g.state <> 'ready' then raise exception 'game_not_ready'; end if;
  update public.games
  set name = btrim(p_name), length_seconds = p_length_seconds,
      countdown_seconds = coalesce(p_countdown_seconds, 0), updated_at = now()
  where id = p_game;
end $$;

-- Start: countdown if one is set, otherwise straight to live. Needs a field.
create function public.start_game(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.games := public._admin_game(p_game);
  v_now timestamptz := clock_timestamp();
begin
  if g.state <> 'ready' then raise exception 'game_not_ready'; end if;
  if not exists (select 1 from public.day_fields where game_day_id = g.game_day_id) then
    raise exception 'field_required';
  end if;
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
end $$;

-- Skip the rest of a start countdown (keeps the full game length).
create function public.force_start(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.games := public._admin_game(p_game);
  v_now timestamptz := clock_timestamp();
begin
  if g.state <> 'countdown' then raise exception 'game_not_counting_down'; end if;
  update public.games
  set state = 'live', live_since = v_now, started_at = v_now, countdown_ends_at = null, updated_at = v_now
  where id = p_game;
end $$;

-- Cancel a start countdown (back to ready) or a resume countdown (stays paused).
create function public.cancel_countdown(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.games := public._admin_game(p_game);
begin
  if g.state = 'countdown' then
    update public.games set state = 'ready', countdown_ends_at = null, updated_at = now() where id = p_game;
  elsif g.state = 'resuming' then
    update public.games set state = 'paused', countdown_ends_at = null, updated_at = now() where id = p_game;
  else
    raise exception 'game_not_counting_down';
  end if;
end $$;

create function public.pause_game(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.games := public._admin_game(p_game);
  v_now timestamptz := clock_timestamp();
begin
  if g.state <> 'live' then raise exception 'game_not_live'; end if;
  update public.games
  set state = 'paused',
      active_seconds = g.active_seconds + extract(epoch from v_now - g.live_since),
      live_since = null, updated_at = v_now
  where id = p_game;
end $$;

-- Resume after a shared countdown (10 seconds unless given).
create function public.resume_game(p_game uuid, p_countdown_seconds int default 10)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.games := public._admin_game(p_game);
  v_now timestamptz := clock_timestamp();
begin
  if g.state <> 'paused' then raise exception 'game_not_paused'; end if;
  if coalesce(p_countdown_seconds, 0) > 0 then
    update public.games
    set state = 'resuming', countdown_ends_at = v_now + make_interval(secs => p_countdown_seconds),
        updated_at = v_now
    where id = p_game;
  else
    update public.games set state = 'live', live_since = v_now, updated_at = v_now where id = p_game;
  end if;
end $$;

create function public.add_time(p_game uuid, p_seconds int)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.games := public._admin_game(p_game);
begin
  if g.state = 'complete' then raise exception 'game_complete'; end if;
  if g.length_seconds is null then raise exception 'game_unlimited'; end if;
  if p_seconds is null or p_seconds <= 0 or p_seconds > 7200 then raise exception 'invalid_time'; end if;
  update public.games set extra_seconds = extra_seconds + p_seconds, updated_at = now() where id = p_game;
end $$;

create function public.end_game(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.games := public._admin_game(p_game);
  v_now timestamptz := clock_timestamp();
begin
  if g.state = 'complete' then return; end if;
  update public.games
  set state = 'complete',
      active_seconds = g.active_seconds
        + case when g.state = 'live' then extract(epoch from v_now - g.live_since) else 0 end,
      live_since = null, countdown_ends_at = null, ended_at = v_now, end_reason = 'ended',
      updated_at = v_now
  where id = p_game;
end $$;

-- A new ready game with the same settings as a finished one.
create function public.play_again(p_game uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare g public.games := public._admin_game(p_game);
begin
  if g.state <> 'complete' then raise exception 'game_not_complete'; end if;
  return public.create_game(g.game_day_id, g.name, g.length_seconds, g.countdown_seconds);
end $$;

-- Any member may nudge the clock forward (e.g. when their countdown hits zero).
create function public.tick_game(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_day uuid;
begin
  select game_day_id into v_day from public.games where id = p_game;
  if not found then raise exception 'game_not_found'; end if;
  perform public._require_member(v_day, v_user);
  perform public._advance_game(p_game);
end $$;

-- The server's clock, so phones can correct for their own clock being off.
create function public.server_now()
returns timestamptz language sql stable set search_path = '' as $$ select now(); $$;

-- ---------------------------------------------------------------------------
-- Positions
-- ---------------------------------------------------------------------------

create function public.report_position(
  p_day uuid, p_lat double precision, p_lng double precision, p_accuracy real, p_recorded_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_status public.day_status;
begin
  select status into v_status from public.game_days where id = p_day;
  if not found then raise exception 'day_not_found'; end if;
  if v_status <> 'open' then raise exception 'day_closed'; end if;
  perform public._require_member(p_day, v_user);
  if p_recorded_at > now() + interval '1 minute' then raise exception 'invalid_time'; end if;
  insert into public.positions (game_day_id, user_id, lat, lng, accuracy, recorded_at)
  values (p_day, v_user, p_lat, p_lng, p_accuracy, least(p_recorded_at, now()))
  on conflict (game_day_id, user_id) do update
  set lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy,
      recorded_at = excluded.recorded_at, received_at = now()
  where public.positions.recorded_at <= excluded.recorded_at;
end $$;

-- Leaving or being removed stops sharing: drop the stored position.
create function public._drop_position_on_leave()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'active' and old.status = 'active' then
    delete from public.positions where game_day_id = new.game_day_id and user_id = new.user_id;
  end if;
  return new;
end $$;
create trigger day_members_drop_position
  after update on public.day_members
  for each row execute function public._drop_position_on_leave();

-- Closing the day drops every position and ends an unfinished game.
create function public._close_day_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'closed' and old.status = 'open' then
    delete from public.positions where game_day_id = new.id;
    update public.games
    set state = 'complete', live_since = null, countdown_ends_at = null,
        ended_at = coalesce(ended_at, now()), end_reason = coalesce(end_reason, 'ended'), updated_at = now()
    where game_day_id = new.id and state <> 'complete';
  end if;
  return new;
end $$;
create trigger game_days_close_cleanup
  after update on public.game_days
  for each row execute function public._close_day_cleanup();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

revoke execute on function
  public.can_see_position(uuid, uuid), public._advance_game(uuid), public._admin_game(uuid),
  public.create_game(uuid, text, int, int), public.update_game(uuid, text, int, int),
  public.start_game(uuid), public.force_start(uuid), public.cancel_countdown(uuid),
  public.pause_game(uuid), public.resume_game(uuid, int), public.add_time(uuid, int),
  public.end_game(uuid), public.play_again(uuid), public.tick_game(uuid), public.server_now(),
  public.report_position(uuid, double precision, double precision, real, timestamptz),
  public._drop_position_on_leave(), public._close_day_cleanup()
from public, anon, authenticated;
grant execute on function
  public.can_see_position(uuid, uuid),
  public.create_game(uuid, text, int, int), public.update_game(uuid, text, int, int),
  public.start_game(uuid), public.force_start(uuid), public.cancel_countdown(uuid),
  public.pause_game(uuid), public.resume_game(uuid, int), public.add_time(uuid, int),
  public.end_game(uuid), public.play_again(uuid), public.tick_game(uuid), public.server_now(),
  public.report_position(uuid, double precision, double precision, real, timestamptz)
to authenticated;

alter publication supabase_realtime add table public.games, public.positions;
