begin;
select set_config('f7r.test.live',gen_random_uuid()::text,true),set_config('f7r.test.finished',gen_random_uuid()::text,true);
insert into public.f7r_sessions(id,title,publisher_id,status)
select current_setting('f7r.test.live')::uuid,'Guest rollback live',user_id,'live' from public.f7r_members where approved and role in ('admin','publisher') limit 1;
insert into public.f7r_sessions(id,title,publisher_id,status)
select current_setting('f7r.test.finished')::uuid,'Guest rollback finished',user_id,'finished' from public.f7r_members where approved and role in ('admin','publisher') limit 1;
insert into public.f7r_snapshots(session_id,game_uid,frame,data) values
(current_setting('f7r.test.live')::uuid,'98761',1,'{"format":2026,"drivers":[]}'),
(current_setting('f7r.test.finished')::uuid,'98762',1,'{"format":2026,"drivers":[]}');
set local role anon;
do $$ begin
 if not exists(select 1 from public.f7r_snapshots where session_id=current_setting('f7r.test.live')::uuid) then raise exception 'FAIL: guest cannot read live data'; end if;
 if exists(select 1 from public.f7r_sessions where id=current_setting('f7r.test.finished')::uuid) or exists(select 1 from public.f7r_snapshots where session_id=current_setting('f7r.test.finished')::uuid) then raise exception 'FAIL: guest can read finished archive'; end if;
 begin update public.f7r_sessions set title='Forbidden';raise exception 'FAIL: guest wrote race';exception when insufficient_privilege then null;end;
 begin update public.f7r_snapshots set frame=2;raise exception 'FAIL: guest wrote telemetry';exception when insufficient_privilege then null;end;
 begin perform 1 from public.f7r_members;raise exception 'FAIL: guest can read membership';exception when insufficient_privilege then null;end;
 begin perform public.set_race_signal('RED','',null,null);raise exception 'FAIL: guest sent flag';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: guest live reads allowed; archives, membership, telemetry writes, race writes and flag sends denied. All test records roll back.' as result;
rollback;
