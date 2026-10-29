begin;
do $test$
declare source uuid; publisher uuid; driver uuid:=gen_random_uuid(); done uuid:=gen_random_uuid(); waiting uuid:=gen_random_uuid(); interrupted uuid:=gen_random_uuid(); active uuid:=gen_random_uuid(); removed uuid:=gen_random_uuid(); n integer;
begin
 select id,publisher_id into source,publisher from public.f7r_sessions where status='live' limit 1;
 insert into public.f7r_recordings(id,source_id,game_uid,started_at,last_seen,finished_at,sample_count,final_data,state)
 values
 (done,source,'test-'||done,now()-interval '1 hour',now(),now()-interval '121 seconds',1,'{"drivers":[],"format":2026}','recording'),
 (waiting,source,'test-'||waiting,now()-interval '1 hour',now(),now()-interval '90 seconds',1,'{"drivers":[],"format":2026}','recording'),
 (interrupted,source,'test-'||interrupted,now()-interval '1 hour',now()-interval '121 seconds',null,1,'{"drivers":[],"format":2026}','recording'),
 (active,source,'test-'||active,now()-interval '1 hour',now(),null,1,'{"drivers":[],"format":2026}','recording'),
 (removed,source,'test-'||removed,now()-interval '1 hour',now()-interval '10 minutes',now()-interval '10 minutes',1,'{"drivers":[],"format":2026}','discarded');
 insert into public.f7r_recording_samples values(done,1,now(),'{"drivers":[],"format":2026}');
 perform f7r_private.auto_save_recordings();
 if not exists(select 1 from public.f7r_recordings where id=done and state='saved' and archive_reason='finished') then raise exception 'Finished session not saved after two minutes';end if;
 if not exists(select 1 from public.f7r_recordings where id=waiting and state='recording') then raise exception 'Session saved before the two-minute deadline';end if;
 if not exists(select 1 from public.f7r_recordings where id=interrupted and state='saved' and archive_reason='inactive') then raise exception 'Interrupted session not preserved';end if;
 if not exists(select 1 from public.f7r_recordings where id=active and state='recording') then raise exception 'Active race saved prematurely';end if;
 if not exists(select 1 from public.f7r_recordings where id=removed and state='discarded') then raise exception 'Deleted session reappeared';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',driver,'role','authenticated','is_anonymous',false)::text,true);
 execute 'set local role authenticated';
 select count(*) into n from public.f7r_recordings where id=done;if n<>1 then raise exception 'Driver cannot read auto-saved session';end if;
 select count(*) into n from public.f7r_recordings where id=waiting;if n<>0 then raise exception 'Driver can read draft';end if;
 begin perform public.f7r_finish_recording(done,'Unauthorized',true);raise exception 'Driver can remove shared session';exception when insufficient_privilege then null;end;
 begin perform f7r_private.auto_save_recordings();raise exception 'Client can execute internal scheduler';exception when insufficient_privilege then null;end;
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',publisher,'role','authenticated','is_anonymous',false)::text,true);
 execute 'set local role authenticated';
 perform public.f7r_finish_recording(done,'Race to keep',false);
 if not exists(select 1 from public.f7r_recordings where id=done and kept_at is not null) then raise exception 'Admin keep failed';end if;
 perform public.f7r_finish_recording(done,'Race to keep',true);
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',driver,'role','authenticated','is_anonymous',false)::text,true);
 execute 'set local role authenticated';
 select count(*) into n from public.f7r_recordings where id=done;if n<>0 then raise exception 'Deleted session still visible';end if;
 select count(*) into n from public.f7r_recording_samples where recording_id=done;if n<>0 then raise exception 'Deleted samples still visible';end if;
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',publisher,'role','authenticated','is_anonymous',false)::text,true);
 execute 'set local role authenticated';
 perform public.f7r_finish_recording(done,'Restored race',false);
 if not exists(select 1 from public.f7r_recordings where id=done and state='saved') then raise exception 'Restore failed';end if;
 execute 'reset role';
end $test$;
rollback;
begin;
do $test$
declare source uuid:=gen_random_uuid(); publisher uuid; rid uuid; n integer;
begin
 select publisher_id into publisher from public.f7r_sessions where status='live' limit 1;
 insert into public.f7r_sessions(id,title,publisher_id) values(source,'Rollback-only autosave resume test',publisher);
 insert into public.f7r_receiver_controls(session_id,enabled) values(source,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',publisher,'role','authenticated','is_anonymous',false)::text,true);
 execute 'set local role authenticated';
 insert into public.f7r_snapshots(session_id,game_uid,frame,data) values(source,'1',1,'{"format":2026,"drivers":[{"slot":0,"lap":1,"position":1,"result_status":2}]}');
 select id into rid from public.f7r_recordings where source_id=source;
 execute 'reset role';
 update public.f7r_recordings set last_seen=now()-interval '3 minutes' where id=rid;
 perform f7r_private.auto_save_recordings();
 if not exists(select 1 from public.f7r_recordings where id=rid and state='saved' and archive_reason='inactive') then raise exception 'Interrupted session not saved';end if;
 execute 'set local role authenticated';
 perform pg_sleep(.45);
 update public.f7r_snapshots set frame=2,data=jsonb_set(data,'{drivers,0,lap}','2') where session_id=source;
 if not exists(select 1 from public.f7r_recordings where id=rid and state='recording' and sample_count=2) then raise exception 'Interrupted session did not resume capture';end if;
 execute 'reset role';
 update public.f7r_recordings set last_seen=now()-interval '3 minutes' where id=rid;
 perform f7r_private.auto_save_recordings();
 execute 'set local role authenticated';
 perform public.f7r_finish_recording(rid,'Keep this completed recording',false);
 perform pg_sleep(.45);
 update public.f7r_snapshots set frame=3,data=jsonb_set(data,'{drivers,0,lap}','3') where session_id=source;
 if not exists(select 1 from public.f7r_recordings where id=rid and state='saved' and sample_count=2 and kept_at is not null) then raise exception 'Kept session was overwritten';end if;
 execute 'reset role';
end $test$;
rollback;