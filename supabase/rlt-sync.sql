create schema if not exists f7r_private;
revoke all on schema f7r_private from public,anon,authenticated;
create extension if not exists pg_net with schema extensions;
create table f7r_private.rlt_state (
 id boolean primary key default true check(id), cursor_id integer,
 lease uuid, lease_until timestamptz, next_allowed timestamptz not null default now(),
 last_checked timestamptz,last_success timestamptz,last_error text
);
insert into f7r_private.rlt_state(id) values(true);
create table f7r_private.rlt_queue (
 source_id integer primary key,requested_at timestamptz not null default now(),
 retry_at timestamptz not null default now(), attempts integer not null default 0
);
alter table f7r_private.rlt_state enable row level security;
alter table f7r_private.rlt_queue enable row level security;
revoke all on all tables in schema f7r_private from public,anon,authenticated;

create function public.f7r_rlt_sync(action text, claim uuid default null, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare st f7r_private.rlt_state; token uuid; sid integer; item jsonb; result jsonb;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Service only'; end if;
 select * into st from f7r_private.rlt_state where id=true for update;
 if action='claim' then
  if st.next_allowed>now() or st.lease_until>now() then return null;end if;
  token:=gen_random_uuid();
  update f7r_private.rlt_state set lease=token,lease_until=now()+interval '3 minutes' where id=true;
  return jsonb_build_object('claim',token,'cursor',st.cursor_id,'since',(select coalesce(min(imported_at),now()-interval '1 day')-interval '5 minutes' from public.f7r_league_archive),'key',(select decrypted_secret from vault.decrypted_secrets where name='f7r_rlt_api_key'));
 end if;
 if claim is null or st.lease is distinct from claim or st.lease_until<now() then raise exception 'Lease expired';end if;
 if action='poll' then
  delete from f7r_private.rlt_queue q where not exists(select from jsonb_array_elements(payload->'seasons') s where (s->>'seasonId')::integer=q.source_id);
  for item in select value from jsonb_array_elements(payload->'seasons') loop
   sid:=(item->>'seasonId')::integer;
   if not exists(select from public.f7r_league_archive where source_id=sid)
     or exists(select from public.f7r_league_archive where source_id=sid and imported_at<now()-case when archived then interval '7 days' else interval '6 hours' end)
     or (payload->'dirty') @> to_jsonb(array[sid]) then
    insert into f7r_private.rlt_queue(source_id) values(sid) on conflict do nothing;
   end if;
  end loop;
  update f7r_private.rlt_state set cursor_id=(payload->>'cursor')::integer,last_checked=now() where id=true;
  return '{}'::jsonb;
 elsif action='next' then
  select source_id into sid from f7r_private.rlt_queue where retry_at<=now() order by requested_at,source_id limit 1;
  return jsonb_build_object('source_id',sid);
 elsif action='save' then
  sid:=(payload->>'source_id')::integer;
  if not exists(select from f7r_private.rlt_queue where source_id=sid) then raise exception 'Season not queued';end if;
  if length(payload->>'payload_gzip_base64')>12000000 or length(payload->>'payload_gzip_base64')<20 then raise exception 'Invalid payload';end if;
  insert into public.f7r_league_archive(source_id,name,archived,event_count,session_count,imported_at,payload_gzip_base64)
  values(sid,payload->>'name',(payload->>'archived')::boolean,(payload->>'event_count')::integer,(payload->>'session_count')::integer,(payload->>'imported_at')::timestamptz,payload->>'payload_gzip_base64')
  on conflict(source_id) do update set name=excluded.name,archived=excluded.archived,event_count=excluded.event_count,session_count=excluded.session_count,imported_at=excluded.imported_at,payload_gzip_base64=excluded.payload_gzip_base64;
  delete from f7r_private.rlt_queue where source_id=sid;
  update f7r_private.rlt_state set last_success=now(),last_error=null where id=true;
  return '{}'::jsonb;
 elsif action='fail' then
  update f7r_private.rlt_queue set attempts=attempts+1,retry_at=now()+interval '5 minutes' where source_id=(payload->>'source_id')::integer;
  update f7r_private.rlt_state set last_error=left(payload->>'error',150),next_allowed=now()+interval '2 minutes' where id=true;
  return '{}'::jsonb;
 elsif action='release' then
  update f7r_private.rlt_state set lease=null,lease_until=null where id=true;
  return '{}'::jsonb;
 end if;
 raise exception 'Invalid action';
end $$;
revoke all on function public.f7r_rlt_sync(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.f7r_rlt_sync(text,uuid,jsonb) to service_role;

create function public.f7r_rlt_sync_status() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required';end if;
 return (select jsonb_build_object('last_checked',s.last_checked,'last_success',s.last_success,'last_error',s.last_error,'pending',(select count(*) from f7r_private.rlt_queue)) from f7r_private.rlt_state s where id=true);
end $$;
revoke all on function public.f7r_rlt_sync_status() from public,anon;
grant execute on function public.f7r_rlt_sync_status() to authenticated;

