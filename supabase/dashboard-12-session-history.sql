
create schema if not exists f7r_private;
revoke all on schema f7r_private from public, anon, authenticated;
create table public.f7r_recordings (
 id uuid primary key default gen_random_uuid(),
 source_id uuid not null references public.f7r_sessions(id),
 game_uid text not null,
 title text not null default 'F7R session' check (length(title) between 1 and 100),
 state text not null default 'recording' check (state in ('recording','saved','discarded')),
 started_at timestamptz not null,
 last_seen timestamptz not null,
 saved_at timestamptz,
 saved_by uuid references auth.users(id),
 sample_count integer not null default 0,
 final_data jsonb not null,
 lap_signature jsonb,
 unique(source_id,game_uid)
);
create index f7r_recordings_history on public.f7r_recordings(state,started_at desc,id);
create index f7r_recordings_saved_by on public.f7r_recordings(saved_by);
create table public.f7r_recording_samples (
 recording_id uuid not null references public.f7r_recordings(id) on delete cascade,
 frame bigint not null,
 captured_at timestamptz not null,
 data jsonb not null,
 primary key(recording_id,frame)
);
alter table public.f7r_recordings enable row level security;
alter table public.f7r_recording_samples enable row level security;
revoke all on public.f7r_recordings,public.f7r_recording_samples from anon,authenticated;
grant select on public.f7r_recordings,public.f7r_recording_samples to authenticated;
grant update(title,state,saved_at,saved_by) on public.f7r_recordings to authenticated;
create policy f7r_recordings_read on public.f7r_recordings for select to authenticated using (
 (select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
 and (state='saved' or exists(select 1 from public.flag_admins where user_id=(select auth.uid())))
);
create policy f7r_recordings_admin_update on public.f7r_recordings for update to authenticated
using(exists(select 1 from public.flag_admins where user_id=(select auth.uid())))
with check(exists(select 1 from public.flag_admins where user_id=(select auth.uid())));
create policy f7r_recording_samples_read on public.f7r_recording_samples for select to authenticated using (
 exists(select 1 from public.f7r_recordings r where r.id=recording_id)
);
create function f7r_private.capture_recording() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.f7r_recordings; sig jsonb;
begin
 -- Only accepted publisher snapshots reach this AFTER trigger. Direct archive writes are revoked.
 if auth.uid() is null or not exists(
 select 1 from public.f7r_sessions s join public.f7r_members m on m.user_id=s.publisher_id
 join public.f7r_receiver_controls c on c.session_id=s.id
 where s.id=new.session_id and s.publisher_id=auth.uid() and s.status='live'
 and m.approved and m.role in ('publisher','admin') and c.enabled) then
 return new;
 end if;
 select jsonb_agg(jsonb_build_array(d->'slot',d->'lap',d->'result_status') order by (d->>'slot')::int)
 into sig from jsonb_array_elements(new.data->'drivers') d;
 insert into public.f7r_recordings(source_id,game_uid,started_at,last_seen,final_data)
 values(new.session_id,new.game_uid,new.received_at,new.received_at,new.data)
 on conflict(source_id,game_uid) do nothing;
 select * into r from public.f7r_recordings where source_id=new.session_id and game_uid=new.game_uid for update;
 if r.state<>'recording' then return new; end if;
 if r.sample_count=0 or new.received_at-r.last_seen>=interval '2 seconds' or sig is distinct from r.lap_signature then
 insert into public.f7r_recording_samples values(r.id,new.frame,new.received_at,new.data) on conflict do nothing;
 if found then
 update public.f7r_recordings set last_seen=new.received_at,final_data=new.data,lap_signature=sig,sample_count=sample_count+1 where id=r.id;
 end if;
 end if;
 return new;
end $$;
revoke all on function f7r_private.capture_recording() from public,anon,authenticated;
create trigger f7r_capture_history after insert or update on public.f7r_snapshots for each row execute function f7r_private.capture_recording();

create function public.f7r_finish_recording(recording uuid, session_title text, discard boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.flag_admins where user_id=auth.uid()) then
 raise exception 'Only race admins can save or discard recordings' using errcode='42501';
 end if;
 if not discard and (session_title is null or length(btrim(session_title)) not between 1 and 100) then
 raise exception 'Enter a session name between 1 and 100 characters' using errcode='22023';
 end if;
 update public.f7r_recordings set state=case when discard then 'discarded' else 'saved' end,
 title=case when discard then title else btrim(session_title) end,saved_at=clock_timestamp(),saved_by=auth.uid()
 where id=recording and state='recording';
 if not found then raise exception 'Recording already saved, discarded or unavailable'; end if;
end $$;
revoke all on function public.f7r_finish_recording(uuid,text,boolean) from public,anon;
grant execute on function public.f7r_finish_recording(uuid,text,boolean) to authenticated;
