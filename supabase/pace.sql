-- Pace evidence remains in Discord. Only times, message references and review audit are stored.
create table public.f7r_pace_panels (
 guild_id text not null, id text not null, config jsonb not null,
 revision integer not null default 0, primary key(guild_id,id)
);
create table public.f7r_pace_tickets (
 id uuid primary key default gen_random_uuid(),
 number bigint generated always as identity(start with 1001) unique,
 guild_id text not null, panel_id text not null, driver_id text not null,
 channel_id text, snapshot jsonb not null, entries jsonb not null default '{}',
 status text not null default 'draft' check(status in ('draft','review','assigning','approved','cancelled')),
 decision jsonb, revision integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(guild_id,panel_id) references public.f7r_pace_panels(guild_id,id)
);
create unique index f7r_pace_one_open on public.f7r_pace_tickets(guild_id,panel_id,driver_id) where status in ('draft','review','assigning');
create index f7r_pace_queue on public.f7r_pace_tickets(guild_id,created_at desc);
alter table public.f7r_pace_panels enable row level security;
alter table public.f7r_pace_tickets enable row level security;
revoke all on public.f7r_pace_panels,public.f7r_pace_tickets from public,anon,authenticated;
grant all on public.f7r_pace_panels,public.f7r_pace_tickets to service_role;
grant usage,select on sequence public.f7r_pace_tickets_number_seq to service_role;