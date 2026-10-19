-- A picture of each saved field for the lists (plans: Fraser, 19 October 2026).
-- The phone takes a small JPEG of the map each time the field is saved and
-- stores it as a data URL. Duplicates keep the picture.
alter table public.fields add column preview text;

create function public.set_field_preview(p_field uuid, p_preview text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public._require_user();
begin
  perform public._own_field(p_field, v_user);
  if p_preview is not null and (left(p_preview, 23) <> 'data:image/jpeg;base64,'
     or char_length(p_preview) > 400000) then
    raise exception 'field_preview_invalid';
  end if;
  update public.fields set preview = p_preview where id = p_field;
end $$;

create or replace function public.duplicate_field(p_field uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_user();
  f public.fields;
  v_id uuid;
begin
  f := public._own_field(p_field, v_user);
  insert into public.fields (owner_id, name, location, notes, data, preview)
  values (v_user, left(f.name, 53) || ' (copy)', f.location, f.notes, f.data, f.preview)
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.set_field_preview(uuid, text) from public, anon;
grant execute on function public.set_field_preview(uuid, text) to authenticated;
