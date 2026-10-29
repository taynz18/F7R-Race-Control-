
alter table public.f7r_recordings add column finished_at timestamptz,
 add column archive_reason text check (archive_reason in ('finished','inactive','manual')),
 add column kept_at timestamptz;
grant update(kept_at) on public.f7r_recordings to authenticated;
create index f7r_recordings_pending on public.f7r_recordings(last_seen) where state='recording';
update public.f7r_recordings r set finished_at=(
 select min(s.captured_at) from public.f7r_recording_samples s where s.recording_id=r.id
 and exists(select 1 from jsonb_array_elements(s.data->'drivers') d where d->>'position'='1' and d->>'result_status'='3'))
 where r.state='recording';
create or replace function f7r_private.capture_recording() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.f7r_recordings; sig jsonb; finished boolean;
begin
 if auth.uid() is null or not exists(
 select 1 from public.f7r_sessions s join public.f7r_members m on m.user_id=s.publisher_id
 join public.f7r_receiver_controls c on c.session_id=s.id
 where s.id=new.session_id and s.publisher_id=auth.uid() and s.status='live'
 and m.approved and m.role in ('publisher','admin') and c.enabled) then return new; end if;
 select jsonb_agg(jsonb_build_array(d->'slot',d->'lap',d->'result_status') order by (d->>'slot')::int)
 into sig from jsonb_array_elements(new.data->'drivers') d;
 finished:=exists(select 1 from jsonb_array_elements(new.data->'drivers') d where d->>'position'='1' and d->>'result_status'='3');
 insert into public.f7r_recordings(source_id,game_uid,started_at,last_seen,final_data)
 values(new.session_id,new.game_uid,new.received_at,new.received_at,new.data) on conflict(source_id,game_uid) do nothing;
 select * into r from public.f7r_recordings where source_id=new.session_id and game_uid=new.game_uid for update;
 if r.state<>'recording' then return new; end if;
 if finished and r.finished_at is null then
 update public.f7r_recordings set finished_at=new.received_at where id=r.id;
 end if;
 if r.sample_count=0 or new.received_at-r.last_seen>=interval '2 seconds' or sig is distinct from r.lap_signature then
 insert into public.f7r_recording_samples values(r.id,new.frame,new.received_at,new.data) on conflict do nothing;
 if found then update public.f7r_recordings set last_seen=new.received_at,final_data=new.data,lap_signature=sig,sample_count=sample_count+1 where id=r.id;end if;
 end if;
 return new;
end $$;
revoke all on function f7r_private.capture_recording() from public,anon,authenticated;
create function f7r_private.auto_save_recordings() returns integer language plpgsql security invoker set search_path='' as $$
declare saved integer;
begin
 update public.f7r_recordings set state='saved',saved_at=clock_timestamp(),
 archive_reason=case when finished_at is not null then 'finished' else 'inactive' end
 where state='recording' and sample_count>0 and
 ((finished_at is not null and finished_at<=clock_timestamp()-interval '2 minutes')
 or last_seen<=clock_timestamp()-interval '2 minutes');
 get diagnostics saved=row_count;return saved;
end $$;
revoke all on function f7r_private.auto_save_recordings() from public,anon,authenticated;
create or replace function public.f7r_finish_recording(recording uuid, session_title text, discard boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.flag_admins where user_id=auth.uid()) then
 raise exception 'Only race admins can manage recordings' using errcode='42501';end if;
 if not discard and (session_title is null or length(btrim(session_title)) not between 1 and 100) then
 raise exception 'Enter a session name between 1 and 100 characters' using errcode='22023';end if;
 update public.f7r_recordings set state=case when discard then 'discarded' else 'saved' end,
 title=case when discard then title else btrim(session_title) end,
 saved_at=coalesce(saved_at,clock_timestamp()),saved_by=auth.uid(),
 kept_at=case when discard then kept_at else clock_timestamp() end
 where id=recording;
 if not found then raise exception 'Recording unavailable';end if;
end $$;
revoke all on function public.f7r_finish_recording(uuid,text,boolean) from public,anon;
grant execute on function public.f7r_finish_recording(uuid,text,boolean) to authenticated;
select cron.schedule('f7r-auto-save-sessions','30 seconds','select f7r_private.auto_save_recordings()');
select f7r_private.auto_save_recordings();

create or replace function f7r_private.capture_recording() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.f7r_recordings; sig jsonb; finished boolean;
begin
 if auth.uid() is null or not exists(
 select 1 from public.f7r_sessions s join public.f7r_members m on m.user_id=s.publisher_id
 join public.f7r_receiver_controls c on c.session_id=s.id
 where s.id=new.session_id and s.publisher_id=auth.uid() and s.status='live'
 and m.approved and m.role in ('publisher','admin') and c.enabled) then return new; end if;
 select jsonb_agg(jsonb_build_array(d->'slot',d->'lap',d->'result_status') order by (d->>'slot')::int)
 into sig from jsonb_array_elements(new.data->'drivers') d;
 finished:=exists(select 1 from jsonb_array_elements(new.data->'drivers') d where d->>'position'='1' and d->>'result_status'='3');
 insert into public.f7r_recordings(source_id,game_uid,started_at,last_seen,final_data)
 values(new.session_id,new.game_uid,new.received_at,new.received_at,new.data) on conflict(source_id,game_uid) do nothing;
 select * into r from public.f7r_recordings where source_id=new.session_id and game_uid=new.game_uid for update;
 -- An automatically saved interruption may resume; explicit admin decisions remain frozen.
 if r.state='saved' and r.archive_reason='inactive' and r.kept_at is null and r.saved_by is null then
 update public.f7r_recordings set state='recording',saved_at=null,archive_reason=null where id=r.id;
 r.state:='recording';
 end if;
 if r.state<>'recording' then return new; end if;
 if finished and r.finished_at is null then
 update public.f7r_recordings set finished_at=new.received_at where id=r.id;
 end if;
 if r.sample_count=0 or new.received_at-r.last_seen>=interval '2 seconds' or sig is distinct from r.lap_signature then
 insert into public.f7r_recording_samples values(r.id,new.frame,new.received_at,new.data) on conflict do nothing;
 if found then update public.f7r_recordings set last_seen=new.received_at,final_data=new.data,lap_signature=sig,sample_count=sample_count+1 where id=r.id;end if;
 end if;
 return new;
end $$;
revoke all on function f7r_private.capture_recording() from public,anon,authenticated;
