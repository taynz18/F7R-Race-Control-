CREATE OR REPLACE FUNCTION public.f7r_record_discord_check_in(p_guild text, p_message text, p_driver text, p_name text, p_team text, p_full_time boolean, p_f1 boolean, p_out boolean)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  existing public.f7r_discord_check_ins%rowtype;
  slot smallint;
  assigned text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_guild || ':' || p_message, 0));
  select * into existing from public.f7r_discord_check_ins
  where guild_id=p_guild and message_id=p_message and driver_id=p_driver;
  if p_out then
    insert into public.f7r_discord_check_ins(guild_id,message_id,driver_id,driver_name,placement,checked_out_at)
    values(p_guild,p_message,p_driver,p_name,case when p_full_time then 'Full-time' else 'Reserve' end,now())
    on conflict(guild_id,message_id,driver_id) do update
      set driver_name=excluded.driver_name,
          checked_out_at=coalesce(f7r_discord_check_ins.checked_out_at,excluded.checked_out_at),
          seat=null,confirmed_at=null;
    return 'Not participating';
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
        seat=excluded.seat,checked_in_at=excluded.checked_in_at,checked_out_at=null,confirmed_at=null;
  return assigned;
end;
$function$;
