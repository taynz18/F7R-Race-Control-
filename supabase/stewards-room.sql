-- Private case storage: access is through Discord-verified Edge Functions only.
create table public.f7r_steward_routes (
 guild_id text not null, id text not null, config jsonb not null,
 primary key(guild_id,id)
);
create table public.f7r_steward_cases (
 id uuid primary key default gen_random_uuid(), number bigint generated always as identity(start with 1001) unique,
 guild_id text not null, route_id text not null, interaction_id text not null unique,
 reporter_id text not null, accused_id text not null, data jsonb not null,
 status text not null default 'awaiting_defence' check(status in ('awaiting_defence','discussion','voting','tied','closed')),
 penalty_set text check(penalty_set in ('F1','Endurance')), votes jsonb not null default '{}',
 comments jsonb not null default '[]', outcome text, explanation text, decided_by text,
 review_channel_id text, notifications jsonb not null default '{}', revision integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(guild_id,route_id) references public.f7r_steward_routes(guild_id,id),
 check(reporter_id<>accused_id)
);
create index on public.f7r_steward_cases(guild_id,created_at desc);
create table public.f7r_steward_sessions (
 token_hash text primary key, guild_id text not null, driver_id text not null,
 expires_at timestamptz not null default now()+interval '4 hours'
);
alter table public.f7r_steward_routes enable row level security;
alter table public.f7r_steward_cases enable row level security;
alter table public.f7r_steward_sessions enable row level security;
revoke all on public.f7r_steward_routes,public.f7r_steward_cases,public.f7r_steward_sessions from anon,authenticated;
grant all on public.f7r_steward_routes,public.f7r_steward_cases,public.f7r_steward_sessions to service_role;
grant usage,select on sequence public.f7r_steward_cases_number_seq to service_role;

create function public.f7r_steward_action(p_id uuid,p_actor text,p_leader boolean,p_action text,p_value jsonb,p_revision integer default null)
returns public.f7r_steward_cases language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.f7r_steward_cases; winners text[]; top_count integer; choice text; max_seconds integer;
begin
 select * into c from f7r_steward_cases where id=p_id for update;
 if not found then raise exception 'Case not found'; end if;
 if p_actor in (c.reporter_id,c.accused_id) and p_action<>'defence' then raise exception 'Involved drivers cannot review their own case'; end if;
 if p_revision is not null and c.revision<>p_revision then raise exception 'Case changed. Refresh and review the latest votes before continuing'; end if;
 if p_action='defence' then
   if p_actor<>c.accused_id or c.status<>'awaiting_defence' then raise exception 'Defence already submitted or unavailable'; end if;
   c.data=jsonb_set(c.data,'{defence}',p_value); c.status='discussion';
 elsif p_action='comment' then
   if c.status='closed' then raise exception 'Case is closed'; end if;
   if jsonb_array_length(c.comments)>=200 then raise exception 'Discussion limit reached'; end if;
   c.comments=c.comments||jsonb_build_array(jsonb_build_object('author',p_actor,'text',p_value->>'text','at',now()));
 elsif p_action='start_vote' then
   if c.status<>'discussion' or coalesce(p_value->>'set','') not in ('F1','Endurance') then raise exception 'Submit the defence before starting a verdict vote'; end if;
   c.penalty_set=p_value->>'set'; c.status='voting';
 elsif p_action='vote' then
   if c.status<>'voting' then raise exception 'Voting is not open'; end if;
   choice=p_value->>'penalty'; max_seconds=case when c.penalty_set='F1' then 20 else 50 end;
   if choice is null then raise exception 'Choose a penalty'; end if;
   if choice not in ('No further action','Warning','Qualifying ban','Race ban','Season ban') then
     if choice !~ '^[0-9]+ seconds$' then raise exception 'Invalid penalty'; end if;
     if split_part(choice,' ',1)::integer not between 5 and max_seconds or split_part(choice,' ',1)::integer%5<>0 then raise exception 'Invalid time penalty for this rule set'; end if;
   end if;
   c.votes=jsonb_set(c.votes,array[p_actor],jsonb_build_object('penalty',choice,'reason',p_value->>'reason','at',now()));
 elsif p_action in ('close_vote','tie_break') then
   if not p_leader then raise exception 'Only a Head Steward or CEO can close voting or decide a tie'; end if;
   if c.status not in ('voting','tied') then raise exception 'Voting is not open'; end if;
   select max(n) into top_count from (select count(*) n from jsonb_each(c.votes) v group by v.value->>'penalty') t;
   if top_count is null then raise exception 'At least one steward must vote'; end if;
   select array_agg(penalty order by penalty) into winners from (select v.value->>'penalty' penalty,count(*) n from jsonb_each(c.votes) v group by 1) t where n=top_count;
   if cardinality(winners)>1 and p_action='close_vote' then c.status='tied';
   else
     if cardinality(winners)>1 then
       choice=p_value->>'penalty';
       if choice is null or not choice=any(winners) then raise exception 'Choose one of the tied outcomes'; end if;
     else choice=winners[1]; end if;
     if length(trim(coalesce(p_value->>'explanation','')))<20 then raise exception 'Add an approved explanation of at least 20 characters'; end if;
     c.status='closed'; c.outcome=choice; c.explanation=p_value->>'explanation'; c.decided_by=p_actor;
   end if;
 elsif p_action='claim_notification' then
   if c.status<>'closed' or p_value->>'recipient' not in ('reporter','accused') then raise exception 'Invalid notification'; end if;
   if c.notifications ? (p_value->>'recipient') then raise exception 'Notification already attempted; check delivery status'; end if;
   c.notifications=jsonb_set(c.notifications,array[p_value->>'recipient'],'"sending"');
 elsif p_action='notification_result' then
   if c.notifications->>(p_value->>'recipient')<>'sending' then raise exception 'Notification not claimed'; end if;
   c.notifications=jsonb_set(c.notifications,array[p_value->>'recipient'],to_jsonb(p_value->>'result'));
 else raise exception 'Invalid action'; end if;
 update f7r_steward_cases set data=c.data,status=c.status,penalty_set=c.penalty_set,votes=c.votes,comments=c.comments,
 outcome=c.outcome,explanation=c.explanation,decided_by=c.decided_by,notifications=c.notifications,
 revision=c.revision+1,updated_at=now() where id=c.id returning * into c;
 return c;
end $$;
revoke all on function public.f7r_steward_action(uuid,text,boolean,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.f7r_steward_action(uuid,text,boolean,text,jsonb,integer) to service_role;
select cron.schedule('f7r-expire-steward-sessions','23 * * * *',$job$delete from public.f7r_steward_sessions where expires_at<now();$job$);
