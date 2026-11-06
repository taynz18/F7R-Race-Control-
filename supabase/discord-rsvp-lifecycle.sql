alter table public.f7r_discord_check_ins
  add column checked_in_at timestamptz,
  add column checked_out_at timestamptz,
  add column seat smallint check (seat in (1,2));

create table public.f7r_discord_team_emojis (
  guild_id text not null, game text not null, team text not null, emoji_id text not null,
  primary key (guild_id,game,team)
);
alter table public.f7r_discord_team_emojis enable row level security;
revoke all on public.f7r_discord_team_emojis from public,anon,authenticated;
grant select,insert,update on public.f7r_discord_team_emojis to service_role;

create function public.f7r_record_discord_check_in(
  p_guild text,p_message text,p_driver text,p_name text,p_team text,
  p_full_time boolean,p_f1 boolean,p_out boolean
) returns text language plpgsql security invoker set search_path = '' as $$
declare
  existing public.f7r_discord_check_ins%rowtype;
  slot smallint;
  assigned text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_guild || ':' || p_message, 0));
  select * into existing from public.f7r_discord_check_ins
  where guild_id=p_guild and message_id=p_message and driver_id=p_driver;
  if p_out then
    if existing.driver_id is null then return 'No check-in yet'; end if;
    update public.f7r_discord_check_ins set checked_out_at=coalesce(checked_out_at,now()),seat=null
      where guild_id=p_guild and message_id=p_message and driver_id=p_driver;
    return 'Checked out';
  end if;
  if existing.driver_id is not null and existing.checked_out_at is null then return existing.placement; end if;
  if p_full_time and p_f1 then
    select s into slot from generate_series(1,2) as s
    where not exists (
      select 1 from public.f7r_discord_check_ins
      where guild_id=p_guild and message_id=p_message and team=p_team and seat=s and checked_out_at is null
    ) order by s limit 1;
  end if;
  assigned := case when p_full_time and (not p_f1 or slot is not null) then 'Full-time' else 'Reserve' end;
  insert into public.f7r_discord_check_ins(guild_id,message_id,driver_id,driver_name,team,placement,seat,checked_in_at,checked_out_at)
  values(p_guild,p_message,p_driver,p_name,p_team,assigned,slot,now(),null)
  on conflict(guild_id,message_id,driver_id) do update
    set driver_name=excluded.driver_name,team=excluded.team,placement=excluded.placement,
        seat=excluded.seat,checked_in_at=excluded.checked_in_at,checked_out_at=null;
  return assigned;
end;
$$;
revoke all on function public.f7r_record_discord_check_in(text,text,text,text,text,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.f7r_record_discord_check_in(text,text,text,text,text,boolean,boolean,boolean) to service_role;