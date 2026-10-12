-- Hits and medic rules (plans/medic-plan.md, docs/medic-gameplay.md Simple mode).
--
-- Medic rule sets: named, reusable, owned by the organiser who made them. Built-in
-- starters (owner_id null) can be copied but not changed. A game copies the
-- chosen set into settings.medic along with its bleed-out time, so editing a
-- saved set never changes a game that is already set up.
--
-- In play: I'm hit → awaiting medic (wound hidden) → a helper scans the player's
-- code, which reveals the wound if they may treat it → Treatment done. Leg, arm,
-- then dead within one life; treatment keeps progress; bringing a dead player back
-- starts a new life. Hits are ignored while already hurt. Bleed-out runs on game
-- time, so it freezes while paused; at zero the set decides: dead, or wait.
--
-- Secret state (progression, scan code) lives in medic_lives, which no client can
-- read. medic_status is what players see. (Applied to Supabase in parts.)

-- ---------------------------------------------------------------------------
-- Rule sets
-- ---------------------------------------------------------------------------

create table public.medic_rulesets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  rules jsonb not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index medic_rulesets_owner_idx on public.medic_rulesets (owner_id);

alter table public.profiles add column default_medic_ruleset uuid
  references public.medic_rulesets (id) on delete set null;

alter table public.medic_rulesets enable row level security;
create policy medic_rulesets_read on public.medic_rulesets for select to authenticated
  using (owner_id is null or owner_id = auth.uid());
revoke insert, update, delete, truncate on public.medic_rulesets from anon, authenticated;
revoke all on public.medic_rulesets from anon;

-- Checks a rule set and returns it cleaned up:
-- {hits: [{name, instruction, helpers}] × 3 (the last is death), expiry: dead|wait}.
-- Helpers: medic (role Medic, same team), teammate, lead (leads a section in the
-- player's team), admin.
create function public._medic_rules(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_hits jsonb := '[]';
  h jsonb;
  v_name text;
  v_instr text;
  v_helpers jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'hits') <> 'array'
     or jsonb_array_length(p -> 'hits') <> 3 or coalesce(p ->> 'expiry', '') not in ('dead', 'wait') then
    raise exception 'medic_rules_invalid';
  end if;
  for h in select value from jsonb_array_elements(p -> 'hits') loop
    v_name := btrim(coalesce(h ->> 'name', ''));
    v_instr := btrim(coalesce(h ->> 'instruction', ''));
    if jsonb_typeof(h -> 'helpers') <> 'array' then raise exception 'medic_rules_invalid'; end if;
    select coalesce(jsonb_agg(distinct x), '[]') into v_helpers
    from jsonb_array_elements_text(h -> 'helpers') x;
    if char_length(v_name) not between 1 and 30 or char_length(v_instr) > 200
       or jsonb_array_length(v_helpers) = 0
       or exists (select 1 from jsonb_array_elements_text(v_helpers) x
                  where x not in ('medic', 'teammate', 'lead', 'admin')) then
      raise exception 'medic_rules_invalid';
    end if;
    v_hits := v_hits || jsonb_build_array(jsonb_build_object('name', v_name, 'instruction', v_instr, 'helpers', v_helpers));
  end loop;
  return jsonb_build_object('hits', v_hits, 'expiry', p ->> 'expiry');
end $$;

insert into public.medic_rulesets (owner_id, name, sort_order, rules) values
  (null, 'Standard', 1, '{"expiry": "dead", "hits": [
    {"name": "Leg wound", "instruction": "Bandage the leg. Walk only until treated.", "helpers": ["medic", "teammate"]},
    {"name": "Arm wound", "instruction": "Bandage the arm. Shoot with your other hand.", "helpers": ["medic"]},
    {"name": "Dead", "instruction": "Go back to respawn with your hand up.", "helpers": ["admin"]}]}'),
  (null, 'Medic only', 2, '{"expiry": "dead", "hits": [
    {"name": "Leg wound", "instruction": "Stay down and call for a medic.", "helpers": ["medic"]},
    {"name": "Arm wound", "instruction": "Stay down and call for a medic.", "helpers": ["medic"]},
    {"name": "Dead", "instruction": "Go back to respawn with your hand up.", "helpers": ["admin"]}]}'),
  (null, 'Buddy aid', 3, '{"expiry": "wait", "hits": [
    {"name": "Leg wound", "instruction": "Stay down until a teammate treats you.", "helpers": ["teammate"]},
    {"name": "Arm wound", "instruction": "Stay down until a teammate treats you.", "helpers": ["teammate"]},
    {"name": "Dead", "instruction": "Wait for a teammate to bring you back.", "helpers": ["teammate"]}]}');

