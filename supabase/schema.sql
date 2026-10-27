-- Run once in the Supabase SQL Editor. No browser may write tables directly.
create table if not exists public.oops_admins (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.oops_admins enable row level security;
revoke all on public.oops_admins from anon, authenticated;
create table if not exists public.oops_workspace (
 id smallint primary key check(id=1),
 state jsonb not null,
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
alter table public.oops_workspace enable row level security;
revoke all on public.oops_workspace from anon, authenticated;
grant select on public.oops_workspace to anon, authenticated;
drop policy if exists "Public case read" on public.oops_workspace;
create policy "Public case read" on public.oops_workspace for select to anon,authenticated using (true);
create or replace function public.oops_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.oops_admins where user_id=(select auth.uid()));
$$;
revoke all on function public.oops_is_admin() from public;
grant execute on function public.oops_is_admin() to anon,authenticated;
create or replace function public.oops_save_state(expected_revision integer, new_state jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare old public.oops_workspace%rowtype; item record; typ jsonb; value jsonb; ids_old text[]; ids_new text[];
begin
 if not public.oops_is_admin() then raise exception 'OOPS_FORBIDDEN' using errcode='42501'; end if;
 select * into old from public.oops_workspace where id=1 for update;
 if not found or old.revision<>expected_revision then raise exception 'OOPS_CONFLICT'; end if;
 if pg_column_size(new_state)>3000000 or new_state->>'datasetId' is distinct from old.state->>'datasetId'
 or new_state->>'schema' is distinct from '3'
 or jsonb_typeof(new_state->'cases') is distinct from 'object'
 or jsonb_typeof(new_state->'purged') is distinct from 'object'
 or jsonb_typeof(new_state->'statusTypes') is distinct from 'array'
 then raise exception 'OOPS_INVALID_STATE'; end if;
 if jsonb_array_length(new_state->'statusTypes')<1 or jsonb_array_length(new_state->'statusTypes')>200 then raise exception 'OOPS_INVALID_TYPES'; end if;
 for typ in select * from jsonb_array_elements(new_state->'statusTypes') loop
  if jsonb_typeof(typ)<>'string' or length(btrim(typ#>>'{}')) not between 1 and 80 or typ#>>'{}'='__custom__' then raise exception 'OOPS_INVALID_TYPE'; end if;
 end loop;
 if (select count(*) from jsonb_array_elements_text(new_state->'statusTypes'))<>(select count(distinct lower(btrim(t))) from jsonb_array_elements_text(new_state->'statusTypes') t) then raise exception 'OOPS_DUPLICATE_TYPE'; end if;
 select array_agg(k order by k) into ids_old from (select jsonb_object_keys(old.state->'cases') k union select jsonb_object_keys(old.state->'purged') k) q;
 select array_agg(k order by k) into ids_new from (select jsonb_object_keys(new_state->'cases') k union select jsonb_object_keys(new_state->'purged') k) q;
 if ids_old is distinct from ids_new then raise exception 'OOPS_INVALID_IDS'; end if;
 for item in select * from jsonb_each(old.state->'purged') loop
  if new_state->'purged'->item.key is distinct from item.value then raise exception 'OOPS_PURGED_IMMUTABLE'; end if;
 end loop;
 for item in select * from jsonb_each(new_state->'purged') loop
  if new_state->'cases' ? item.key or jsonb_typeof(item.value)<>'string' then raise exception 'OOPS_INVALID_PURGE'; end if;
  perform (item.value#>>'{}')::timestamptz;
  if not (old.state->'purged' ? item.key) and (old.state->'cases'->item.key->'deletedAt')='null'::jsonb then raise exception 'OOPS_TRASH_FIRST'; end if;
 end loop;
 for item in select * from jsonb_each(new_state->'cases') loop
  value=item.value;
  if jsonb_typeof(value->'elements') is distinct from 'array' then raise exception 'OOPS_INVALID_ELEMENTS'; end if;
  if jsonb_array_length(value->'elements')<>7 or exists(select 1 from jsonb_array_elements(value->'elements') e where jsonb_typeof(e)<>'string') then raise exception 'OOPS_INVALID_ELEMENTS'; end if;
  if jsonb_typeof(value->'status') is distinct from 'string' or not (new_state->'statusTypes' @> jsonb_build_array(value->'status')) then raise exception 'OOPS_INVALID_STATUS'; end if;
  if not (value ? 'deletedAt') or jsonb_typeof(value->'deletedAt') not in ('null','string') then raise exception 'OOPS_INVALID_DELETED'; end if;
  if value->'deletedAt'<>'null'::jsonb then perform (value->>'deletedAt')::timestamptz; end if;
  if jsonb_typeof(value->'history') is distinct from 'array' then raise exception 'OOPS_INVALID_HISTORY'; end if;
 end loop;
 update public.oops_workspace set state=new_state,revision=old.revision+1,updated_at=now(),updated_by=auth.uid() where id=1;
 return old.revision+1;
end;
$$;
revoke all on function public.oops_save_state(integer,jsonb) from public,anon;
grant execute on function public.oops_save_state(integer,jsonb) to authenticated;
