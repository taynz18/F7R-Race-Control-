begin;
drop policy if exists f7r_members_read_sessions on public.f7r_sessions;
create policy f7r_members_read_sessions on public.f7r_sessions for select to authenticated
using ((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
drop policy if exists f7r_members_read_snapshots on public.f7r_snapshots;
create policy f7r_members_read_snapshots on public.f7r_snapshots for select to authenticated
using ((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
-- Roles still control publishing and race administration. New viewers need no membership row.
insert into public.f7r_members(user_id,display_name,role,approved)
select u.id,'F7R Receiver',case when exists(select 1 from public.flag_admins a where a.user_id=u.id) then 'admin' else 'publisher' end,true
from auth.users u where lower(u.email)='formula7racing@gmail.com'
on conflict(user_id) do update set approved=true,
role=case when f7r_members.role='admin' then 'admin' else excluded.role end;
insert into public.f7r_sessions(title,publisher_id,game_format,status)
select 'F7R Live Race',u.id,2026,'live' from auth.users u
where lower(u.email)='formula7racing@gmail.com'
and not exists(select 1 from public.f7r_sessions s where s.publisher_id=u.id and s.status='live');
commit;
