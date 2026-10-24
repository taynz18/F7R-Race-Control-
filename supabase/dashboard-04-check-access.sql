-- Read-only configuration report. No live race data is inserted.
select tablename,rowsecurity from pg_tables where schemaname='public' and tablename like 'f7r_%';
select tablename,policyname,cmd,roles from pg_policies where schemaname='public' and tablename like 'f7r_%';
select tablename from pg_publication_tables where pubname='supabase_realtime' and tablename='f7r_snapshots';
select count(*) as approved_drivers from public.f7r_members where approved;
-- Anonymous clients have no table permissions. Authenticated drivers have no membership writes.
select has_table_privilege('anon','public.f7r_snapshots','SELECT') as anonymous_can_read,
  has_table_privilege('authenticated','public.f7r_members','UPDATE') as driver_can_promote_self;

