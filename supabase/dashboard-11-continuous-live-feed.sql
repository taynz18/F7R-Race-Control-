grant delete on public.f7r_snapshots to authenticated;
create policy f7r_publisher_replace_live_snapshot on public.f7r_snapshots for delete to authenticated using (
 exists(select 1 from public.f7r_sessions s join public.f7r_members m on m.user_id=s.publisher_id
 join public.f7r_receiver_controls c on c.session_id=s.id
 where s.id=f7r_snapshots.session_id and s.publisher_id=(select auth.uid())
 and s.status='live' and m.approved and m.role in ('publisher','admin') and c.enabled)
);