-- Save one of your sets (p_id null makes a new one). Duplicating and renaming are
-- both saves.
create function public.save_medic_ruleset(p_id uuid, p_name text, p_rules jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_rules jsonb := public._medic_rules(p_rules);
  v_id uuid;
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then raise exception 'medic_name_invalid'; end if;
  if p_id is null then
    if (select count(*) from public.medic_rulesets where owner_id = v_user) >= 50 then
      raise exception 'too_many_rulesets';
    end if;
    insert into public.medic_rulesets (owner_id, name, rules) values (v_user, btrim(p_name), v_rules)
    returning id into v_id;
  else
    update public.medic_rulesets set name = btrim(p_name), rules = v_rules, updated_at = now()
    where id = p_id and owner_id = v_user
    returning id into v_id;
    if v_id is null then raise exception 'ruleset_not_found'; end if;
  end if;
  return v_id;
end $$;

create function public.delete_medic_ruleset(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public._require_user();
begin
  delete from public.medic_rulesets where id = p_id and owner_id = v_user;
  if not found then raise exception 'ruleset_not_found'; end if;
end $$;

-- Your default set (one of yours or a built-in; null = Standard).
create function public.set_default_medic_ruleset(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public._require_user();
begin
  if p_id is not null and not exists (
    select 1 from public.medic_rulesets where id = p_id and (owner_id is null or owner_id = v_user)) then
    raise exception 'ruleset_not_found';
  end if;
  update public.profiles set default_medic_ruleset = p_id, updated_at = now() where id = v_user;
end $$;

-- ---------------------------------------------------------------------------
-- Game settings: settings.medic = {name, hits, expiry, bleed_minutes} or absent (off)
-- ---------------------------------------------------------------------------

create function public._medic_settings(s jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  m jsonb := s -> 'medic';
  v_rules jsonb;
  v_bleed numeric;
begin
  if m is null or jsonb_typeof(m) = 'null' then return null; end if;
  if jsonb_typeof(m) <> 'object' then raise exception 'game_settings_invalid'; end if;
  begin
    v_rules := public._medic_rules(m);
    v_bleed := coalesce((m ->> 'bleed_minutes')::numeric, 10);
  exception when others then
    raise exception 'game_settings_invalid';
  end;
  if v_bleed not between 1 and 30 or v_bleed <> trunc(v_bleed)
     or char_length(btrim(coalesce(m ->> 'name', ''))) not between 1 and 40 then
    raise exception 'game_settings_invalid';
  end if;
  return v_rules || jsonb_build_object('name', btrim(m ->> 'name'), 'bleed_minutes', v_bleed::int);
end $$;

-- Same as 0006, plus settings.medic for every mode.
create or replace function public._game_settings(p_mode text, p_settings jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  s jsonb := coalesce(p_settings, '{}');
  v_teams numeric; v_radius numeric; v_rate numeric; v_reloc numeric; v_scoring boolean;
  v_medic jsonb;
  v_out jsonb;
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
  v_medic := public._medic_settings(s);
  if v_teams not in (2, 3, 4) then raise exception 'game_settings_invalid'; end if;
  if p_mode = 'free' then
    v_out := jsonb_build_object('team_count', v_teams::int);
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
-- Lives, status and history
-- ---------------------------------------------------------------------------

-- Secret: progression and scan code. No client reads this table.
create table public.medic_lives (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  life int not null default 1,
  hits int not null default 0,
  state text not null default 'in_play' check (state in ('in_play', 'wounded', 'dead')),
  -- Game active seconds when bleed-out reaches zero.
  bleed_until numeric,
  expired boolean not null default false,
  code text,
  primary key (game_id, user_id)
);

-- What players see. status: in_play | awaiting (hit, not yet scanned) |
-- wounded / dead (revealed by a scan). shown_hit: the last hit number revealed.
create table public.medic_status (
  game_id uuid not null references public.games (id) on delete cascade,
  game_day_id uuid not null references public.game_days (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('in_play', 'awaiting', 'wounded', 'dead')),
  shown_hit int,
  life int not null default 1,
  bleed_until numeric,
  expired boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);
create index medic_status_day_idx on public.medic_status (game_day_id);

create table public.medic_events (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  game_day_id uuid not null references public.game_days (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('hit', 'treated', 'died', 'respawned', 'undo')),
  life int not null,
  hit int not null,
  note text,
  created_at timestamptz not null default now()
);
create index medic_events_game_idx on public.medic_events (game_id, created_at);

alter table public.medic_lives enable row level security;
alter table public.medic_status enable row level security;
alter table public.medic_events enable row level security;
create policy medic_status_read on public.medic_status for select to authenticated
  using (public.can_see_position(game_day_id, user_id));
create policy medic_events_read on public.medic_events for select to authenticated
  using (user_id = auth.uid() or public.is_day_admin(game_day_id));
revoke insert, update, delete, truncate on public.medic_lives, public.medic_status, public.medic_events
  from anon, authenticated;
revoke all on public.medic_lives, public.medic_status, public.medic_events from anon;
revoke select on public.medic_lives from authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Locks the day, checks the caller is in it and brings the game up to date.
create function public._medic_game(p_game uuid)
returns public.games language plpgsql security definer set search_path = '' as $$
declare
  v_day uuid;
  g public.games;
begin
  select game_day_id into v_day from public.games where id = p_game;
  if not found then raise exception 'game_not_found'; end if;
  perform public._lock_open_day(v_day);
  perform public._require_member(v_day, public._require_user());
  g := public._advance_game(p_game);
  if g.settings -> 'medic' is null then raise exception 'medic_off'; end if;
  return g;
end $$;

-- May this person help that player with these helper rules?
create function public._medic_can_help(p_day uuid, p_actor uuid, p_patient uuid, p_helpers jsonb)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_actor <> p_patient and exists (
    select 1
    from public.day_members a
    join public.day_members p on p.game_day_id = a.game_day_id and p.user_id = p_patient
    where a.game_day_id = p_day and a.user_id = p_actor and a.status = 'active'
      and ((p_helpers ? 'admin' and a.is_admin)
        or (p_helpers ? 'teammate' and a.team_id is not null and a.team_id = p.team_id)
        or (p_helpers ? 'medic' and a.day_role = 'Medic' and a.team_id is not null and a.team_id = p.team_id)
        or (p_helpers ? 'lead' and exists (
              select 1 from public.sections s
              where s.leader_id = p_actor and s.team_id = p.team_id))));
$$;

-- Bleed-outs that have reached zero: mark them, and with expiry = dead the
-- wounded player dies. Reaching zero doesn't reveal a hidden wound.
create function public._medic_expire(g public.games)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_active numeric := public._game_active(g, clock_timestamp());
  v_dead boolean := (g.settings -> 'medic' ->> 'expiry') = 'dead';
  r record;
begin
  for r in
    select user_id, life, hits, state from public.medic_lives
    where game_id = g.id and not expired and state <> 'in_play' and bleed_until <= v_active
    for update
  loop
    update public.medic_lives
    set expired = true, state = case when v_dead then 'dead' else state end
    where game_id = g.id and user_id = r.user_id;
    update public.medic_status
    set expired = true, status = case when v_dead and status = 'wounded' then 'dead' else status end,
        updated_at = now()
    where game_id = g.id and user_id = r.user_id;
    if v_dead and r.state = 'wounded' then
      insert into public.medic_events (game_id, game_day_id, user_id, kind, life, hit, note)
      values (g.id, g.game_day_id, r.user_id, 'died', r.life, r.hits, 'Bled out');
    end if;
  end loop;
end $$;

-- What a player's status looks like to them (used as the command results).
create function public._medic_my(p_game uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('status', s.status, 'shown_hit', s.shown_hit, 'life', s.life,
                               'bleed_until', s.bleed_until, 'expired', s.expired, 'code', l.code)
     from public.medic_status s
     left join public.medic_lives l on l.game_id = s.game_id and l.user_id = s.user_id
     where s.game_id = p_game and s.user_id = p_user),
    jsonb_build_object('status', 'in_play', 'shown_hit', null, 'life', 1, 'bleed_until', null,
                       'expired', false, 'code', null));
$$;

-- ---------------------------------------------------------------------------
-- Commands
-- ---------------------------------------------------------------------------

-- I'm hit. Ignored while already wounded or dead. Returns your status (with the
-- code your helper scans).
create function public.report_hit(p_game uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  g public.games := public._medic_game(p_game);
  m public.day_members;
  l public.medic_lives;
  v_hits int;
begin
  if g.state <> 'live' then raise exception 'game_not_live'; end if;
  m := public._require_member(g.game_day_id, v_user);
  if m.team_id is null then raise exception 'team_required'; end if;
  perform public._medic_expire(g);

  insert into public.medic_lives (game_id, user_id) values (p_game, v_user) on conflict do nothing;
  select * into l from public.medic_lives where game_id = p_game and user_id = v_user for update;
  if l.state <> 'in_play' then return public._medic_my(p_game, v_user); end if;

  v_hits := l.hits + 1;
  update public.medic_lives
  set hits = v_hits,
      state = case when v_hits >= jsonb_array_length(g.settings -> 'medic' -> 'hits') then 'dead' else 'wounded' end,
      bleed_until = public._game_active(g, clock_timestamp()) + (g.settings -> 'medic' ->> 'bleed_minutes')::int * 60,
      expired = false,
      code = substr(md5(random()::text || clock_timestamp()::text), 1, 12)
  where game_id = p_game and user_id = v_user
  returning * into l;

  insert into public.medic_status (game_id, game_day_id, user_id, status, life, bleed_until)
  values (p_game, g.game_day_id, v_user, 'awaiting', l.life, l.bleed_until)
  on conflict (game_id, user_id) do update
  set status = 'awaiting', life = excluded.life, bleed_until = excluded.bleed_until,
      expired = false, updated_at = now();

  insert into public.medic_events (game_id, game_day_id, user_id, actor_id, kind, life, hit)
  values (p_game, g.game_day_id, v_user, v_user, 'hit', l.life, l.hits);
  return public._medic_my(p_game, v_user);
end $$;

-- Your own status and code (after reopening the app).
create function public.my_medic_status(p_game uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  g public.games := public._medic_game(p_game);
begin
  perform public._medic_expire(g);
  return public._medic_my(p_game, v_user);
end $$;

-- Bring bleed-outs up to date (phones call this when a countdown reaches zero).
create function public.medic_tick(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.games := public._medic_game(p_game);
begin
  perform public._medic_expire(g);
end $$;

-- The hurt player a helper is scanning, checked against their code.
create function public._medic_patient(g public.games, p_user uuid, p_code text)
returns public.medic_lives language plpgsql security definer set search_path = '' as $$
declare
  l public.medic_lives;
begin
  if p_user = auth.uid() then raise exception 'medic_self'; end if;
  select * into l from public.medic_lives where game_id = g.id and user_id = p_user for update;
  if not found or l.code is null or l.code <> coalesce(p_code, '') then raise exception 'medic_code_invalid'; end if;
  return l;
end $$;

-- Scan a hurt player's code. If you may treat their wound (or bring them back),
-- it's revealed to you and to them. Anyone on their team may reveal a death.
-- Returns {user_id, hit, revealed, allowed, state, wound, helpers, bleed_until, expired}.
create function public.scan_player(p_game uuid, p_user uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  g public.games := public._medic_game(p_game);
  l public.medic_lives;
  w jsonb;
  v_allowed boolean;
  v_reveal boolean;
begin
  if g.state <> 'live' then raise exception 'game_not_live'; end if;
  perform public._medic_expire(g);
  l := public._medic_patient(g, p_user, p_code);
  if l.state = 'in_play' then
    return jsonb_build_object('user_id', p_user, 'state', 'in_play', 'revealed', true, 'allowed', false);
  end if;
  w := g.settings -> 'medic' -> 'hits' -> (case when l.state = 'dead'
         then jsonb_array_length(g.settings -> 'medic' -> 'hits') else l.hits end - 1);
  v_allowed := public._medic_can_help(g.game_day_id, v_user, p_user, w -> 'helpers');
  v_reveal := v_allowed or (l.state = 'dead'
    and public._medic_can_help(g.game_day_id, v_user, p_user, '["teammate"]'));
  if v_reveal then
    update public.medic_status
    set status = l.state, shown_hit = l.hits, updated_at = now()
    where game_id = p_game and user_id = p_user;
  end if;
  return jsonb_build_object(
    'user_id', p_user, 'hit', l.hits, 'revealed', v_reveal, 'allowed', v_allowed,
    'state', case when v_reveal then l.state end,
    'wound', case when v_reveal then w end,
    'helpers', w -> 'helpers',
    'bleed_until', l.bleed_until, 'expired', l.expired);
end $$;

-- Treatment done (or, for a dead player, bring them back: a new life).
create function public.treat_player(p_game uuid, p_user uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  g public.games := public._medic_game(p_game);
  l public.medic_lives;
  w jsonb;
begin
  if g.state <> 'live' then raise exception 'game_not_live'; end if;
  perform public._medic_expire(g);
  l := public._medic_patient(g, p_user, p_code);
  if l.state = 'in_play' then raise exception 'medic_not_hurt'; end if;
  w := g.settings -> 'medic' -> 'hits' -> (case when l.state = 'dead'
         then jsonb_array_length(g.settings -> 'medic' -> 'hits') else l.hits end - 1);
  if not public._medic_can_help(g.game_day_id, v_user, p_user, w -> 'helpers') then
    raise exception 'medic_not_allowed';
  end if;
  if l.state = 'wounded' then
    update public.medic_lives set state = 'in_play', bleed_until = null, expired = false, code = null
    where game_id = p_game and user_id = p_user;
    update public.medic_status
    set status = 'in_play', shown_hit = l.hits, bleed_until = null, expired = false, updated_at = now()
    where game_id = p_game and user_id = p_user;
    insert into public.medic_events (game_id, game_day_id, user_id, actor_id, kind, life, hit)
    values (p_game, g.game_day_id, p_user, v_user, 'treated', l.life, l.hits);
  else
    update public.medic_lives
    set life = l.life + 1, hits = 0, state = 'in_play', bleed_until = null, expired = false, code = null
    where game_id = p_game and user_id = p_user;
    update public.medic_status
    set status = 'in_play', shown_hit = null, life = l.life + 1, bleed_until = null, expired = false, updated_at = now()
    where game_id = p_game and user_id = p_user;
    insert into public.medic_events (game_id, game_day_id, user_id, actor_id, kind, life, hit)
    values (p_game, g.game_day_id, p_user, v_user, 'respawned', l.life + 1, 0);
  end if;
  return jsonb_build_object('user_id', p_user, 'state', 'in_play', 'treated', l.state);
end $$;

-- An admin undoes an accidental hit (the last one in the player's life), with a
-- reason. The history keeps both the hit and the undo.
create function public.undo_hit(p_game uuid, p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.games := public._admin_game(p_game);
  l public.medic_lives;
begin
  if g.settings -> 'medic' is null then raise exception 'medic_off'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 200 then raise exception 'medic_reason_required'; end if;
  select * into l from public.medic_lives where game_id = p_game and user_id = p_user for update;
  if not found or l.hits = 0 then raise exception 'medic_nothing_to_undo'; end if;
  update public.medic_lives
  set hits = l.hits - 1, state = 'in_play', bleed_until = null, expired = false, code = null
  where game_id = p_game and user_id = p_user;
  update public.medic_status
  set status = 'in_play', shown_hit = nullif(least(coalesce(shown_hit, 0), l.hits - 1), 0),
      bleed_until = null, expired = false, updated_at = now()
  where game_id = p_game and user_id = p_user;
  insert into public.medic_events (game_id, game_day_id, user_id, actor_id, kind, life, hit, note)
  values (p_game, g.game_day_id, p_user, auth.uid(), 'undo', l.life, l.hits - 1, btrim(p_reason));
end $$;

revoke execute on function
  public._medic_rules(jsonb),
  public.save_medic_ruleset(uuid, text, jsonb),
  public.delete_medic_ruleset(uuid),
  public.set_default_medic_ruleset(uuid),
  public._medic_settings(jsonb),
  public._medic_game(uuid),
  public._medic_can_help(uuid, uuid, uuid, jsonb),
  public._medic_expire(public.games),
  public._medic_my(uuid, uuid),
  public.report_hit(uuid),
  public.my_medic_status(uuid),
  public.medic_tick(uuid),
  public._medic_patient(public.games, uuid, text),
  public.scan_player(uuid, uuid, text),
  public.treat_player(uuid, uuid, text),
  public.undo_hit(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function
  public.save_medic_ruleset(uuid, text, jsonb),
  public.delete_medic_ruleset(uuid),
  public.set_default_medic_ruleset(uuid),
  public.report_hit(uuid),
  public.my_medic_status(uuid),
  public.medic_tick(uuid),
  public.scan_player(uuid, uuid, text),
  public.treat_player(uuid, uuid, text),
  public.undo_hit(uuid, uuid, text)
to authenticated;

alter publication supabase_realtime add table public.medic_status, public.medic_rulesets;
