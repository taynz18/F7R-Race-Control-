create table public.f7r_discord_check_ins (
  guild_id text not null,
  message_id text not null,
  driver_id text not null,
  driver_name text not null,
  team text,
  placement text not null check (placement in ('Full-time','Reserve')),
  primary key (guild_id, message_id, driver_id)
);
alter table public.f7r_discord_check_ins enable row level security;
revoke all on public.f7r_discord_check_ins from public, anon, authenticated;
grant select, insert, update on public.f7r_discord_check_ins to service_role;