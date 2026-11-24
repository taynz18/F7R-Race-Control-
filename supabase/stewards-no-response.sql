CREATE OR REPLACE FUNCTION public.f7r_steward_action(p_id uuid, p_actor text, p_leader boolean, p_action text, p_value jsonb, p_revision integer DEFAULT NULL::integer)
 RETURNS f7r_steward_cases
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare original public.f7r_steward_cases; secondary boolean; third_target boolean; verdict_key text; c public.f7r_steward_cases; winners text[]; top_count integer; choice text; max_seconds integer;
begin
 select * into c from f7r_steward_cases where id=p_id for update;
 if not found then raise exception 'Case not found'; end if;
 if p_actor=c.data->'third'->>'driver_id' and p_action not in ('third_draft','third_submit') then raise exception 'Involved drivers cannot review their own case'; end if;
 if p_actor in (c.reporter_id,c.accused_id) and p_action not in ('defence','defence_draft','finish_report','no_defence','delete_ticket_claim','delete_ticket_complete') then raise exception 'Involved drivers cannot review their own case'; end if;
 if p_revision is not null and c.revision<>p_revision then raise exception 'Case changed. Refresh and review the latest votes before continuing'; end if;
 if p_action in ('add_third','third_ticket','third_draft','third_submit') then
   if c.data ? 'deletion' or c.data->>'kind'='penalty_appeal' then raise exception 'This case cannot accept another driver'; end if;
   if p_action='add_third' then
     if c.data ? 'third' then raise exception 'This case already has a third driver'; end if;
     if c.status not in ('discussion','voting','tied') or c.outcome is not null or c.data->'reporter_verdict'->>'outcome' is not null or not coalesce((c.data->'report'->>'locked')::boolean,false) or not coalesce((c.data->'defence'->>'locked')::boolean,false) then raise exception 'Add a driver after both statements are submitted and before any verdict is finalised'; end if;
     if coalesce(p_value->>'driver_id','') !~ '^[0-9]{17,20}$' or p_value->>'driver_id' in (c.reporter_id,c.accused_id,p_actor) or coalesce(p_value->>'role','') not in ('involved','witness') then raise exception 'Choose another driver and their role'; end if;
     c.data=jsonb_set(c.data,'{third}',jsonb_build_object('driver_id',p_value->>'driver_id','name',left(p_value->>'name',100),'role',p_value->>'role','added_by',p_actor,'added_at',now(),'locked',false,'links','[]'::jsonb));
     c.votes=c.votes-(p_value->>'driver_id');
     if c.data->'reporter_verdict'->'votes' is not null then c.data=jsonb_set(c.data,'{reporter_verdict,votes}',(c.data->'reporter_verdict'->'votes')-(p_value->>'driver_id')); end if;
     if p_value->>'role'='involved' then c.data=jsonb_set(c.data,'{third_verdict}',jsonb_build_object('status','discussion','votes','{}'::jsonb,'notifications','{}'::jsonb)); end if;
   elsif p_action='third_ticket' then
     if c.data->'third' is null or p_actor is distinct from c.data->'third'->>'added_by' or coalesce(p_value->>'channel_id','') !~ '^[0-9]{17,20}$' then raise exception 'Invalid third-driver ticket'; end if;
     if c.data ? 'third_ticket' and c.data->>'third_ticket'<>p_value->>'channel_id' then raise exception 'Third-driver ticket already exists'; end if;
     c.data=jsonb_set(c.data,'{third_ticket}',to_jsonb(p_value->>'channel_id'));
   else
     if p_actor is distinct from c.data->'third'->>'driver_id' or coalesce((c.data->'third'->>'locked')::boolean,true) then raise exception 'This is not your open statement'; end if;
     if p_action='third_draft' then
       if length(trim(coalesce(p_value->>'statement','')))<1 or length(p_value->>'statement')>1500 then raise exception 'Enter a statement up to 1500 characters'; end if;
       c.data=jsonb_set(c.data,'{third,statement}',to_jsonb(trim(p_value->>'statement')));
     else
       if length(trim(coalesce(c.data->'third'->>'statement','')))<1 then raise exception 'Add your statement first'; end if;
       c.data=jsonb_set(c.data,'{third}',(c.data->'third')||jsonb_build_object('links',coalesce(p_value->'links','[]'),'external_links',coalesce(p_value->'external_links','[]'),'clips',coalesce(p_value->'clips','[]'),'no_video',coalesce(p_value->'no_video','true'),'locked',true));
     end if;
   end if;
   update f7r_steward_cases set data=c.data,votes=c.votes,revision=c.revision+1,updated_at=now() where id=c.id returning * into c;
   return c;
 end if;
 original=c;

 if coalesce(p_value->>'target','accused') not in ('accused','reporter','third') then raise exception 'Invalid verdict target'; end if;
 third_target=coalesce(p_value->>'target','accused')='third';
 verdict_key=case when third_target then 'third_verdict' else 'reporter_verdict' end;
 secondary=coalesce(p_value->>'target','accused') in ('reporter','third');
 if secondary then
   if c.data->>'kind'='penalty_appeal' or p_action not in ('start_reporter_vote','start_vote','vote','close_vote','tie_break','claim_notification','notification_result') then raise exception 'Invalid reporting-driver verdict action'; end if;
   if third_target and (c.data->'third'->>'role' is distinct from 'involved' or not coalesce((c.data->'third'->>'locked')::boolean,false)) then raise exception 'The involved third driver must submit their statement first'; end if;
   if p_action='start_reporter_vote' then
     if third_target then raise exception 'Choose third-driver voting'; end if;
     if c.data ? verdict_key then raise exception 'The reporting-driver vote already exists'; end if;
     if c.status='closed' then raise exception 'The final ticket is locked. Open both driver votes before finalising'; end if;
     if c.status not in ('discussion','voting','tied','closed') or not coalesce((c.data->'defence'->>'locked')::boolean,false) then raise exception 'Both statements must be submitted first'; end if;
     if length(trim(coalesce(p_value->>'reason','')))<10 or length(p_value->>'reason')>1500 then raise exception 'Explain why the reporting driver needs a separate vote'; end if;
     c.status='discussion';c.penalty_set=null;c.votes='{}';c.notifications='{}';c.outcome=null;c.explanation=null;c.decided_by=null;
     c.comments=c.comments||jsonb_build_array(jsonb_build_object('author',p_actor,'text','Separate vote for the reporting driver: '||(p_value->>'reason'),'at',now()));
     p_action='start_vote';
   else
     if not c.data ? verdict_key then raise exception 'Start the reporting-driver vote first'; end if;
     c.status=c.data->verdict_key->>'status';c.penalty_set=c.data->verdict_key->>'penalty_set';
     c.votes=coalesce(c.data->verdict_key->'votes','{}');c.notifications=coalesce(c.data->verdict_key->'notifications','{}');
     c.outcome=c.data->verdict_key->>'outcome';c.explanation=c.data->verdict_key->>'explanation';c.decided_by=c.data->verdict_key->>'decided_by';
   end if;
 elsif p_action='start_reporter_vote' then raise exception 'Select the reporting driver'; end if;
 if p_action='delete_ticket_claim' and c.data ? 'third' and (not coalesce((c.data->'third'->>'locked')::boolean,false) or (c.data->'third'->>'role'='involved' and c.data->'third_verdict'->>'status' is distinct from 'closed')) then raise exception 'Complete the third-driver statement and verdict before deleting this case'; end if;
 if p_action='record_ticket_outcome' then
   if not p_leader or coalesce(p_value->>'verdict_target','accused') not in ('accused','reporter','third') or (coalesce(p_value->>'verdict_target','accused')='accused' and c.status<>'closed') or (p_value->>'verdict_target'='reporter' and coalesce(c.data->'reporter_verdict'->>'status','')<>'closed') or (p_value->>'verdict_target'='third' and coalesce(c.data->'third_verdict'->>'status','')<>'closed') then raise exception 'Final verdict required'; end if;
   if coalesce(p_value->>'message_id','') !~ '^[0-9]{17,20}$' then raise exception 'Invalid outcome message'; end if;
   c.data=jsonb_set(c.data,'{outcome_messages}',coalesce(c.data->'outcome_messages','{}')||jsonb_build_object(coalesce(p_value->>'verdict_target','accused'),p_value->>'message_id'));
 elsif p_action='delete_ticket_claim' then
   if (c.outcome is not null or c.data->'reporter_verdict'->>'outcome' is not null or c.data->'third_verdict'->>'outcome' is not null) and (not p_leader or c.status<>'closed' or coalesce(c.data->'reporter_verdict'->>'status','closed')<>'closed') then raise exception 'Only a Head Steward or CEO can delete a completed ticket after all verdicts are final'; end if;
   if length(trim(coalesce(p_value->>'reason','')))<1 or length(p_value->>'reason')>500 then raise exception 'Add a deletion reason, up to 500 characters'; end if;
   if c.data->'deletion'->>'status'='deleted' then raise exception 'Ticket already deleted'; end if;
   if c.data->'deletion' is null then
     c.data=jsonb_set(c.data,'{deletion}',jsonb_build_object('status','deleting','actor',p_actor,'reason',trim(p_value->>'reason'),'at',now(),'channels',(select coalesce(jsonb_agg(distinct id),'[]') from (values(c.data->>'report_ticket'),(c.data->>'defence_ticket'),(c.review_channel_id),(c.data->>'third_ticket')) as channels(id) where id is not null)));
   end if;
   c.status='closed';
 elsif p_action='delete_ticket_complete' then
   if c.data->'deletion'->>'status' is distinct from 'deleting' then raise exception 'Deletion was not started'; end if;
   if p_value->'channels' is distinct from c.data->'deletion'->'channels' then raise exception 'Not all case channels were removed'; end if;
   c.data=jsonb_build_object('kind',c.data->>'kind','race',c.data->>'race','lap',c.data->>'lap','report',jsonb_build_object('statement',case when c.outcome is null then 'Ticket deleted without a verdict.' else 'Completed ticket deleted after leadership review.' end,'links','[]'::jsonb,'locked',true),'reporter_verdict',coalesce(c.data->'reporter_verdict','null'::jsonb),'third_verdict',coalesce(c.data->'third_verdict','null'::jsonb),'third',case when c.data ? 'third' then (c.data->'third')-'statement'-'links'-'external_links'-'clips' else 'null'::jsonb end,'deletion',(c.data->'deletion')||jsonb_build_object('status','deleted','completed_at',now()));
   c.comments='[]';c.votes='{}';c.notifications='{}';c.review_channel_id=null;c.status='closed';
 elsif c.data ? 'deletion' then raise exception 'This ticket is being deleted or has been deleted';
 elsif p_action='finish_report' then
   if p_actor<>c.reporter_id or c.status<>'awaiting_report_evidence' then raise exception 'Report already submitted or unavailable'; end if;
   c.data=jsonb_set(c.data,'{report}',(c.data->'report')||p_value||'{"locked":true}'::jsonb);
   c.status=case when c.data->>'kind'='penalty_appeal' then 'discussion' else 'awaiting_defence' end;
 elsif p_action='proceed_without_response' then
   if not p_leader or c.data->>'kind'='penalty_appeal' or c.status not in ('awaiting_defence','awaiting_defence_evidence') or not coalesce((c.data->'report'->>'locked')::boolean,false) then raise exception 'Only leadership can advance a case awaiting a reported driver response'; end if;
   if p_revision is null then raise exception 'Review the current case before proceeding'; end if;
   if length(trim(coalesce(p_value->>'reason','')))<10 or length(p_value->>'reason')>500 then raise exception 'Record the reason and response deadline in 10-500 characters'; end if;
   c.data=jsonb_set(c.data,'{defence}',coalesce(c.data->'defence','{}')||jsonb_build_object(
     'statement',coalesce(nullif(c.data->'defence'->>'statement',''),'No response completed by the reported driver. Leadership proceeded to review.'),
     'links',coalesce(p_value->'links',c.data->'defence'->'links','[]'),
     'external_links',coalesce(p_value->'external_links',c.data->'defence'->'external_links','[]'),
     'clips',coalesce(p_value->'clips',c.data->'defence'->'clips','[]'),
     'no_video',coalesce(p_value->'no_video','true'),
     'no_response',true,'locked',true,'advanced_by',p_actor,'advance_reason',trim(p_value->>'reason'),'advanced_at',now()));
   c.comments=c.comments||jsonb_build_array(jsonb_build_object('author',p_actor,'text','Leadership proceeded without a completed driver response: '||trim(p_value->>'reason'),'at',now()));
   c.status='discussion';
 elsif p_action='no_defence' then
   if p_actor<>c.accused_id or c.status not in ('awaiting_defence','awaiting_defence_evidence') then raise exception 'Only the reported driver can submit without a defence'; end if;
   c.data=jsonb_set(c.data,'{defence}',p_value||jsonb_build_object('statement','No defence submitted.','no_defence',true,'locked',true));c.status='discussion';
 elsif p_action='defence_draft' then
   if p_actor<>c.accused_id or c.status<>'awaiting_defence' then raise exception 'Defence already submitted or unavailable'; end if;
   c.data=jsonb_set(c.data,'{defence}',p_value); c.status='awaiting_defence_evidence';
 elsif p_action='defence' then
   if p_actor<>c.accused_id or c.status not in ('awaiting_defence','awaiting_defence_evidence') then raise exception 'Defence already submitted or unavailable'; end if;
   c.data=jsonb_set(c.data,'{defence}',coalesce(c.data->'defence','{}')||p_value||'{"locked":true}'::jsonb); c.status='discussion';
 elsif p_action='comment' then
   if c.status='closed' and coalesce(c.data->'reporter_verdict'->>'status','closed')='closed' and coalesce(c.data->'third_verdict'->>'status','closed')='closed' then raise exception 'Case is closed'; end if;
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
   if c.data ? 'third' and not coalesce((c.data->'third'->>'locked')::boolean,false) then raise exception 'Wait for the third-driver statement before finalising'; end if;
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
   if c.status<>'closed' or (p_value->>'recipient' not in ('reporter','accused','third') or (p_value->>'recipient'='third' and c.data->'third'->>'role' is distinct from 'involved')) then raise exception 'Invalid notification'; end if;
   if c.notifications ? (p_value->>'recipient') then raise exception 'Notification already attempted; check delivery status'; end if;
   c.notifications=jsonb_set(c.notifications,array[p_value->>'recipient'],'"sending"');
 elsif p_action='notification_result' then
   if c.notifications->>(p_value->>'recipient')<>'sending' then raise exception 'Notification not claimed'; end if;
   c.notifications=jsonb_set(c.notifications,array[p_value->>'recipient'],to_jsonb(p_value->>'result'));
 else raise exception 'Invalid action'; end if;
 if secondary then
   c.data=jsonb_set(c.data,array[verdict_key],jsonb_build_object('status',c.status,'penalty_set',c.penalty_set,'votes',c.votes,'notifications',c.notifications,'outcome',c.outcome,'explanation',c.explanation,'decided_by',c.decided_by,'reason',coalesce(original.data->verdict_key->>'reason',p_value->>'reason')));
   c.status=original.status;c.penalty_set=original.penalty_set;c.votes=original.votes;c.notifications=original.notifications;c.outcome=original.outcome;c.explanation=original.explanation;c.decided_by=original.decided_by;
 end if;
 update f7r_steward_cases set data=c.data,status=c.status,penalty_set=c.penalty_set,votes=c.votes,comments=c.comments,
 outcome=c.outcome,explanation=c.explanation,decided_by=c.decided_by,notifications=c.notifications,
 review_channel_id=c.review_channel_id,revision=c.revision+1,updated_at=now() where id=c.id returning * into c;
 return c;
end $function$
;
revoke all on function public.f7r_steward_action(uuid,text,boolean,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.f7r_steward_action(uuid,text,boolean,text,jsonb,integer) to service_role;

