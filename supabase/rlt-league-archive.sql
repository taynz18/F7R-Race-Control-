create table public.f7r_league_archive (
 source_id integer primary key,
 name text not null,
 archived boolean not null,
 event_count integer not null,
 session_count integer not null,
 imported_at timestamptz not null,
 payload_gzip_base64 text not null
);
alter table public.f7r_league_archive enable row level security;
revoke all on public.f7r_league_archive from anon, authenticated;
grant select on public.f7r_league_archive to authenticated;
create policy "Signed in drivers can read league archive" on public.f7r_league_archive for select to authenticated using (not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
