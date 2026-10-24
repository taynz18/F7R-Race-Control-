begin;
select set_config('f7r.test.race',gen_random_uuid()::text,true),set_config('f7r.test.viewer',gen_random_uuid()::text,true);
insert into public.f7r_sessions(id,title,publisher_id,game_format)
select current_setting('f7r.test.race')::uuid,'Rollback access test',user_id,2026 from public.f7r_members where approved and role in ('admin','publisher') limit 1;
insert into public.f7r_snapshots(session_id,game_uid,frame,data)
values(current_setting('f7r.test.race')::uuid,'987654321',1,'{"format":2026,"drivers":[]}');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('f7r.test.viewer'),true),
set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('f7r.test.viewer'),'role','authenticated','is_anonymous',false)::text,true);
do $$ begin
 if not exists(select 1 from public.f7r_sessions where id=current_setting('f7r.test.race')::uuid) then raise exception 'FAIL: new viewer cannot read races'; end if;
 if not exists(select 1 from public.f7r_snapshots where session_id=current_setting('f7r.test.race')::uuid) then raise exception 'FAIL: new viewer cannot read snapshots'; end if;
 update public.f7r_snapshots set frame=2 where session_id=current_setting('f7r.test.race')::uuid;
 if found then raise exception 'FAIL: viewer changed telemetry'; end if;
 update public.f7r_sessions set title='Forbidden' where id=current_setting('f7r.test.race')::uuid;
 if found then raise exception 'FAIL: viewer changed race'; end if;
 begin
  update public.f7r_members set role='admin' where user_id=auth.uid();
  raise exception 'FAIL: viewer can edit membership';
 exception when insufficient_privilege then null; end;
 begin
  perform public.set_race_signal('RED','',null,null);
  raise exception 'FAIL: unapproved viewer can send flags';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 if not exists(select 1 from public.f7r_snapshots where session_id=current_setting('f7r.test.race')::uuid) then raise exception 'FAIL: guest cannot read live telemetry'; end if;
end $$;
reset role;
select 'PASS: signed-in viewer read access; race, telemetry, role and flag writes denied; guest live read allowed. Test rows roll back.' as result;
rollback;
