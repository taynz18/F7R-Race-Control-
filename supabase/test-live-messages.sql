-- Safe live-project verification: every temporary signal and history row rolls back.
begin;
do $$
declare admin_id uuid; s public.flag_state; deadline timestamptz; started timestamptz; before_revision bigint;
begin
  if has_function_privilege('anon','public.set_race_signal(text,text,integer,bigint)','EXECUTE')
     or has_function_privilege('anon','public.update_flag_message(text,bigint)','EXECUTE')
     or has_function_privilege('authenticated','public.finish_fcy_countdown()','EXECUTE') then
    raise exception 'Unsafe function privileges';
  end if;
  select user_id into admin_id from public.flag_admins limit 1;
  if admin_id is null then raise exception 'No approved test admin'; end if;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',admin_id,'role','authenticated')::text,true);
  s:=public.set_race_signal('FCY','Hold position',20,null);
  if s.custom_message<>'Hold position' or s.countdown_ends_at is null then raise exception 'Countdown creation failed'; end if;
  deadline:=s.countdown_ends_at;started:=s.updated_at;
  s:=public.update_flag_message('No overtaking',s.revision);
  if s.countdown_ends_at<>deadline or s.updated_at<>started then raise exception 'Message reset countdown or live clock'; end if;
  begin
    perform public.update_flag_message('stale message',s.revision-1);
    raise exception 'Stale admin update was accepted';
  exception when serialization_failure then null;end;
  begin
    perform public.set_race_signal('RED','',10,null);
    raise exception 'RED countdown was accepted';
  exception when invalid_parameter_value then null;end;
  begin
    perform public.set_race_signal('FCY','',0,null);
    raise exception 'Zero countdown was accepted';
  exception when invalid_parameter_value then null;end;
  begin
    perform public.update_flag_message(repeat('a',121),s.revision);
    raise exception 'Oversized message was accepted';
  exception when invalid_parameter_value then null;end;
  -- Simulate expiry inside this uncommitted transaction.
  update public.flag_state set countdown_ends_at=clock_timestamp()-interval '1 second' where id=1;
  perform public.finish_fcy_countdown();
  select * into s from public.flag_state where id=1;
  if s.flag<>'GREEN' or s.countdown_ends_at is not null or s.custom_message<>'' then raise exception 'Automatic green failed'; end if;
  before_revision:=s.revision;
  perform public.finish_fcy_countdown();
  if (select revision from public.flag_state where id=1)<>before_revision then raise exception 'Duplicate green event'; end if;
  s:=public.set_race_signal('FCY','',1,null);
  s:=public.set_flag('RED');
  perform public.finish_fcy_countdown();
  select * into s from public.flag_state where id=1;
  if s.flag<>'RED' or s.countdown_ends_at is not null then raise exception 'Cancelled countdown overrode RED'; end if;
  s:=public.set_race_signal('FCY','',2147483647,null);
  s:=public.set_race_signal('CLEAR','hidden message',null,null);
  if s.countdown_ends_at is not null or s.custom_message<>'' then raise exception 'Clear did not remove countdown and message'; end if;
  if not exists(select 1 from cron.job where jobname='f7r-fcy-countdown' and active and schedule='1 second') then raise exception 'Countdown scheduler missing'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
  begin
    perform public.set_race_signal('RED','',null,null);
    raise exception 'Unapproved admin changed flags';
  exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: messages, timer preservation, automatic GREEN, cancellation, stale updates, validation, permissions, scheduler. All test changes rolled back.' as result;
