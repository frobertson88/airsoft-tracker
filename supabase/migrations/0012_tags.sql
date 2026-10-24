-- Tag library, phase 1 (Patrol and tag library plan, agreed with Fraser on
-- 24 October 2026). A tag is a short printed code (a QR now, the same text on
-- an NFC tag later) that stands for one thing. Phase 1 binds tags to field
-- points only; props, abilities and wristbands come later.

-- ---------------------------------------------------------------------------
-- Field points get a permanent id and a short number ("Point 3")
-- ---------------------------------------------------------------------------

-- The server stamps them on save, so the app never has to invent them. A point
-- sent back without an id (an older app) but on the same spot keeps its old id
-- and number. Numbers stay unique in the field; new points take the lowest free.
create function public._stamp_points(p_new jsonb, p_old jsonb)
returns jsonb language plpgsql volatile set search_path = '' as $$
declare
  arr jsonb[] := '{}';
  pt jsonb; o jsonb;
  v_id text; v_num int;
  ids text[] := '{}'; nums int[] := '{}';
  i int;
begin
  for pt in select value from jsonb_array_elements(coalesce(p_new -> 'points', '[]')) loop
    v_id := case when jsonb_typeof(pt -> 'id') = 'string' and char_length(pt ->> 'id') between 1 and 40
                 then pt ->> 'id' end;
    if v_id = any(ids) then v_id := null; end if;
    v_num := case when (pt ->> 'num') ~ '^[0-9]{1,3}$' then (pt ->> 'num')::int end;
    if v_id is null then
      select value into o from jsonb_array_elements(coalesce(p_old -> 'points', '[]'))
      where jsonb_typeof(value -> 'id') = 'string' and not ((value ->> 'id') = any(ids))
        and (value ->> 'lat')::float8 = (pt ->> 'lat')::float8
        and (value ->> 'lng')::float8 = (pt ->> 'lng')::float8
      limit 1;
      if found then
        v_id := o ->> 'id';
        if v_num is null and (o ->> 'num') ~ '^[0-9]{1,3}$' then v_num := (o ->> 'num')::int; end if;
      else
        v_id := gen_random_uuid()::text;
      end if;
    end if;
    if v_num < 1 or v_num = any(nums) then v_num := null; end if;
    ids := ids || v_id;
    if v_num is not null then nums := nums || v_num; end if;
    arr := arr || (pt || jsonb_build_object('id', v_id, 'num', v_num));
  end loop;
  for i in 1 .. coalesce(array_length(arr, 1), 0) loop
    if arr[i] -> 'num' = 'null'::jsonb then
      v_num := (select min(g) from generate_series(1, 999) g where not (g = any(nums)));
      nums := nums || v_num;
      arr[i] := arr[i] || jsonb_build_object('num', v_num);
    end if;
  end loop;
  return jsonb_set(p_new, '{points}', to_jsonb(arr));
end $$;

