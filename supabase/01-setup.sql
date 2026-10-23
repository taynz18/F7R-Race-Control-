-- Run in the SQL Editor of a fresh Supabase project.
begin;
create table if not exists public.flag_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.flag_state (
  id smallint primary key default 1 check (id = 1),
  flag text not null default 'CLEAR' check (flag in
    ('CLEAR','YELLOW','SAFETY CAR','FCY','RED','GREEN','BLUE','WHITE','BLACK','CHEQUERED')),
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.flag_history (
  revision bigint primary key,
  flag text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
insert into public.flag_state(id) values (1) on conflict do nothing;
alter table public.flag_admins enable row level security;
alter table public.flag_state enable row level security;
alter table public.flag_history enable row level security;
revoke all on public.flag_admins, public.flag_state, public.flag_history from public, anon, authenticated;
grant select on public.flag_state to anon, authenticated;
grant select on public.flag_admins, public.flag_history to authenticated;
drop policy if exists "Drivers read flags" on public.flag_state;
create policy "Drivers read flags" on public.flag_state for select to anon, authenticated using (true);
drop policy if exists "Admins read own membership" on public.flag_admins;
create policy "Admins read own membership" on public.flag_admins for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Admins read history" on public.flag_history;
create policy "Admins read history" on public.flag_history for select to authenticated
  using (exists (select 1 from public.flag_admins where user_id = (select auth.uid())));
create or replace function public.set_flag(requested_flag text)
returns public.flag_state
language plpgsql security definer set search_path = ''
as $$
declare result public.flag_state;
begin
  if not exists (select 1 from public.flag_admins where user_id = auth.uid()) then
    raise exception 'Only approved race admins can change flags' using errcode = '42501';
  end if;
  if requested_flag is null or requested_flag not in
    ('CLEAR','YELLOW','SAFETY CAR','FCY','RED','GREEN','BLUE','WHITE','BLACK','CHEQUERED') then
    raise exception 'Unknown flag' using errcode = '22023';
  end if;
  update public.flag_state set flag = requested_flag, revision = revision + 1,
    updated_at = clock_timestamp() where id = 1 returning * into result;
  if not found then raise exception 'Flag state is missing'; end if;
  insert into public.flag_history(revision, flag, changed_by, changed_at)
    values (result.revision, result.flag, auth.uid(), result.updated_at);
  return result;
end;
$$;
revoke all on function public.set_flag(text) from public, anon, authenticated;
grant execute on function public.set_flag(text) to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'flag_state') then
    alter publication supabase_realtime add table public.flag_state;
  end if;
end $$;
commit;
