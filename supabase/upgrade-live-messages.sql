-- F7R upgrade: live messages and a server-owned FCY countdown.
-- Run once in the existing project's Supabase SQL Editor.
begin;
alter table public.flag_state add column if not exists custom_message text not null default '';
alter table public.flag_state add column if not exists countdown_ends_at timestamptz;
alter table public.flag_history add column if not exists custom_message text not null default '';
alter table public.flag_history add column if not exists countdown_ends_at timestamptz;
alter table public.flag_history add column if not exists reason text not null default 'admin';

create or replace function public.set_race_signal(requested_flag text, requested_message text default '',
    countdown_seconds integer default null, expected_revision bigint default null)
returns public.flag_state language plpgsql security definer set search_path = '' as $$
declare result public.flag_state;
begin
  if not exists(select 1 from public.flag_admins where user_id=auth.uid()) then
    raise exception 'Only approved race admins can change flags' using errcode='42501';
  end if;
  if requested_flag is null or requested_flag not in
    ('CLEAR','YELLOW','SAFETY CAR','FCY','RED','GREEN','BLUE','WHITE','BLACK','CHEQUERED') then
    raise exception 'Unknown flag' using errcode='22023';
  end if;
  if char_length(coalesce(requested_message,''))>120 then
    raise exception 'Messages must be 120 characters or fewer' using errcode='22023';
  end if;
  if countdown_seconds is not null and (requested_flag<>'FCY' or countdown_seconds<1) then
    raise exception 'A positive whole-second countdown is only available for FCY' using errcode='22023';
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

-- Older admin pages still cancel a running countdown when choosing another flag.
create or replace function public.set_flag(requested_flag text)
returns public.flag_state language sql security definer set search_path = '' as $$
  select public.set_race_signal(requested_flag,'',null,null);
$$;
revoke all on function public.set_flag(text) from public,anon,authenticated;
grant execute on function public.set_flag(text) to authenticated;

create or replace function public.update_flag_message(requested_message text, expected_revision bigint)
returns public.flag_state language plpgsql security definer set search_path = '' as $$
declare result public.flag_state;
begin
  if not exists(select 1 from public.flag_admins where user_id=auth.uid()) then
    raise exception 'Only approved race admins can change messages' using errcode='42501';
  end if;
  if char_length(coalesce(requested_message,''))>120 then
    raise exception 'Messages must be 120 characters or fewer' using errcode='22023';
  end if;
  select * into result from public.flag_state where id=1 for update;
  if expected_revision is null or result.revision<>expected_revision then
    raise exception 'The live flag changed. Refresh and try again.' using errcode='40001';
  end if;
  if result.flag='CLEAR' then raise exception 'Choose a live flag first' using errcode='22023'; end if;
  update public.flag_state set custom_message=trim(coalesce(requested_message,'')),revision=revision+1
    where id=1 returning * into result;
  insert into public.flag_history(revision,flag,changed_by,changed_at,custom_message,countdown_ends_at,reason)
    values(result.revision,result.flag,auth.uid(),clock_timestamp(),result.custom_message,result.countdown_ends_at,'message');
  return result;
end $$;
revoke all on function public.update_flag_message(text,bigint) from public,anon,authenticated;
grant execute on function public.update_flag_message(text,bigint) to authenticated;

create or replace function public.finish_fcy_countdown()
returns void language plpgsql security definer set search_path = '' as $$
declare result public.flag_state;
begin
  -- One atomic predicate prevents old countdowns from overriding a later RED or other admin call.
  update public.flag_state set flag='GREEN',custom_message='',countdown_ends_at=null,
    revision=revision+1,updated_at=clock_timestamp()
    where id=1 and flag='FCY' and countdown_ends_at is not null and countdown_ends_at<=clock_timestamp()
    returning * into result;
  if found then
    insert into public.flag_history(revision,flag,changed_by,changed_at,custom_message,countdown_ends_at,reason)
      values(result.revision,'GREEN',null,result.updated_at,'',null,'countdown');
  end if;
end $$;
revoke all on function public.finish_fcy_countdown() from public,anon,authenticated;

create or replace function public.get_race_state()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select to_jsonb(s)||jsonb_build_object('server_time',statement_timestamp())
    from public.flag_state s where id=1;
$$;
revoke all on function public.get_race_state() from public,anon,authenticated;
grant execute on function public.get_race_state() to anon,authenticated;

-- Keep the automatic finish running independently of all browsers and driver PCs.
create extension if not exists pg_cron;
select cron.schedule('f7r-fcy-countdown','1 second','select public.finish_fcy_countdown();');
notify pgrst,'reload schema';
commit;
