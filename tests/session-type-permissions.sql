begin;
do $test$
declare r uuid:=gen_random_uuid(); source uuid; publisher uuid; driver uuid:=gen_random_uuid();
begin
 select id,publisher_id into source,publisher from public.f7r_sessions where status='live' limit 1;
 insert into public.f7r_recordings(id,source_id,game_uid,state,started_at,last_seen,final_data)
 values(r,source,'test-'||r,'saved',now(),now(),'{"format":2026,"session_type":8,"drivers":[]}');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',driver,'role','authenticated','is_anonymous',false)::text,true);
 execute 'set local role authenticated';
 begin perform public.f7r_label_recording(r,'race');raise exception 'Driver was allowed to label sessions';exception when insufficient_privilege then null;end;
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',publisher,'role','authenticated','is_anonymous',false)::text,true);
 execute 'set local role authenticated';
 perform public.f7r_label_recording(r,'qualifying');
 if not exists(select 1 from public.f7r_recordings where id=r and session_kind='qualifying' and final_data->>'session_type'='8') then raise exception 'Admin label changed recorded telemetry or did not persist';end if;
 begin perform public.f7r_label_recording(r,'invalid');raise exception 'Invalid type accepted';exception when invalid_parameter_value then null;end;
 perform public.f7r_label_recording(r,null);
 if not exists(select 1 from public.f7r_recordings where id=r and session_kind is null) then raise exception 'Could not restore automatic classification';end if;
 execute 'reset role';
end $test$;
rollback;