-- Random wounds for medic rules (Fraser, 24 October 2026; docs/medic-gameplay.md
-- Advanced/custom mode). A set may add a wound list: each hit before the "dead
-- on" hit picks one at random by its chance, and a fatal wound (a head shot)
-- is dead at once. The pick is stored on the life and never re-rolled.
-- Only adds: sets and games without a wound list work as before, and hits[]
-- stays three long so the published app can still read every set.

-- The wound picked for this hit (null for an in-order set or the dead-on hit).
alter table public.medic_lives add column wound jsonb;
-- Its name, once a scan has revealed it (for the status label).
alter table public.medic_status add column shown_wound text;

-- Checks one wound and returns it cleaned up. Random wounds also have a chance
-- (1–100, weighed against the others) and fatal; a fatal wound needs no
-- helpers, since bringing them back follows the Dead hit.
create function public._medic_wound(h jsonb, p_random boolean)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_name text := btrim(coalesce(h ->> 'name', ''));
  v_instr text := btrim(coalesce(h ->> 'instruction', ''));
  v_fatal boolean := p_random and coalesce(h ->> 'fatal', 'false') = 'true';
  v_chance text := h ->> 'chance';
  v_helpers jsonb;
begin
  if jsonb_typeof(h) <> 'object' or jsonb_typeof(h -> 'helpers') <> 'array' then
    raise exception 'medic_rules_invalid';
  end if;
  select coalesce(jsonb_agg(distinct x), '[]') into v_helpers
  from jsonb_array_elements_text(h -> 'helpers') x;
  if char_length(v_name) not between 1 and 30 or char_length(v_instr) > 200
     or (jsonb_array_length(v_helpers) = 0 and not v_fatal)
     or exists (select 1 from jsonb_array_elements_text(v_helpers) x
                where x not in ('medic', 'teammate', 'lead', 'admin')) then
    raise exception 'medic_rules_invalid';
  end if;
  if not p_random then
    return jsonb_build_object('name', v_name, 'instruction', v_instr, 'helpers', v_helpers);
  end if;
  if coalesce(v_chance, '') !~ '^[0-9]{1,3}$' or v_chance::int not between 1 and 100 then
    raise exception 'medic_rules_invalid';
  end if;
  return jsonb_build_object('name', v_name, 'instruction', v_instr, 'helpers', v_helpers,
                            'chance', v_chance::int, 'fatal', v_fatal);
end $$;

-- part 2 ---------------------------------------------------------------------

-- {hits: [3 wounds, the last is death], expiry: dead|wait} as before, plus for
-- a random set {wounds: [1–12 random wounds], dead_on: 2–5}.
create or replace function public._medic_rules(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_hits jsonb;
  v_wounds jsonb;
  v_dead text := p ->> 'dead_on';
begin
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'hits') <> 'array'
     or jsonb_array_length(p -> 'hits') <> 3 or coalesce(p ->> 'expiry', '') not in ('dead', 'wait') then
    raise exception 'medic_rules_invalid';
  end if;
  select jsonb_agg(public._medic_wound(value, false) order by ordinality) into v_hits
  from jsonb_array_elements(p -> 'hits') with ordinality;
  if coalesce(jsonb_typeof(p -> 'wounds'), 'null') = 'null' then
    return jsonb_build_object('hits', v_hits, 'expiry', p ->> 'expiry');
  end if;
  if jsonb_typeof(p -> 'wounds') <> 'array' or jsonb_array_length(p -> 'wounds') not between 1 and 12
     or coalesce(v_dead, '') not in ('2', '3', '4', '5') then
    raise exception 'medic_rules_invalid';
  end if;
  select jsonb_agg(public._medic_wound(value, true) order by ordinality) into v_wounds
  from jsonb_array_elements(p -> 'wounds') with ordinality;
  return jsonb_build_object('hits', v_hits, 'expiry', p ->> 'expiry',
                            'wounds', v_wounds, 'dead_on', v_dead::int);
end $$;

