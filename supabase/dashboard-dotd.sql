create table public.f7r_dotd_polls (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  nominees text[] not null check (cardinality(nominees) between 2 and 10),
  created_at timestamptz not null default statement_timestamp(),
  ends_at timestamptz not null
);
create unique index f7r_dotd_race_title on public.f7r_dotd_polls (lower(btrim(title)));
create index f7r_dotd_latest on public.f7r_dotd_polls (created_at desc);

create table public.f7r_dotd_votes (
  poll_id uuid not null references public.f7r_dotd_polls(id) on delete cascade,
  voter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nominee smallint not null check (nominee between 1 and 10),
  primary key (poll_id, voter_id)
);

alter table public.f7r_dotd_polls enable row level security;
alter table public.f7r_dotd_votes enable row level security;
revoke all on public.f7r_dotd_polls, public.f7r_dotd_votes from public, anon, authenticated;
grant select on public.f7r_dotd_polls to anon, authenticated;
grant select on public.f7r_dotd_votes to authenticated;
grant insert (poll_id, nominee) on public.f7r_dotd_votes to authenticated;

create policy dotd_read_polls on public.f7r_dotd_polls for select to anon, authenticated using (true);
create policy dotd_read_own_vote on public.f7r_dotd_votes for select to authenticated
  using (voter_id = (select auth.uid()));
create policy dotd_cast_vote on public.f7r_dotd_votes for insert to authenticated
  with check (
    voter_id = (select auth.uid())
    and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false)
    and exists (
      select 1 from public.f7r_dotd_polls p
      where p.id = poll_id and p.ends_at > statement_timestamp()
        and nominee <= cardinality(p.nominees)
    )
  );

create function public.f7r_dotd_create(race_title text, candidates text[], minutes integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  poll public.f7r_dotd_polls%rowtype;
  names text[];
begin
  if auth.uid() is null or not exists (
    select 1 from public.flag_admins where user_id = auth.uid()
  ) then
    raise exception 'Race Control admin access is required.' using errcode = '42501';
  end if;
  if race_title is null or char_length(btrim(race_title)) not between 1 and 100
     or minutes is null or minutes not between 1 and 10080
     or candidates is null or array_ndims(candidates) is distinct from 1
     or cardinality(candidates) not between 2 and 10 then
    raise exception 'Enter a race, 2–10 drivers and a timer of 1–10080 minutes.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(candidates) as n where n is null or char_length(btrim(n)) not between 1 and 64)
     or (select count(distinct lower(btrim(n))) from unnest(candidates) as n) <> cardinality(candidates) then
    raise exception 'Each nominee must have a different name of 1–64 characters.' using errcode = '22023';
  end if;
  select array_agg(btrim(n) order by ord) into names from unnest(candidates) with ordinality as c(n,ord);
  insert into public.f7r_dotd_polls(title,nominees,ends_at)
  values (btrim(race_title),names,statement_timestamp()+make_interval(mins => minutes))
  returning * into poll;
  return to_jsonb(poll);
end;
$$;

create function public.f7r_dotd_results(poll uuid)
returns table (nominee integer, votes bigint)
language sql stable security definer set search_path = '' as $$
  select n.i, count(v.nominee)
  from public.f7r_dotd_polls p
  cross join lateral generate_subscripts(p.nominees,1) as n(i)
  left join public.f7r_dotd_votes v on v.poll_id = p.id and v.nominee = n.i
  where p.id = poll and p.ends_at <= statement_timestamp()
  group by n.i order by n.i;
$$;
revoke all on function public.f7r_dotd_create(text,text[],integer) from public, anon, authenticated;
revoke all on function public.f7r_dotd_results(uuid) from public, anon, authenticated;
grant execute on function public.f7r_dotd_create(text,text[],integer) to authenticated;
grant execute on function public.f7r_dotd_results(uuid) to anon, authenticated;
