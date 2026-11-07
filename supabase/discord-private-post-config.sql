create table public.f7r_discord_post_config (
  guild_id text not null,
  post_key text not null,
  config jsonb not null,
  primary key(guild_id,post_key)
);
alter table public.f7r_discord_post_config enable row level security;
revoke all on public.f7r_discord_post_config from public,anon,authenticated;
grant select,insert on public.f7r_discord_post_config to service_role;