insert into public.medic_rulesets (owner_id, name, sort_order, rules) values
  (null, 'Random wounds', 4, '{"expiry": "dead", "dead_on": 3, "hits": [
    {"name": "Leg wound", "instruction": "Bandage the leg. Walk only until treated.", "helpers": ["medic", "teammate"]},
    {"name": "Arm wound", "instruction": "Bandage the arm. Shoot with your other hand.", "helpers": ["medic"]},
    {"name": "Dead", "instruction": "Go back to respawn with your hand up.", "helpers": ["admin"]}], "wounds": [
    {"name": "Leg wound", "instruction": "Bandage the leg. Walk only until treated.", "helpers": ["medic", "teammate"], "chance": 40, "fatal": false},
    {"name": "Arm wound", "instruction": "Bandage the arm. Shoot with your other hand.", "helpers": ["medic"], "chance": 30, "fatal": false},
    {"name": "Chest wound", "instruction": "Stay down. A medic seals the wound before you move.", "helpers": ["medic"], "chance": 20, "fatal": false},
    {"name": "Head shot", "instruction": "Go back to respawn with your hand up.", "helpers": [], "chance": 10, "fatal": true}]}');

-- part 3 ---------------------------------------------------------------------

-- One random wound from a game's medic settings, weighed by chance. A fatal
-- wound takes the Dead hit's helpers (who can bring them back).
create function public._medic_pick(m jsonb)
returns jsonb language sql volatile set search_path = '' as $$
  with w as (
    select value, sum((value ->> 'chance')::int) over (order by ordinality) as upto
    from jsonb_array_elements(m -> 'wounds') with ordinality
  ), r as (select floor(random() * max(upto)) as roll from w)
  select case when (value ->> 'fatal')::boolean
              then value || jsonb_build_object('helpers', m -> 'hits' -> -1 -> 'helpers')
              else value end
  from w, r where upto > roll order by upto limit 1;
$$;

-- The wound a helper treats: the picked one while wounded (or if it was
-- fatal), else the Dead hit when dead, else the in-order hit.
create function public._medic_current(m jsonb, l public.medic_lives)
returns jsonb language sql immutable set search_path = '' as $$
  select case
    when l.wound is not null and (l.state = 'wounded' or (l.wound ->> 'fatal')::boolean) then l.wound
    when l.state = 'dead' then m -> 'hits' -> -1
    else m -> 'hits' -> (l.hits - 1) end;
$$;

-- What a player's status looks like to them, plus the wound once revealed.
create or replace function public._medic_my(p_game uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('status', s.status, 'shown_hit', s.shown_hit, 'life', s.life,
                               'bleed_until', s.bleed_until, 'expired', s.expired, 'code', l.code,
                               'wound', case when s.status in ('wounded', 'dead') then l.wound end)
     from public.medic_status s
     left join public.medic_lives l on l.game_id = s.game_id and l.user_id = s.user_id
     where s.game_id = p_game and s.user_id = p_user),
    jsonb_build_object('status', 'in_play', 'shown_hit', null, 'life', 1, 'bleed_until', null,
                       'expired', false, 'code', null, 'wound', null));
$$;

-- part 4 ---------------------------------------------------------------------

