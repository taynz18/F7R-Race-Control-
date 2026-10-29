begin;
alter table public.flag_state drop constraint flag_state_flag_check;
alter table public.flag_state add constraint flag_state_flag_check check(flag in
 ('CLEAR','YELLOW','SAFETY CAR','FCY','PREPARE TO RACE','RED','GREEN','BLUE','WHITE','BLACK','CHEQUERED'));
create or replace function public.set_race_signal(requested_flag text, requested_message text default '',
    countdown_seconds integer default null, expected_revision bigint default null)
returns public.flag_state language plpgsql security definer set search_path = '' as $$
declare result public.flag_state;
begin
  if not exists(select 1 from public.flag_admins where user_id=auth.uid()) then
    raise exception 'Only approved race admins can change flags' using errcode='42501';
  end if;
  if requested_flag is null or requested_flag not in
    ('CLEAR','YELLOW','SAFETY CAR','FCY','RED','GREEN','BLUE','WHITE','BLACK','CHEQUERED','PREPARE TO RACE') then
    raise exception 'Unknown flag' using errcode='22023';
  end if;
  if char_length(coalesce(requested_message,''))>120 then
    raise exception 'Messages must be 120 characters or fewer' using errcode='22023';
  end if;
  if countdown_seconds is not null and (requested_flag not in ('FCY','PREPARE TO RACE') or countdown_seconds<1) then
    raise exception 'A positive whole-second countdown is only available for FCY and Prepare to race' using errcode='22023';
  end if;
  select * into result from public.flag_state where id=1 for update;
  if not found then raise exception 'Flag state is missing'; end if;
  if expected_revision is not null and result.revision<>expected_revision then
    raise exception 'The live flag changed. Refresh and try again.' using errcode='40001';
  end if;
  update public.flag_state set flag=requested_flag,
    custom_message=case when requested_flag='CLEAR' then '' else trim(coalesce(requested_message,'')) end,
    countdown_ends_at=case when countdown_seconds is null then null else clock_timestamp()+make_interval(secs=>countdown_seconds) end,
    revision=revision+1,updated_at=clock_timestamp() where id=1 returning * into result;
  insert into public.flag_history(revision,flag,changed_by,changed_at,custom_message,countdown_ends_at,reason)
    values(result.revision,result.flag,auth.uid(),result.updated_at,result.custom_message,result.countdown_ends_at,'admin');
  return result;
end $$;
revoke all on function public.set_race_signal(text,text,integer,bigint) from public,anon,authenticated;
grant execute on function public.set_race_signal(text,text,integer,bigint) to authenticated;


-- Keep the existing Cron job, but give each countdown its own completion state.
create or replace function public.finish_fcy_countdown()
returns void language plpgsql security definer set search_path = '' as $$
declare result public.flag_state;
begin
  update public.flag_state set
    flag=case when flag='PREPARE TO RACE' then 'GREEN' else 'FCY' end,
    custom_message=case when flag='PREPARE TO RACE' then '' else custom_message end,
    countdown_ends_at=null,revision=revision+1,updated_at=clock_timestamp()
    where id=1 and flag in ('FCY','PREPARE TO RACE') and countdown_ends_at is not null
      and countdown_ends_at<=clock_timestamp() returning * into result;
  if found then
    insert into public.flag_history(revision,flag,changed_by,changed_at,custom_message,countdown_ends_at,reason)
      values(result.revision,result.flag,null,result.updated_at,result.custom_message,null,
        case when result.flag='FCY' then 'fcy_active' else 'countdown' end);
  end if;
end $$;
revoke all on function public.finish_fcy_countdown() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
