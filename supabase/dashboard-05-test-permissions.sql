-- Run AFTER query 01. All test users, sessions and snapshots roll back.
-- Uses generated IDs; no real driver records are changed.
begin;
select set_config('f7r.test.viewer',gen_random_uuid()::text,true),
       set_config('f7r.test.receiver',gen_random_uuid()::text,true),
       set_config('f7r.test.stranger',gen_random_uuid()::text,true),
       set_config('f7r.test.race',gen_random_uuid()::text,true);
insert into auth.users(id,email) values
  (current_setting('f7r.test.viewer')::uuid,'f7r-test-'||current_setting('f7r.test.viewer')||'@example.invalid'),
  (current_setting('f7r.test.receiver')::uuid,'f7r-test-'||current_setting('f7r.test.receiver')||'@example.invalid'),
  (current_setting('f7r.test.stranger')::uuid,'f7r-test-'||current_setting('f7r.test.stranger')||'@example.invalid');
insert into public.f7r_members(user_id,display_name,role,approved) values
  (current_setting('f7r.test.viewer')::uuid,'Test viewer','driver',true),
  (current_setting('f7r.test.receiver')::uuid,'Test receiver','publisher',true);
insert into public.f7r_sessions(id,title,publisher_id)
  values(current_setting('f7r.test.race')::uuid,'Rollback test race',current_setting('f7r.test.receiver')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('f7r.test.receiver'),true);
insert into public.f7r_snapshots(session_id,game_uid,frame,data)
 values(current_setting('f7r.test.race')::uuid,'123',100,'{"format":2026,"drivers":[]}');
do $$ begin
  if (select count(*) from public.f7r_snapshots where session_id=current_setting('f7r.test.race')::uuid) <> 1 then
    raise exception 'FAIL: publisher cannot read inserted snapshot';
  end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('f7r.test.viewer'),true);
do $$ begin
  if (select count(*) from public.f7r_snapshots where session_id=current_setting('f7r.test.race')::uuid) <> 1 then
    raise exception 'FAIL: approved driver cannot read shared race';
  end if;
  if (select count(*) from public.f7r_members) <> 1 then
    raise exception 'FAIL: viewer can read other membership records';
  end if;
end $$;
-- A viewer must never be able to become a publisher.
do $$ begin
  begin
    update public.f7r_members set role='admin' where user_id=auth.uid();
    raise exception 'FAIL: viewer promoted themselves';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.f7r_sessions(title,publisher_id)
      values('Forbidden',current_setting('f7r.test.viewer')::uuid);
    raise exception 'FAIL: viewer created a race';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.f7r_snapshots where session_id=current_setting('f7r.test.race')::uuid) then
    -- RLS UPDATE silently affects zero rows when the writer is unauthorized.
    update public.f7r_snapshots set frame=200 where session_id=current_setting('f7r.test.race')::uuid;
    if found then raise exception 'FAIL: viewer overwrote telemetry'; end if;
  end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('f7r.test.stranger'),true);
do $$ begin
  if not exists(select 1 from public.f7r_sessions where id=current_setting('f7r.test.race')::uuid)
    or not exists(select 1 from public.f7r_snapshots where session_id=current_setting('f7r.test.race')::uuid) then
    raise exception 'FAIL: signed-in viewer cannot see race data';
  end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.f7r_snapshots;
    raise exception 'FAIL: anonymous account can read telemetry';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'PASS: publisher write, approved viewer read, viewer write denial, membership protection, self-service viewer read and anonymous denial. All test data rolls back.' as result;
rollback;

