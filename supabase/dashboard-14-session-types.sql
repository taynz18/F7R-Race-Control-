
alter table public.f7r_recordings add column session_kind text check(session_kind in ('practice','qualifying','race','time-trial'));
grant update(session_kind) on public.f7r_recordings to authenticated;
create function public.f7r_label_recording(recording uuid,session_category text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.flag_admins where user_id=auth.uid()) then
 raise exception 'Only race admins can label sessions' using errcode='42501';end if;
 if session_category is not null and session_category not in ('practice','qualifying','race','time-trial') then
 raise exception 'Invalid session type' using errcode='22023';end if;
 update public.f7r_recordings set session_kind=session_category where id=recording;
 if not found then raise exception 'Recording unavailable';end if;
end $$;
revoke all on function public.f7r_label_recording(uuid,text) from public,anon;
grant execute on function public.f7r_label_recording(uuid,text) to authenticated;
