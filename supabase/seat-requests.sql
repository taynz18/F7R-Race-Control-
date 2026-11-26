create table public.f7r_seat_settings (
 guild_id text primary key, config jsonb not null, revision integer not null default 0
);
create table public.f7r_seat_counters (
 guild_id text not null, series text not null check(series in ('F1','ACC','LMU')), last_number integer not null,
 primary key(guild_id,series)
);
create table public.f7r_seat_requests (
 id uuid primary key default gen_random_uuid(),guild_id text not null,series text not null check(series in ('F1','ACC','LMU')),
 number integer not null,driver_id text not null,profile jsonb not null,snapshot jsonb not null,
 status text not null default 'draft' check(status in ('draft','opening','waiting','assigning','acquired','closed','deleting','deleted')),
 channel_id text,summary_message_id text,decision jsonb not null default '{}',revision integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(guild_id,series,number)
);
create unique index f7r_seat_one_open_per_series on public.f7r_seat_requests(guild_id,driver_id,series)
 where status in ('draft','opening','waiting','assigning');
create index f7r_seat_queue on public.f7r_seat_requests(guild_id,status,created_at);
alter table public.f7r_seat_settings enable row level security;
alter table public.f7r_seat_counters enable row level security;
alter table public.f7r_seat_requests enable row level security;
revoke all on public.f7r_seat_settings,public.f7r_seat_counters,public.f7r_seat_requests from public,anon,authenticated;
grant all on public.f7r_seat_settings,public.f7r_seat_counters,public.f7r_seat_requests to service_role;

create function public.f7r_seat_draft(p_guild text,p_driver text,p_series text,p_profile jsonb,p_snapshot jsonb)
returns public.f7r_seat_requests language plpgsql security invoker set search_path=public,pg_temp as $$
declare t public.f7r_seat_requests; n integer;
begin
 if coalesce(p_series,'') not in ('F1','ACC','LMU') or coalesce(p_guild,'') !~ '^[0-9]{17,20}$' or coalesce(p_driver,'') !~ '^[0-9]{17,20}$' then raise exception 'Invalid seat request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_guild||':'||p_driver||':'||p_series,0));
 select * into t from f7r_seat_requests where guild_id=p_guild and driver_id=p_driver and series=p_series and status in ('draft','opening','waiting','assigning') for update;
 if found then
   if t.status='draft' then update f7r_seat_requests set profile=p_profile,snapshot=p_snapshot,revision=revision+1,updated_at=now() where id=t.id returning * into t;end if;
   return t;
 end if;
 insert into f7r_seat_counters(guild_id,series,last_number) values(p_guild,p_series,1001)
 on conflict(guild_id,series) do update set last_number=f7r_seat_counters.last_number+1 returning last_number into n;
 insert into f7r_seat_requests(guild_id,driver_id,series,number,profile,snapshot) values(p_guild,p_driver,p_series,n,p_profile,p_snapshot) returning * into t;
 return t;
end $$;
revoke all on function public.f7r_seat_draft(text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.f7r_seat_draft(text,text,text,jsonb,jsonb) to service_role;
