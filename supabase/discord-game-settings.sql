create table public.f7r_discord_game_settings (
  guild_id text not null, game text not null, settings jsonb not null,
  primary key (guild_id, game)
);
alter table public.f7r_discord_game_settings enable row level security;
revoke all on public.f7r_discord_game_settings from public, anon, authenticated;
grant select,insert,update on public.f7r_discord_game_settings to service_role;