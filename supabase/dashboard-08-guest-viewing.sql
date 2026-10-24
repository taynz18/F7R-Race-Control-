begin;
grant select on public.f7r_sessions,public.f7r_snapshots to anon;
create policy f7r_guest_live_sessions on public.f7r_sessions for select to anon
using (status='live');
create policy f7r_guest_live_snapshots on public.f7r_snapshots for select to anon
using (exists(select 1 from public.f7r_sessions s where s.id=session_id and s.status='live'));
commit;
