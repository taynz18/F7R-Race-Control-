create or replace function public.f7r_steward_action(p_id uuid,p_actor text,p_leader boolean,p_action text,p_value jsonb,p_revision integer default null)
returns public.f7r_steward_cases language plpgsql security invoker set search_path=public,pg_temp as $$
declare original public.f7r_steward_cases; secondary boolean; c public.f7r_steward_cases; winners text[]; top_count integer; choice text; max_seconds integer;
begin
 select * into c from f7r_steward_cases where id=p_id for update;
 if not found then raise exception 'Case not found'; end if;
 if p_actor in (c.reporter_id,c.accused_id) and p_action not in ('defence','defence_draft','finish_report','delete_ticket_claim','delete_ticket_complete') then raise exception 'Involved drivers cannot review their own case'; end if;
 if p_revision is not null and c.revision<>p_revision then raise exception 'Case changed. Refresh and review the latest votes before continuing'; end if;
 original=c;
 if coalesce(p_value->>'target','accused') not in ('accused','reporter') then raise exception 'Invalid verdict target'; end if;
 secondary=coalesce(p_value->>'target','accused')='reporter';
 if secondary then
   if c.data->>'kind'='penalty_appeal' or p_action not in ('start_reporter_vote','vote','close_vote','tie_break','claim_notification','notification_result') then raise exception 'Invalid reporting-driver verdict action'; end if;
   if p_action='start_reporter_vote' then
     if c.data ? 'reporter_verdict' then raise exception 'The reporting-driver vote already exists'; end if;
     if c.status not in ('discussion','voting','tied','closed') or not coalesce((c.data->'defence'->>'locked')::boolean,false) then raise exception 'Both statements must be submitted first'; end if;
     if length(trim(coalesce(p_value->>'reason','')))<10 or length(p_value->>'reason')>1500 then raise exception 'Explain why the reporting driver needs a separate vote'; end if;
     c.status='discussion';c.penalty_set=null;c.votes='{}';c.notifications='{}';c.outcome=null;c.explanation=null;c.decided_by=null;
     c.comments=c.comments||jsonb_build_array(jsonb_build_object('author',p_actor,'text','Separate vote for the reporting driver: '||(p_value->>'reason'),'at',now()));
     p_action='start_vote';
   else
     if not c.data ? 'reporter_verdict' then raise exception 'Start the reporting-driver vote first'; end if;
     c.status=c.data->'reporter_verdict'->>'status';c.penalty_set=c.data->'reporter_verdict'->>'penalty_set';
     c.votes=coalesce(c.data->'reporter_verdict'->'votes','{}');c.notifications=coalesce(c.data->'reporter_verdict'->'notifications','{}');
     c.outcome=c.data->'reporter_verdict'->>'outcome';c.explanation=c.data->'reporter_verdict'->>'explanation';c.decided_by=c.data->'reporter_verdict'->>'decided_by';
   end if;
 elsif p_action='start_reporter_vote' then raise exception 'Select the reporting driver'; end if;
 if p_action='delete_ticket_claim' then
   if c.outcome is not null or c.data->'reporter_verdict'->>'outcome' is not null then raise exception 'A final verdict exists; ticket deletion is only for cases needing no investigation'; end if;
   if length(trim(coalesce(p_value->>'reason','')))<1 or length(p_value->>'reason')>500 then raise exception 'Add a deletion reason, up to 500 characters'; end if;
   if c.data->'deletion'->>'status'='deleted' then raise exception 'Ticket already deleted'; end if;
   if c.data->'deletion' is null then
     c.data=jsonb_set(c.data,'{deletion}',jsonb_build_object('status','deleting','actor',p_actor,'reason',trim(p_value->>'reason'),'at',now(),'channels',(select coalesce(jsonb_agg(distinct id),'[]') from (values(c.data->>'report_ticket'),(c.data->>'defence_ticket'),(c.review_channel_id)) as channels(id) where id is not null)));
   end if;
   c.status='closed';
 elsif p_action='delete_ticket_complete' then
   if c.data->'deletion'->>'status' is distinct from 'deleting' then raise exception 'Deletion was not started'; end if;
   if p_value->'channels' is distinct from c.data->'deletion'->'channels' then raise exception 'Not all case channels were removed'; end if;
   c.data=jsonb_build_object('kind',c.data->>'kind','race',c.data->>'race','lap',c.data->>'lap','report',jsonb_build_object('statement','Ticket deleted without a verdict.','links','[]'::jsonb,'locked',true),'deletion',(c.data->'deletion')||jsonb_build_object('status','deleted','completed_at',now()));
   c.comments='[]';c.votes='{}';c.notifications='{}';c.review_channel_id=null;c.status='closed';
 elsif c.data ? 'deletion' then raise exception 'This ticket is being deleted or has been deleted';
 elsif p_action='finish_report' then
   if p_actor<>c.reporter_id or c.status<>'awaiting_report_evidence' then raise exception 'Report already submitted or unavailable'; end if;
   c.data=jsonb_set(c.data,'{report}',(c.data->'report')||p_value||'{"locked":true}'::jsonb);
   c.status=case when c.data->>'kind'='penalty_appeal' then 'discussion' else 'awaiting_defence' end;
 elsif p_action='defence_draft' then
   if p_actor<>c.accused_id or c.status<>'awaiting_defence' then raise exception 'Defence already submitted or unavailable'; end if;
   c.data=jsonb_set(c.data,'{defence}',p_value); c.status='awaiting_defence_evidence';
 elsif p_action='defence' then
   if p_actor<>c.accused_id or c.status not in ('awaiting_defence','awaiting_defence_evidence') then raise exception 'Defence already submitted or unavailable'; end if;
   c.data=jsonb_set(c.data,'{defence}',coalesce(c.data->'defence','{}')||p_value||'{"locked":true}'::jsonb); c.status='discussion';
 elsif p_action='comment' then
   if c.status='closed' and coalesce(c.data->'reporter_verdict'->>'status','closed')='closed' then raise exception 'Case is closed'; end if;
   if jsonb_array_length(c.comments)>=200 then raise exception 'Discussion limit reached'; end if;
   c.comments=c.comments||jsonb_build_array(jsonb_build_object('author',p_actor,'text',p_value->>'text','at',now()));
 elsif p_action='start_vote' then
   if c.data->>'kind'='penalty_appeal' then raise exception 'In-game appeals are decided only by a Head Steward or CEO'; end if;
   if c.status<>'discussion' or coalesce(p_value->>'set','') not in ('F1','Endurance') then raise exception 'Submit the defence before starting a verdict vote'; end if;
   c.penalty_set=p_value->>'set'; c.status='voting';
 elsif p_action='vote' then
   if c.data->>'kind'='penalty_appeal' then raise exception 'In-game appeals do not use a steward penalty vote'; end if;
   if c.status<>'voting' then raise exception 'Voting is not open'; end if;
   choice=p_value->>'penalty'; max_seconds=case when c.penalty_set='F1' then 20 else 50 end;
   if choice is null then raise exception 'Choose a penalty'; end if;
   if choice not in ('No further action','Warning','Qualifying ban','Race ban','Season ban') then
     if choice !~ '^[0-9]+ seconds$' then raise exception 'Invalid penalty'; end if;
     if split_part(choice,' ',1)::integer not between 5 and max_seconds or split_part(choice,' ',1)::integer%5<>0 then raise exception 'Invalid time penalty for this rule set'; end if;
   end if;
   c.votes=jsonb_set(c.votes,array[p_actor],jsonb_build_object('penalty',choice,'reason',p_value->>'reason','at',now()));
 elsif p_action='appeal_decision' then
   if not p_leader or c.data->>'kind' is distinct from 'penalty_appeal' or c.status<>'discussion' then raise exception 'Only a Head Steward or CEO can decide a submitted in-game appeal'; end if;
   if coalesce(p_value->>'penalty','') not in ('In-game penalty kept','In-game penalty removed') then raise exception 'Choose Keep penalty or Remove penalty'; end if;
   if length(trim(coalesce(p_value->>'explanation','')))<20 then raise exception 'Add an approved explanation of at least 20 characters'; end if;
   c.status='closed'; c.outcome=p_value->>'penalty';c.explanation=p_value->>'explanation';c.decided_by=p_actor;
 elsif p_action in ('close_vote','tie_break') then
   if c.data->>'kind'='penalty_appeal' then raise exception 'Use the in-game appeal decision'; end if;
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
 if secondary then
   c.data=jsonb_set(c.data,'{reporter_verdict}',jsonb_build_object('status',c.status,'penalty_set',c.penalty_set,'votes',c.votes,'notifications',c.notifications,'outcome',c.outcome,'explanation',c.explanation,'decided_by',c.decided_by,'reason',coalesce(original.data->'reporter_verdict'->>'reason',p_value->>'reason')));
   c.status=original.status;c.penalty_set=original.penalty_set;c.votes=original.votes;c.notifications=original.notifications;c.outcome=original.outcome;c.explanation=original.explanation;c.decided_by=original.decided_by;
 end if;
 update f7r_steward_cases set data=c.data,status=c.status,penalty_set=c.penalty_set,votes=c.votes,comments=c.comments,
 outcome=c.outcome,explanation=c.explanation,decided_by=c.decided_by,notifications=c.notifications,
 review_channel_id=c.review_channel_id,revision=c.revision+1,updated_at=now() where id=c.id returning * into c;
 return c;
end $$;
revoke all on function public.f7r_steward_action(uuid,text,boolean,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.f7r_steward_action(uuid,text,boolean,text,jsonb,integer) to service_role;


