-- Admins pick each team's colour (and rename it, which 0001 already allows).
--
-- Seven colours: blue, red, yellow, purple, teal, pink, white. Orange is kept
-- for danger and green for the app's accent, so neither is a team colour. Teams
-- in one Game Day always have different colours: choosing a colour another team
-- has swaps the two. A team still named after its colour ("Blue") is renamed to
-- match its new colour; a name an admin chose is kept.

alter table public.teams drop constraint teams_colour_check;
alter table public.teams add constraint teams_colour_check
  check (colour in ('blue', 'red', 'yellow', 'purple', 'teal', 'pink', 'white'));

create function public.set_team_colour(p_team uuid, p_colour text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  t public.teams;
begin
  select * into t from public.teams where id = p_team;
  if not found then raise exception 'team_not_found'; end if;
  perform public._lock_open_day(t.game_day_id);
  perform public._require_admin(t.game_day_id, v_user);
  if p_colour is null or p_colour not in ('blue', 'red', 'yellow', 'purple', 'teal', 'pink', 'white') then
    raise exception 'team_colour_invalid';
  end if;
  update public.teams
  set colour = t.colour, name = case when name = initcap(colour) then initcap(t.colour) else name end
  where game_day_id = t.game_day_id and colour = p_colour and id <> p_team;
  update public.teams
  set colour = p_colour, name = case when name = initcap(colour) then initcap(p_colour) else name end
  where id = p_team;
end $$;

-- Same as 0006, except a new team takes a colour no other team in the day has
-- (an admin may already have given Yellow's colour to Blue).
create or replace function public.arrange_teams(p_day uuid, p_count int, p_fill text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_teams uuid[];
  v_players uuid[];
  v_colour text;
  i int;
begin
  perform public._lock_open_day(p_day);
  perform public._require_admin(p_day, v_user);
  if p_count is null or p_count not between 2 and 4 then raise exception 'team_count_invalid'; end if;
  if p_fill is null or p_fill not in ('keep', 'shuffle', 'clear') then raise exception 'team_fill_invalid'; end if;
  if public._game_running(p_day) then raise exception 'game_running'; end if;

  for i in 1 .. p_count loop
    if not exists (select 1 from public.teams where game_day_id = p_day and sort_order = i) then
      select c into v_colour
      from unnest(array['blue', 'red', 'yellow', 'purple', 'teal', 'pink', 'white']) with ordinality as u (c, n)
      where c not in (select colour from public.teams where game_day_id = p_day)
      order by (c = (array['blue', 'red', 'yellow', 'purple'])[i]) desc, n
      limit 1;
      insert into public.teams (game_day_id, name, colour, sort_order)
      values (p_day, initcap(v_colour), v_colour, i);
    end if;
  end loop;
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

revoke execute on function public.set_team_colour(uuid, text) from public, anon;
grant execute on function public.set_team_colour(uuid, text) to authenticated;