create or replace function public.save_field(
  p_field uuid, p_name text, p_location text, p_notes text, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  f public.fields;
  v_id uuid;
begin
  perform public._check_field_data(p_data);
  if p_field is null then
    insert into public.fields (owner_id, name, location, notes, data)
    values (v_user, btrim(p_name), nullif(btrim(p_location), ''), nullif(btrim(p_notes), ''),
            public._stamp_points(p_data, null))
    returning id into v_id;
  else
    f := public._own_field(p_field, v_user);
    update public.fields
    set name = btrim(p_name), location = nullif(btrim(p_location), ''),
        notes = nullif(btrim(p_notes), ''), data = public._stamp_points(p_data, f.data),
        revision = revision + 1, updated_at = now()
    where id = p_field;
    v_id := p_field;
  end if;
  return v_id;
end $$;

-- Fields saved before this get their ids the first time the owner opens the
-- field's QR codes (or saves it), along with any Game Day copies of it, so a
-- copy's points carry the same ids as the field's.
create function public._stamp_field(p_field uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.fields set data = public._stamp_points(data, null)
  where id = p_field and exists (
    select 1 from jsonb_array_elements(coalesce(data -> 'points', '[]')) e where not (e.value ? 'id'));
  update public.day_fields d set data = public._stamp_points(d.data, f.data)
  from public.fields f
  where f.id = p_field and d.field_id = p_field and exists (
    select 1 from jsonb_array_elements(coalesce(d.data -> 'points', '[]')) e where not (e.value ? 'id'));
end $$;

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------

-- Codes are AT- and five Crockford base-32 characters (no I, L, O or U), so a
-- printed code is easy to read out and means nothing to someone who finds it.
create table public.tags (
  code text primary key check (code ~ '^AT-[0-9A-HJKMNP-TV-Z]{5}$'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  field_id uuid references public.fields (id) on delete cascade,
  point_id text,
  created_at timestamptz not null default now(),
  check ((field_id is null) = (point_id is null))
);
create index tags_point_idx on public.tags (field_id, point_id);

alter table public.tags enable row level security;
create policy tags_read on public.tags for select using (owner_id = auth.uid());

create function public._new_tag_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  a text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  c text;
begin
  loop
    c := 'AT-' || (select string_agg(substr(a, 1 + floor(random() * 32)::int, 1), '')
                   from generate_series(1, 5));
    exit when not exists (select 1 from public.tags where code = c);
  end loop;
  return c;
end $$;

create function public._tag_code(p_code text)
returns text language plpgsql immutable set search_path = '' as $$
declare c text := upper(btrim(coalesce(p_code, '')));
begin
  if c !~ '^AT-[0-9A-HJKMNP-TV-Z]{5}$' then raise exception 'tag_invalid'; end if;
  return c;
end $$;

-- The field owner's tags for the field's points, making one for any point without.
create function public.point_tags(p_field uuid)
returns table (point_id text, code text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_user uuid := public._require_user();
  f public.fields;
  pid text;
begin
  perform public._own_field(p_field, v_user);
  perform public._stamp_field(p_field);
  select * into f from public.fields where id = p_field;
  for pid in select value ->> 'id' from jsonb_array_elements(coalesce(f.data -> 'points', '[]')) loop
    if not exists (select 1 from public.tags t where t.field_id = p_field and t.point_id = pid) then
      insert into public.tags (code, owner_id, field_id, point_id)
      values (public._new_tag_code(), v_user, p_field, pid);
    end if;
  end loop;
  return query select t.point_id, t.code from public.tags t
    where t.field_id = p_field and t.point_id in (
      select value ->> 'id' from jsonb_array_elements(coalesce(f.data -> 'points', '[]')))
    order by t.created_at, t.code;
end $$;

-- Puts a tag (new or one of yours) on one of your field's points, e.g. a
-- spare sticker when the first one is lost. The point keeps its other tags.
create function public.bind_tag(p_code text, p_field uuid, p_point text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_code text := public._tag_code(p_code);
  f public.fields;
  t public.tags;
begin
  f := public._own_field(p_field, v_user);
  if not exists (select 1 from jsonb_array_elements(coalesce(f.data -> 'points', '[]')) p
                 where p.value ->> 'id' = p_point) then
    raise exception 'point_not_found';
  end if;
  select * into t from public.tags where code = v_code for update;
  if found and t.owner_id <> v_user then raise exception 'tag_taken'; end if;
  insert into public.tags (code, owner_id, field_id, point_id)
  values (v_code, v_user, p_field, p_point)
  on conflict (code) do update set field_id = excluded.field_id, point_id = excluded.point_id;
end $$;

-- What a scanned code stands for. Day members read the day's copy of the
-- field; the owner reads their saved field. Anyone else learns nothing.
create function public.lookup_tag(p_code text, p_day uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_code text := public._tag_code(p_code);
  t public.tags;
  v_name text;
  v_data jsonb;
  pt jsonb;
  v_mine boolean;
begin
  select * into t from public.tags where code = v_code;
  v_mine := found and t.owner_id = v_user;
  if t.field_id is not null then
    if p_day is not null and public.is_day_member(p_day) then
      select name, data into v_name, v_data from public.day_fields
      where game_day_id = p_day and field_id = t.field_id;
    end if;
    if v_name is null and v_mine then
      select name, data into v_name, v_data from public.fields where id = t.field_id;
    end if;
  end if;
  if v_name is null then
    return jsonb_build_object('code', v_code, 'known', false, 'mine', v_mine);
  end if;
  select value into pt from jsonb_array_elements(coalesce(v_data -> 'points', '[]'))
  where value ->> 'id' = t.point_id;
  return jsonb_build_object('code', v_code, 'known', true, 'mine', v_mine,
    'field', v_name, 'point', pt);
end $$;

revoke execute on function
  public._stamp_points(jsonb, jsonb), public._stamp_field(uuid), public._new_tag_code(), public._tag_code(text),
  public.point_tags(uuid), public.bind_tag(text, uuid, text), public.lookup_tag(text, uuid)
from public, anon, authenticated;
grant execute on function
  public.point_tags(uuid), public.bind_tag(text, uuid, text), public.lookup_tag(text, uuid)
to authenticated;
