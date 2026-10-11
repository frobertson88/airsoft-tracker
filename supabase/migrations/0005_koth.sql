-- Stage 4: King of the Hill (docs/game-modes.md#king-of-the-hill) and saved game setups.
--
-- A game now has a mode ('free' = Stage 3 behaviour, or 'koth') and mode settings.
-- KOTH settings (all optional; defaults in brackets):
--   {"radius": 10–100 metres [25], "scoring": bool [true],
--    "rate": points per second 1–10 [1], "relocate_minutes": 1–60 or null [null = fixed hill]}
--
-- The hill and its control live in koth_state, one row per started KOTH game.
-- Like the game clock, it is brought up to date lazily: every position report,
-- tick_game and admin command calls _koth_update. Score accrues for the holding
-- team over active play time only (so pause freezes it), and is stored as of
-- last_active; phones add (active time - last_active) * rate for the holder.
-- The row is only rewritten when the hill, control or counts change, so position
-- reports don't flood realtime.
--
-- A position counts towards control if it is at most 30 seconds old and accurate
-- to 30 metres or better; any other player is "unknown", never "outside".

alter table public.games
  add column mode text not null default 'free' check (mode in ('free', 'koth')),
  add column settings jsonb not null default '{}';

create table public.koth_state (
  game_id uuid primary key references public.games (id) on delete cascade,
  game_day_id uuid not null references public.game_days (id) on delete cascade,
  hill_lat double precision not null,
  hill_lng double precision not null,
  -- 1 for the first hill, +1 on each relocation (phones buzz when it changes).
  hill_number int not null default 1,
  -- Active play seconds when the current hill was placed / when scores were last stored.
  placed_active numeric not null default 0,
  last_active numeric not null default 0,
  control text not null default 'empty' check (control in ('empty', 'held', 'contested')),
  holder_team_id uuid references public.teams (id) on delete set null,
  counts jsonb not null default '{}',   -- {team_id: players counted inside}
  scores jsonb not null default '{}',   -- {team_id: points as of last_active}
  unknown int not null default 0,       -- team players with no recent, accurate position
  result text check (result in ('win', 'draw', 'none')),
  winner_team_id uuid references public.teams (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.game_setups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  mode text not null check (mode in ('free', 'koth')),
  length_seconds int check (length_seconds between 60 and 86400),
  countdown_seconds int not null default 0 check (countdown_seconds between 0 and 1800),
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index game_setups_owner_idx on public.game_setups (owner_id);

alter table public.koth_state enable row level security;
alter table public.game_setups enable row level security;
create policy koth_state_read on public.koth_state for select to authenticated
  using (public.is_day_member(game_day_id));
create policy game_setups_read on public.game_setups for select to authenticated
  using (owner_id = auth.uid());
revoke insert, update, delete, truncate on public.koth_state, public.game_setups from anon, authenticated;
revoke all on public.koth_state, public.game_setups from anon;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

-- Validate mode settings and fill in defaults. Raises 'game_settings_invalid'.
create function public._game_settings(p_mode text, p_settings jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  s jsonb := coalesce(p_settings, '{}');
  v_radius numeric; v_rate numeric; v_reloc numeric; v_scoring boolean;
begin
  if p_mode = 'free' then return '{}'; end if;
  if p_mode is distinct from 'koth' or jsonb_typeof(s) <> 'object' then
    raise exception 'game_settings_invalid';
  end if;
  begin
    v_radius := coalesce((s ->> 'radius')::numeric, 25);
    v_rate := coalesce((s ->> 'rate')::numeric, 1);
    v_scoring := coalesce((s ->> 'scoring')::boolean, true);
    v_reloc := (s ->> 'relocate_minutes')::numeric;
  exception when others then
    raise exception 'game_settings_invalid';
  end;
  if v_radius not between 10 and 100 or v_radius <> trunc(v_radius)
     or v_rate not between 1 and 10 or v_rate <> trunc(v_rate)
     or (v_reloc is not null and (v_reloc not between 1 and 60 or v_reloc <> trunc(v_reloc))) then
    raise exception 'game_settings_invalid';
  end if;
  return jsonb_build_object('radius', v_radius::int, 'scoring', v_scoring, 'rate', v_rate::int,
                            'relocate_minutes', v_reloc::int);
end $$;

-- ---------------------------------------------------------------------------
-- Hill placement
-- ---------------------------------------------------------------------------

-- A random hill centre whose whole circle is inside the field boundary and clear
-- of every No-go and Danger area, or null if none was found. Works in metres on a
-- flat projection around the field, which is plenty accurate at field scale.
-- With an avoid point (relocation), it first tries to land at least two radii away.
create function public._koth_place(p_data jsonb, p_radius double precision,
                                   p_avoid_lat double precision, p_avoid_lng double precision)
returns double precision[] language plpgsql volatile set search_path = '' as $$
declare
  polys jsonb;
  lat0 double precision := (p_data -> 'boundary' -> 0 ->> 'lat')::float8;
  lng0 double precision := (p_data -> 'boundary' -> 0 ->> 'lng')::float8;
  kx double precision;
  ky constant double precision := 110540;
  px double precision[] := '{}';
  py double precision[] := '{}';
  pstart int[] := '{}';
  plen int[] := '{}';
  n int := 0;
  i int; j int; k int; tries int;
  c jsonb;
  minx double precision; maxx double precision; miny double precision; maxy double precision;
  x double precision; y double precision;
  ax double precision; ay double precision; qx double precision; qy double precision;
  dx double precision; dy double precision; len2 double precision; t double precision;
  d double precision; inside boolean; ok boolean;
  avx double precision; avy double precision;
begin
  if lat0 is null or lng0 is null then return null; end if;
  kx := 111320 * cos(radians(lat0));
  -- Polygon 1 is the boundary; the rest are No-go/Danger areas.
  polys := jsonb_build_array(p_data -> 'boundary')
    || coalesce((select jsonb_agg(a -> 'points') from jsonb_array_elements(coalesce(p_data -> 'areas', '[]')) a), '[]');
  for i in 0 .. jsonb_array_length(polys) - 1 loop
    pstart := pstart || (n + 1);
    plen := plen || jsonb_array_length(polys -> i);
    for j in 0 .. jsonb_array_length(polys -> i) - 1 loop
      c := polys -> i -> j;
      n := n + 1;
      px[n] := ((c ->> 'lng')::float8 - lng0) * kx;
      py[n] := ((c ->> 'lat')::float8 - lat0) * ky;
    end loop;
  end loop;

  minx := px[1]; maxx := px[1]; miny := py[1]; maxy := py[1];
  for j in 1 .. plen[1] loop
    minx := least(minx, px[j]); maxx := greatest(maxx, px[j]);
    miny := least(miny, py[j]); maxy := greatest(maxy, py[j]);
  end loop;
  if maxx - minx < 2 * p_radius or maxy - miny < 2 * p_radius then return null; end if;
  if p_avoid_lat is not null and p_avoid_lng is not null then
    avx := (p_avoid_lng - lng0) * kx;
    avy := (p_avoid_lat - lat0) * ky;
  end if;

  for tries in 1 .. 800 loop
    x := minx + p_radius + random() * (maxx - minx - 2 * p_radius);
    y := miny + p_radius + random() * (maxy - miny - 2 * p_radius);
    if avx is not null and tries <= 500 and sqrt((x - avx) ^ 2 + (y - avy) ^ 2) < 2 * p_radius then
      continue;
    end if;
    ok := true;
    for k in 1 .. array_length(pstart, 1) loop
      inside := false;
      d := 'Infinity';
      for j in 0 .. plen[k] - 1 loop
        ax := px[pstart[k] + j];
        ay := py[pstart[k] + j];
        qx := px[pstart[k] + (j + 1) % plen[k]];
        qy := py[pstart[k] + (j + 1) % plen[k]];
        if (ay > y) <> (qy > y) and x < (qx - ax) * (y - ay) / (qy - ay) + ax then
          inside := not inside;
        end if;
        dx := qx - ax; dy := qy - ay;
        len2 := dx * dx + dy * dy;
        t := case when len2 = 0 then 0 else greatest(0, least(1, ((x - ax) * dx + (y - ay) * dy) / len2)) end;
        d := least(d, sqrt((x - ax - t * dx) ^ 2 + (y - ay - t * dy) ^ 2));
      end loop;
      -- Inside the boundary, outside every area, and the circle crosses no edge.
      if (k = 1) <> inside or d < p_radius then
        ok := false;
        exit;
      end if;
    end loop;
    if ok then return array[lat0 + y / ky, lng0 + x / kx]; end if;
  end loop;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Control and scoring
-- ---------------------------------------------------------------------------

-- Seconds of active play at p_now (capped at the length for timed games).
create function public._game_active(g public.games, p_now timestamptz)
returns numeric language sql stable set search_path = '' as $$
  select case
    when g.length_seconds is null then v
    else least(v, g.length_seconds + g.extra_seconds) end
  from (select g.active_seconds
          + case when g.state = 'live' then greatest(0, extract(epoch from p_now - g.live_since)) else 0 end as v) s;
$$;

-- Bring a KOTH game's hill, control and scores up to date. The caller holds the
-- game's row lock (via _advance_game).
create function public._koth_update(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
  k public.koth_state;
  o public.koth_state;
  v_now timestamptz := clock_timestamp();
  v_active numeric;
  v_to numeric;
  v_move boolean;
  v_radius double precision;
  v_rate numeric;
  v_reloc numeric;
  v_data jsonb;
  v_spot double precision[];
  v_top int;
  v_tied int;
  v_best numeric;
  v_dirty boolean := false;
begin
  select * into g from public.games where id = p_game;
  if not found or g.mode <> 'koth' then return; end if;
  select * into k from public.koth_state where game_id = p_game for update;
  if not found or k.result is not null then return; end if;
  o := k;

  v_radius := (g.settings ->> 'radius')::float8;
  v_rate := case when (g.settings ->> 'scoring')::boolean then (g.settings ->> 'rate')::numeric else 0 end;
  v_reloc := (g.settings ->> 'relocate_minutes')::numeric * 60;
  v_active := public._game_active(g, v_now);

  -- Score the holder up to now, moving the hill at each relocation time on the way.
  loop
    v_to := v_active;
    v_move := v_reloc is not null and k.placed_active + v_reloc <= v_active;
    if v_move then v_to := k.placed_active + v_reloc; end if;
    if v_to > k.last_active then
      if k.control = 'held' and k.holder_team_id is not null and v_rate > 0 then
        k.scores := jsonb_set(k.scores, array[k.holder_team_id::text],
          to_jsonb(coalesce((k.scores ->> k.holder_team_id::text)::numeric, 0) + (v_to - k.last_active) * v_rate));
      end if;
      k.last_active := v_to;
    end if;
    exit when not v_move;
    if v_data is null then
      select data into v_data from public.day_fields where game_day_id = g.game_day_id;
    end if;
    v_spot := case when v_data is null then null
                   else public._koth_place(v_data, v_radius, k.hill_lat, k.hill_lng) end;
    -- If nowhere else fits, the hill stays put but still counts as a new hill.
    if v_spot is not null then
      k.hill_lat := v_spot[1];
      k.hill_lng := v_spot[2];
    end if;
    k.hill_number := k.hill_number + 1;
    k.placed_active := k.placed_active + v_reloc;
    k.control := 'empty';
    k.holder_team_id := null;
    k.counts := '{}';
    v_dirty := true;
  end loop;

  if g.state = 'complete' then
    if v_rate = 0 then
      k.result := 'none';
    else
      select max(value::numeric) into v_best from jsonb_each_text(k.scores);
      select count(*) into v_tied from jsonb_each_text(k.scores) where value::numeric = v_best;
      if v_best is null or v_best <= 0 or v_tied > 1 then
        k.result := 'draw';
      else
        k.result := 'win';
        select key::uuid into k.winner_team_id from jsonb_each_text(k.scores) where value::numeric = v_best;
      end if;
    end if;
    v_dirty := true;
  else
    -- Who is on the hill right now.
    select coalesce(jsonb_object_agg(team_id, n), '{}') into k.counts
    from (
      select m.team_id, count(*)::int as n
      from public.positions p
      join public.day_members m on m.game_day_id = p.game_day_id and m.user_id = p.user_id
      where p.game_day_id = g.game_day_id and m.status = 'active' and m.team_id is not null
        and p.recorded_at >= v_now - interval '30 seconds' and p.accuracy <= 30
        and sqrt(power((p.lng - k.hill_lng) * 111320 * cos(radians(k.hill_lat)), 2)
                 + power((p.lat - k.hill_lat) * 110540, 2)) <= v_radius
      group by m.team_id
    ) t;
    select count(*)::int into k.unknown
    from public.day_members m
    where m.game_day_id = g.game_day_id and m.status = 'active' and m.team_id is not null
      and not exists (
        select 1 from public.positions p
        where p.game_day_id = m.game_day_id and p.user_id = m.user_id
          and p.recorded_at >= v_now - interval '30 seconds' and p.accuracy <= 30);
    select max(value::int) into v_top from jsonb_each_text(k.counts);
    select count(*) into v_tied from jsonb_each_text(k.counts) where value::int = v_top;
    if v_top is null then
      k.control := 'empty';
      k.holder_team_id := null;
    elsif v_tied > 1 then
      k.control := 'contested';
      k.holder_team_id := null;
    else
      k.control := 'held';
      select key::uuid into k.holder_team_id from jsonb_each_text(k.counts) where value::int = v_top;
    end if;
  end if;

  -- Score alone changing doesn't need a write: it is recomputed from last_active.
  if v_dirty
     or k.control is distinct from o.control
     or k.holder_team_id is distinct from o.holder_team_id
     or k.counts is distinct from o.counts
     or k.unknown is distinct from o.unknown then
    update public.koth_state
    set hill_lat = k.hill_lat, hill_lng = k.hill_lng, hill_number = k.hill_number,
        placed_active = k.placed_active, last_active = k.last_active,
        control = k.control, holder_team_id = k.holder_team_id, counts = k.counts,
        scores = k.scores, unknown = k.unknown, result = k.result,
        winner_team_id = k.winner_team_id, updated_at = v_now
    where game_id = p_game;
  end if;
end $$;

-- Place the first hill when a KOTH game starts (or restarts after a cancelled countdown).
create function public._koth_start(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
  v_data jsonb;
  v_spot double precision[];
begin
  select * into g from public.games where id = p_game;
  select data into v_data from public.day_fields where game_day_id = g.game_day_id;
  v_spot := case when v_data is null then null
                 else public._koth_place(v_data, (g.settings ->> 'radius')::float8, null, null) end;
  if v_spot is null then raise exception 'koth_no_space'; end if;
  insert into public.koth_state (game_id, game_day_id, hill_lat, hill_lng)
  values (p_game, g.game_day_id, v_spot[1], v_spot[2])
  on conflict (game_id) do update
  set hill_lat = excluded.hill_lat, hill_lng = excluded.hill_lng, hill_number = 1,
      placed_active = 0, last_active = 0, control = 'empty', holder_team_id = null,
      counts = '{}', scores = '{}', unknown = 0, result = null, winner_team_id = null,
      updated_at = now();
end $$;

-- ---------------------------------------------------------------------------
-- Lifecycle changes (0004 functions, updated for modes)
-- ---------------------------------------------------------------------------

-- Same as 0004, plus bringing KOTH up to date.
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
  return g;
end $$;

-- The 4-argument versions are retired (renamed and locked, rather than dropped).
alter function public.create_game(uuid, text, int, int) rename to _retired_create_game_0004;
revoke execute on function public._retired_create_game_0004(uuid, text, int, int) from public, anon, authenticated;
create function public.create_game(
  p_day uuid, p_name text, p_length_seconds int, p_countdown_seconds int,
  p_mode text default 'free', p_settings jsonb default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_game uuid;
  v_settings jsonb := public._game_settings(coalesce(p_mode, 'free'), p_settings);
  v_data jsonb;
begin
  perform public._lock_open_day(p_day);
  perform public._require_admin(p_day, v_user);
  -- Finish off a timed game that has run out before checking for an open one.
  perform public._advance_game(id) from public.games
  where game_day_id = p_day and state <> 'complete';
  if exists (select 1 from public.games where game_day_id = p_day and state <> 'complete') then
    raise exception 'game_in_progress';
  end if;
  -- Catch a hill that can't fit now, rather than at Start.
  if p_mode = 'koth' then
    select data into v_data from public.day_fields where game_day_id = p_day;
    if v_data is not null and public._koth_place(v_data, (v_settings ->> 'radius')::float8, null, null) is null then
      raise exception 'koth_no_space';
    end if;
  end if;
  insert into public.games (game_day_id, name, length_seconds, countdown_seconds, mode, settings, created_by)
  values (p_day, btrim(p_name), p_length_seconds, coalesce(p_countdown_seconds, 0),
          coalesce(p_mode, 'free'), v_settings, v_user)
  returning id into v_game;
  return v_game;
end $$;

alter function public.update_game(uuid, text, int, int) rename to _retired_update_game_0004;
revoke execute on function public._retired_update_game_0004(uuid, text, int, int) from public, anon, authenticated;
create function public.update_game(
  p_game uuid, p_name text, p_length_seconds int, p_countdown_seconds int,
  p_mode text default 'free', p_settings jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.games := public._admin_game(p_game);
  v_settings jsonb := public._game_settings(coalesce(p_mode, 'free'), p_settings);
  v_data jsonb;
begin
  if g.state <> 'ready' then raise exception 'game_not_ready'; end if;
  if p_mode = 'koth' then
    select data into v_data from public.day_fields where game_day_id = g.game_day_id;
    if v_data is not null and public._koth_place(v_data, (v_settings ->> 'radius')::float8, null, null) is null then
      raise exception 'koth_no_space';
    end if;
  end if;
  update public.games
  set name = btrim(p_name), length_seconds = p_length_seconds,
      countdown_seconds = coalesce(p_countdown_seconds, 0),
      mode = coalesce(p_mode, 'free'), settings = v_settings, updated_at = now()
  where id = p_game;
end $$;

-- Same as 0004, plus placing the first hill for KOTH.
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

-- Same as 0004, plus the KOTH result.
create or replace function public.end_game(p_game uuid)
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
  perform public._koth_update(p_game);
end $$;

-- A new ready game with the same mode and settings as a finished one.
create or replace function public.play_again(p_game uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare g public.games := public._admin_game(p_game);
begin
  if g.state <> 'complete' then raise exception 'game_not_complete'; end if;
  return public.create_game(g.game_day_id, g.name, g.length_seconds, g.countdown_seconds, g.mode, g.settings);
end $$;

-- Same as 0004, plus updating a running KOTH game with the new position.
create or replace function public.report_position(
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
  perform public._advance_game(id) from public.games
  where game_day_id = p_day and mode = 'koth' and state <> 'complete';
end $$;

-- Same as 0004, plus settling KOTH results for a game the closure ended.
create or replace function public._close_day_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'closed' and old.status = 'open' then
    delete from public.positions where game_day_id = new.id;
    update public.games
    set state = 'complete', live_since = null, countdown_ends_at = null,
        ended_at = coalesce(ended_at, now()), end_reason = coalesce(end_reason, 'ended'), updated_at = now()
    where game_day_id = new.id and state <> 'complete';
    perform public._koth_update(id) from public.games where game_day_id = new.id and mode = 'koth';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Saved game setups
-- ---------------------------------------------------------------------------

-- p_setup null saves a new setup; otherwise overwrites one of yours.
create function public.save_game_setup(
  p_setup uuid, p_name text, p_mode text, p_length_seconds int, p_countdown_seconds int, p_settings jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_settings jsonb := public._game_settings(coalesce(p_mode, 'free'), p_settings);
  v_id uuid;
begin
  if p_setup is null then
    if (select count(*) from public.game_setups where owner_id = v_user) >= 50 then
      raise exception 'too_many_setups';
    end if;
    insert into public.game_setups (owner_id, name, mode, length_seconds, countdown_seconds, settings)
    values (v_user, btrim(p_name), coalesce(p_mode, 'free'), p_length_seconds, coalesce(p_countdown_seconds, 0), v_settings)
    returning id into v_id;
  else
    update public.game_setups
    set name = btrim(p_name), mode = coalesce(p_mode, 'free'), length_seconds = p_length_seconds,
        countdown_seconds = coalesce(p_countdown_seconds, 0), settings = v_settings, updated_at = now()
    where id = p_setup and owner_id = v_user
    returning id into v_id;
    if v_id is null then raise exception 'setup_not_found'; end if;
  end if;
  return v_id;
end $$;

create function public.delete_game_setup(p_setup uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public._require_user();
begin
  delete from public.game_setups where id = p_setup and owner_id = v_user;
  if not found then raise exception 'setup_not_found'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

revoke execute on function
  public._game_settings(text, jsonb),
  public._koth_place(jsonb, double precision, double precision, double precision),
  public._game_active(public.games, timestamptz),
  public._koth_update(uuid), public._koth_start(uuid),
  public.create_game(uuid, text, int, int, text, jsonb),
  public.update_game(uuid, text, int, int, text, jsonb),
  public.save_game_setup(uuid, text, text, int, int, jsonb),
  public.delete_game_setup(uuid)
from public, anon, authenticated;
grant execute on function
  public.create_game(uuid, text, int, int, text, jsonb),
  public.update_game(uuid, text, int, int, text, jsonb),
  public.save_game_setup(uuid, text, text, int, int, jsonb),
  public.delete_game_setup(uuid)
to authenticated;

alter publication supabase_realtime add table public.koth_state, public.game_setups;
