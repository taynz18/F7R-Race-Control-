alter table public.f7r_discord_check_ins add column confirmed_at timestamptz;
create function public.f7r_confirm_discord_reserve(p_guild text,p_message text,p_driver text,p_team text,p_f1 boolean)
returns text language plpgsql security invoker set search_path='' as $$
declare
  current_row public.f7r_discord_check_ins%rowtype;
  slot smallint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_guild || ':' || p_message, 0));
  select * into current_row from public.f7r_discord_check_ins
    where guild_id=p_guild and message_id=p_message and driver_id=p_driver;
  if current_row.driver_id is null or current_row.placement<>'Reserve' or current_row.checked_out_at is not null then
    return 'This driver must be an active reserve.';
  end if;
  if current_row.confirmed_at is not null and current_row.team=p_team then return 'Confirmed'; end if;
  if p_f1 then
    select s into slot from generate_series(1,2) as s where not exists (
      select 1 from public.f7r_discord_check_ins where guild_id=p_guild and message_id=p_message
        and team=p_team and seat=s and checked_out_at is null
    ) order by s limit 1;
    if slot is null then return 'Both team seats are occupied.'; end if;
  end if;
  update public.f7r_discord_check_ins set team=p_team,seat=slot,confirmed_at=now()
    where guild_id=p_guild and message_id=p_message and driver_id=p_driver;
  return 'Confirmed';
end;
$$;
revoke all on function public.f7r_confirm_discord_reserve(text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.f7r_confirm_discord_reserve(text,text,text,text,boolean) to service_role;

create function public.f7r_clear_reserve_confirmation() returns trigger language plpgsql set search_path='' as $$
begin
  if old.checked_out_at is not null and new.checked_out_at is null then new.confirmed_at=null; end if;
  return new;
end;
$$;
create trigger f7r_clear_reserve_confirmation before update on public.f7r_discord_check_ins
for each row execute function public.f7r_clear_reserve_confirmation();