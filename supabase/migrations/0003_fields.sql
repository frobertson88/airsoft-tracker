-- Stage 2: Field Library (docs/field-library.md) and the Game Day's field copy.
-- A saved field belongs to its creator. Picking a field for a Game Day copies
-- it (a snapshot), so later edits to the saved field don't change the day.
--
-- Field layout (p_data / data), all coordinates as {"lat": n, "lng": n}:
--   {
--     "view":     {"lat", "lng", "latDelta", "lngDelta"},   -- starting view
--     "boundary": [coord, ...],                              -- playable area
--     "areas":    [{"kind": "nogo"|"danger", "name", "note", "points": [coord, ...]}],
--     "points":   [{"kind": "staging"|"respawn"|"base"|"marshal"|"other", "label", "lat", "lng"}]
--   }

create table public.fields (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  location text check (char_length(location) <= 120),
  notes text check (char_length(notes) <= 500),
  data jsonb not null,
  revision int not null default 1,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index fields_owner_idx on public.fields (owner_id);

create table public.day_fields (
  game_day_id uuid primary key references public.game_days (id) on delete cascade,
  field_id uuid references public.fields (id) on delete set null,
  field_revision int not null,
  name text not null,
  location text,
  notes text,
  data jsonb not null,
  selected_by uuid not null references auth.users (id),
  selected_at timestamptz not null default now()
);

alter table public.fields enable row level security;
alter table public.day_fields enable row level security;
create policy fields_read on public.fields for select to authenticated
  using (owner_id = auth.uid());
create policy day_fields_read on public.day_fields for select to authenticated
  using (public.is_day_member(game_day_id));
revoke insert, update, delete, truncate on public.fields, public.day_fields from anon, authenticated;
revoke all on public.fields, public.day_fields from anon;

-- ---------------------------------------------------------------------------
-- Validation helpers
-- ---------------------------------------------------------------------------

create function public._coord_ok(c jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    jsonb_typeof(c) = 'object'
    and jsonb_typeof(c -> 'lat') = 'number' and jsonb_typeof(c -> 'lng') = 'number'
    and (c ->> 'lat')::float8 between -90 and 90
    and (c ->> 'lng')::float8 between -180 and 180, false);
$$;

-- Do segments p1-p2 and p3-p4 properly cross (sharing an end doesn't count)?
create function public._segments_cross(
  ax float8, ay float8, bx float8, by float8,
  cx float8, cy float8, dx float8, dy float8)
returns boolean language plpgsql immutable set search_path = '' as $$
declare d1 float8; d2 float8; d3 float8; d4 float8;
begin
  d1 := (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  d2 := (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  d3 := (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  d4 := (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0))
     and ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0));
end $$;

-- A closed polygon: 3 to 200 valid corners, no edge crossing another edge.
create function public._polygon_ok(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  n int;
  x float8[]; y float8[];
  i int; j int;
begin
  if jsonb_typeof(p) is distinct from 'array' then return false; end if;
  n := jsonb_array_length(p);
  if n < 3 or n > 200 then return false; end if;
  for i in 0 .. n - 1 loop
    if not public._coord_ok(p -> i) then return false; end if;
    x[i + 1] := (p -> i ->> 'lng')::float8;
    y[i + 1] := (p -> i ->> 'lat')::float8;
  end loop;
  for i in 1 .. n loop
    for j in i + 1 .. n loop
      -- skip neighbouring edges (they share a corner)
      if j = i + 1 or (i = 1 and j = n) then continue; end if;
      if public._segments_cross(
        x[i], y[i], x[i % n + 1], y[i % n + 1],
        x[j], y[j], x[j % n + 1], y[j % n + 1]) then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end $$;

-- Raises a short key if the layout isn't a complete, valid field.
create function public._check_field_data(d jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare a jsonb; pt jsonb;
begin
  if jsonb_typeof(d) is distinct from 'object' then raise exception 'field_invalid'; end if;
  if not coalesce(public._coord_ok(d -> 'view')
          and jsonb_typeof(d -> 'view' -> 'latDelta') = 'number'
          and jsonb_typeof(d -> 'view' -> 'lngDelta') = 'number', false) then
    raise exception 'field_view_invalid';
  end if;
  if not public._polygon_ok(d -> 'boundary') then raise exception 'field_boundary_invalid'; end if;
  if jsonb_typeof(coalesce(d -> 'areas', '[]')) <> 'array'
     or jsonb_typeof(coalesce(d -> 'points', '[]')) <> 'array' then
    raise exception 'field_invalid';
  end if;
  if jsonb_array_length(coalesce(d -> 'areas', '[]')) > 50
     or jsonb_array_length(coalesce(d -> 'points', '[]')) > 100 then
    raise exception 'field_too_big';
  end if;
  for a in select * from jsonb_array_elements(coalesce(d -> 'areas', '[]')) loop
    if coalesce(a ->> 'kind', '') not in ('nogo', 'danger')
       or char_length(btrim(coalesce(a ->> 'name', ''))) not between 1 and 40
       or char_length(coalesce(a ->> 'note', '')) > 200
       or not public._polygon_ok(a -> 'points') then
      raise exception 'field_area_invalid';
    end if;
  end loop;
  for pt in select * from jsonb_array_elements(coalesce(d -> 'points', '[]')) loop
    if coalesce(pt ->> 'kind', '') not in ('staging', 'respawn', 'base', 'marshal', 'other')
       or char_length(btrim(coalesce(pt ->> 'label', ''))) not between 1 and 40
       or not public._coord_ok(pt) then
      raise exception 'field_point_invalid';
    end if;
  end loop;
end $$;

create function public._own_field(p_field uuid, p_user uuid)
returns public.fields language plpgsql security definer set search_path = '' as $$
declare f public.fields;
begin
  select * into f from public.fields where id = p_field for update;
  if not found then raise exception 'field_not_found'; end if;
  if f.owner_id <> p_user then raise exception 'not_field_owner'; end if;
  return f;
end $$;

-- ---------------------------------------------------------------------------
-- Field Library commands
-- ---------------------------------------------------------------------------

-- p_field null creates a new field; otherwise saves a new revision of yours.
create function public.save_field(
  p_field uuid, p_name text, p_location text, p_notes text, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  v_id uuid;
begin
  perform public._check_field_data(p_data);
  if p_field is null then
    insert into public.fields (owner_id, name, location, notes, data)
    values (v_user, btrim(p_name), nullif(btrim(p_location), ''), nullif(btrim(p_notes), ''), p_data)
    returning id into v_id;
  else
    perform public._own_field(p_field, v_user);
    update public.fields
    set name = btrim(p_name), location = nullif(btrim(p_location), ''),
        notes = nullif(btrim(p_notes), ''), data = p_data,
        revision = revision + 1, updated_at = now()
    where id = p_field;
    v_id := p_field;
  end if;
  return v_id;
end $$;

create function public.duplicate_field(p_field uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  f public.fields;
  v_id uuid;
begin
  f := public._own_field(p_field, v_user);
  insert into public.fields (owner_id, name, location, notes, data)
  values (v_user, left(f.name, 53) || ' (copy)', f.location, f.notes, f.data)
  returning id into v_id;
  return v_id;
end $$;

create function public.archive_field(p_field uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public._require_user();
begin
  perform public._own_field(p_field, v_user);
  update public.fields set archived = p_archived, updated_at = now() where id = p_field;
end $$;

-- ---------------------------------------------------------------------------
-- Game Day field
-- ---------------------------------------------------------------------------

-- A day admin picks one of their own saved fields; it is copied into the day.
-- Picking again replaces the day's copy (no games exist yet in Stage 2).
create function public.select_day_field(p_day uuid, p_field uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  f public.fields;
begin
  perform public._lock_open_day(p_day);
  perform public._require_admin(p_day, v_user);
  f := public._own_field(p_field, v_user);
  if f.archived then raise exception 'field_archived'; end if;
  insert into public.day_fields
    (game_day_id, field_id, field_revision, name, location, notes, data, selected_by)
  values (p_day, f.id, f.revision, f.name, f.location, f.notes, f.data, v_user)
  on conflict (game_day_id) do update
  set field_id = excluded.field_id, field_revision = excluded.field_revision,
      name = excluded.name, location = excluded.location, notes = excluded.notes,
      data = excluded.data, selected_by = excluded.selected_by, selected_at = now();
end $$;

revoke execute on function
  public._coord_ok(jsonb), public._segments_cross(float8, float8, float8, float8, float8, float8, float8, float8),
  public._polygon_ok(jsonb), public._check_field_data(jsonb), public._own_field(uuid, uuid),
  public.save_field(uuid, text, text, text, jsonb), public.duplicate_field(uuid),
  public.archive_field(uuid, boolean), public.select_day_field(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.save_field(uuid, text, text, text, jsonb), public.duplicate_field(uuid),
  public.archive_field(uuid, boolean), public.select_day_field(uuid, uuid)
to authenticated;

alter publication supabase_realtime add table public.fields, public.day_fields;