-- I'm hit. As 0009, but the dead-on hit comes from the set, and a random set
-- picks the wound now (hidden until a scan).
create or replace function public.report_hit(p_game uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  g public.games := public._medic_game(p_game);
  md jsonb := g.settings -> 'medic';
  m public.day_members;
  l public.medic_lives;
  v_hits int;
  v_wound jsonb;
begin
  if g.state <> 'live' then raise exception 'game_not_live'; end if;
  m := public._require_member(g.game_day_id, v_user);
  if m.team_id is null then raise exception 'team_required'; end if;
  perform public._medic_expire(g);

  insert into public.medic_lives (game_id, user_id) values (p_game, v_user) on conflict do nothing;
  select * into l from public.medic_lives where game_id = p_game and user_id = v_user for update;
  if l.state <> 'in_play' then return public._medic_my(p_game, v_user); end if;

  v_hits := l.hits + 1;
  if md ? 'wounds' and v_hits < (md ->> 'dead_on')::int then v_wound := public._medic_pick(md); end if;
  update public.medic_lives
  set hits = v_hits,
      state = case when v_hits >= coalesce((md ->> 'dead_on')::int, jsonb_array_length(md -> 'hits'))
                     or coalesce((v_wound ->> 'fatal')::boolean, false) then 'dead' else 'wounded' end,
      wound = v_wound,
      bleed_until = public._game_active(g, clock_timestamp()) + (md ->> 'bleed_minutes')::int * 60,
      expired = false,
      code = substr(md5(random()::text || clock_timestamp()::text), 1, 12)
  where game_id = p_game and user_id = v_user
  returning * into l;

  insert into public.medic_status (game_id, game_day_id, user_id, status, life, bleed_until)
  values (p_game, g.game_day_id, v_user, 'awaiting', l.life, l.bleed_until)
  on conflict (game_id, user_id) do update
  set status = 'awaiting', life = excluded.life, bleed_until = excluded.bleed_until,
      expired = false, updated_at = now();

  -- No wound name here: players read their own history, and it stays hidden.
  insert into public.medic_events (game_id, game_day_id, user_id, actor_id, kind, life, hit)
  values (p_game, g.game_day_id, v_user, v_user, 'hit', l.life, l.hits);
  return public._medic_my(p_game, v_user);
end $$;

-- part 5 ---------------------------------------------------------------------

-- Scan a hurt player's code. As 0009, with the picked wound.
create or replace function public.scan_player(p_game uuid, p_user uuid, p_code text)
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
  w := public._medic_current(g.settings -> 'medic', l);
  v_allowed := public._medic_can_help(g.game_day_id, v_user, p_user, w -> 'helpers');
  v_reveal := v_allowed or (l.state = 'dead'
    and public._medic_can_help(g.game_day_id, v_user, p_user, '["teammate"]'));
  if v_reveal then
    update public.medic_status
    set status = l.state, shown_hit = l.hits, shown_wound = w ->> 'name', updated_at = now()
    where game_id = p_game and user_id = p_user;
  end if;
  return jsonb_build_object(
    'user_id', p_user, 'hit', l.hits, 'revealed', v_reveal, 'allowed', v_allowed,
    'state', case when v_reveal then l.state end,
    'wound', case when v_reveal then w end,
    'helpers', w -> 'helpers',
    'bleed_until', l.bleed_until, 'expired', l.expired);
end $$;

-- part 6 ---------------------------------------------------------------------

-- Treatment done (or bring a dead player back). As 0009, with the picked wound.
create or replace function public.treat_player(p_game uuid, p_user uuid, p_code text)
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
  w := public._medic_current(g.settings -> 'medic', l);
  if not public._medic_can_help(g.game_day_id, v_user, p_user, w -> 'helpers') then
    raise exception 'medic_not_allowed';
  end if;
  if l.state = 'wounded' then
    update public.medic_lives set state = 'in_play', wound = null, bleed_until = null, expired = false, code = null
    where game_id = p_game and user_id = p_user;
    update public.medic_status
    set status = 'in_play', shown_hit = l.hits, bleed_until = null, expired = false, updated_at = now()
    where game_id = p_game and user_id = p_user;
    insert into public.medic_events (game_id, game_day_id, user_id, actor_id, kind, life, hit)
    values (p_game, g.game_day_id, p_user, v_user, 'treated', l.life, l.hits);
  else
    update public.medic_lives
    set life = l.life + 1, hits = 0, state = 'in_play', wound = null, bleed_until = null, expired = false, code = null
    where game_id = p_game and user_id = p_user;
    update public.medic_status
    set status = 'in_play', shown_hit = null, shown_wound = null, life = l.life + 1, bleed_until = null,
        expired = false, updated_at = now()
    where game_id = p_game and user_id = p_user;
    insert into public.medic_events (game_id, game_day_id, user_id, actor_id, kind, life, hit)
    values (p_game, g.game_day_id, p_user, v_user, 'respawned', l.life + 1, 0);
  end if;
  return jsonb_build_object('user_id', p_user, 'state', 'in_play', 'treated', l.state);
end $$;

-- part 7 ---------------------------------------------------------------------

-- Admin undo. As 0009, and the picked wound goes too.
create or replace function public.undo_hit(p_game uuid, p_user uuid, p_reason text)
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
  set hits = l.hits - 1, state = 'in_play', wound = null, bleed_until = null, expired = false, code = null
  where game_id = p_game and user_id = p_user;
  update public.medic_status
  set status = 'in_play', shown_hit = nullif(least(coalesce(shown_hit, 0), l.hits - 1), 0),
      shown_wound = null, bleed_until = null, expired = false, updated_at = now()
  where game_id = p_game and user_id = p_user;
  insert into public.medic_events (game_id, game_day_id, user_id, actor_id, kind, life, hit, note)
  values (p_game, g.game_day_id, p_user, auth.uid(), 'undo', l.life, l.hits - 1, btrim(p_reason));
end $$;

revoke execute on function
  public._medic_wound(jsonb, boolean),
  public._medic_pick(jsonb),
  public._medic_current(jsonb, public.medic_lives)
from public, anon, authenticated;
