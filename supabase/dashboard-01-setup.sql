-- F7R dashboard foundation. Run once in Supabase SQL Editor.
-- Separate from the existing flag system; no existing tables are changed.
begin;
create table public.f7r_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 64),
  role text not null default 'driver' check (role in ('driver','publisher','admin')),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.f7r_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 120),
  game_format integer not null default 2026 check (game_format in (2025,2026)),
  status text not null default 'live' check (status in ('live','finished')),
  publisher_id uuid not null references public.f7r_members(user_id),
  driver_names jsonb not null default '{}'::jsonb check (jsonb_typeof(driver_names) = 'object'),
  created_at timestamptz not null default now()
);
create index f7r_sessions_publisher_idx on public.f7r_sessions(publisher_id);
create index f7r_sessions_created_idx on public.f7r_sessions(created_at desc);
create table public.f7r_snapshots (
  session_id uuid primary key references public.f7r_sessions(id) on delete cascade,
  game_uid text not null check (game_uid ~ '^[0-9]{1,20}$'),
  frame bigint not null check (frame between 0 and 4294967295),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  received_at timestamptz not null default clock_timestamp()
);
alter table public.f7r_members enable row level security;
alter table public.f7r_sessions enable row level security;
alter table public.f7r_snapshots enable row level security;
revoke all on public.f7r_members, public.f7r_sessions, public.f7r_snapshots from public, anon, authenticated;
grant select on public.f7r_members, public.f7r_sessions, public.f7r_snapshots to authenticated;
grant insert, update on public.f7r_sessions, public.f7r_snapshots to authenticated;
create policy f7r_read_self on public.f7r_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy f7r_members_read_sessions on public.f7r_sessions for select to authenticated using (
  exists (select 1 from public.f7r_members where user_id = (select auth.uid()) and approved)
);
create policy f7r_admin_create_session on public.f7r_sessions for insert to authenticated with check (
  exists (select 1 from public.f7r_members where user_id = (select auth.uid()) and approved and role = 'admin')
);
create policy f7r_admin_update_session on public.f7r_sessions for update to authenticated using (
  exists (select 1 from public.f7r_members where user_id = (select auth.uid()) and approved and role = 'admin')
) with check (
  exists (select 1 from public.f7r_members where user_id = (select auth.uid()) and approved and role = 'admin')
);
create policy f7r_members_read_snapshots on public.f7r_snapshots for select to authenticated using (
  exists (select 1 from public.f7r_members where user_id = (select auth.uid()) and approved)
);
create policy f7r_publisher_insert on public.f7r_snapshots for insert to authenticated with check (
  exists (select 1 from public.f7r_sessions s join public.f7r_members m on m.user_id=s.publisher_id
    where s.id=session_id and s.publisher_id=(select auth.uid()) and s.status='live'
      and m.approved and m.role in ('publisher','admin'))
);
create policy f7r_publisher_update on public.f7r_snapshots for update to authenticated using (
  exists (select 1 from public.f7r_sessions s join public.f7r_members m on m.user_id=s.publisher_id
    where s.id=session_id and s.publisher_id=(select auth.uid()) and s.status='live'
      and m.approved and m.role in ('publisher','admin'))
) with check (
  exists (select 1 from public.f7r_sessions s join public.f7r_members m on m.user_id=s.publisher_id
    where s.id=session_id and s.publisher_id=(select auth.uid()) and s.status='live'
      and m.approved and m.role in ('publisher','admin'))
);
create function public.f7r_validate_snapshot() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.session_id <> old.session_id or new.game_uid <> old.game_uid then
      raise exception 'Start a new F7R session for a different game session' using errcode='22023';
    end if;
    if new.frame <= old.frame then
      raise exception 'Outdated telemetry frame' using errcode='22023';
    end if;
    if clock_timestamp() - old.received_at < interval '400 milliseconds' then
      raise exception 'Upload limit: at most two snapshots per second' using errcode='22023';
    end if;
  end if;
  if octet_length(new.data::text) > 65536
    or jsonb_typeof(new.data->'drivers') is distinct from 'array'
    or (new.data->>'format') not in ('2025','2026') or not (new.data ? 'format') then
    raise exception 'Invalid telemetry payload' using errcode='22023';
  end if;
  if jsonb_array_length(new.data->'drivers') > 24 then
    raise exception 'Too many drivers' using errcode='22023';
  end if;
  if not exists (select 1 from public.f7r_sessions where id=new.session_id
    and game_format=(new.data->>'format')::integer) then
    raise exception 'Game format does not match race configuration';
  end if;
  new.received_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.f7r_validate_snapshot() from public, anon, authenticated;
create trigger f7r_snapshot_validation before insert or update on public.f7r_snapshots
for each row execute function public.f7r_validate_snapshot();
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
    and schemaname='public' and tablename='f7r_snapshots') then
    alter publication supabase_realtime add table public.f7r_snapshots;
  end if;
end $$;
-- Existing flag admins retain one-login access to the combined dashboard.
insert into public.f7r_members(user_id,display_name,role,approved)
select user_id,'Race admin','admin',true from public.flag_admins
on conflict(user_id) do nothing;
commit;

