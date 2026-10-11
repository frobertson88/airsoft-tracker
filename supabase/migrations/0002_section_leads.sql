-- Section leads: each section has at most one lead (docs/app-flow.md §3).
-- Whoever creates a section leads it. The lead or a day admin can hand the lead
-- to another member of the section; a section with no lead can be taken by any
-- of its members. Leaving the section (or the day) gives up the lead.

alter table public.sections add column leader_id uuid references auth.users (id);

-- Anyone who picked the old 'Section Leader' role now just has no role set;
-- leading is per section instead.
update public.day_members set day_role = null where day_role = 'Section Leader';

create function public._clear_section_lead()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.section_id is not null
     and (new.section_id is distinct from old.section_id or new.status <> 'active') then
    update public.sections set leader_id = null
    where id = old.section_id and leader_id = old.user_id;
  end if;
  return new;
end $$;

create trigger day_members_clear_section_lead
  after update on public.day_members
  for each row execute function public._clear_section_lead();

-- Create a section in the caller's own team, join it and lead it.
create or replace function public.create_section(p_day uuid, p_name text)
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
    insert into public.sections (game_day_id, team_id, name, created_by, leader_id)
    values (p_day, r.team_id, btrim(p_name), v_user, v_user)
    returning id into v_section;
  exception when unique_violation then
    raise exception 'section_name_taken';
  end;
  update public.day_members set section_id = v_section, updated_at = now()
  where game_day_id = p_day and user_id = v_user;
  return v_section;
end $$;

-- Make p_user the lead of p_section. Allowed for a day admin, the current lead,
-- or a member taking the lead of a section that has none.
create function public.set_section_leader(p_section uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  s public.sections;
  me public.day_members;
  target public.day_members;
begin
  select * into s from public.sections where id = p_section;
  if not found then raise exception 'section_not_found'; end if;
  perform public._lock_open_day(s.game_day_id);
  me := public._require_member(s.game_day_id, v_user);
  if not (me.is_admin
          or s.leader_id is not distinct from v_user
          or (s.leader_id is null and p_user = v_user)) then
    raise exception 'not_section_lead';
  end if;
  target := public._require_member(s.game_day_id, p_user);
  if target.section_id is distinct from p_section then
    raise exception 'not_in_section';
  end if;
  update public.sections set leader_id = p_user where id = p_section;
end $$;

revoke execute on function public.set_section_leader(uuid, uuid), public._clear_section_lead() from public, anon;
grant execute on function public.set_section_leader(uuid, uuid) to authenticated;
