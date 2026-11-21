-- Transactional verification only: leaves no routes, cases or notifications behind.
begin;
do $test$
declare c public.f7r_steward_cases; first_id uuid=gen_random_uuid(); rejected boolean;
begin
 insert into public.f7r_steward_routes(guild_id,id,config) values ('verification','reporter-verdict','{}');
 insert into public.f7r_steward_cases(id,number,guild_id,route_id,interaction_id,reporter_id,accused_id,data,status,penalty_set,votes,outcome,explanation,notifications)
 overriding system value values(first_id,-1,'verification','reporter-verdict',first_id::text,'111111111111111111','222222222222222222',
 '{"kind":"incident","defence":{"locked":true}}','closed','F1','{"primary":{"penalty":"No further action"}}','No further action','Original approved explanation','{"reporter":"sent","accused":"sent"}') returning * into c;
 c=public.f7r_steward_action(c.id,'333333333333333333',false,'start_reporter_vote','{"target":"reporter","set":"Endurance","reason":"The reporting driver also caused contact."}',c.revision);
 assert c.status='closed' and c.outcome='No further action' and c.data->'reporter_verdict'->>'status'='voting','Original decision changed';
 rejected=false;begin perform public.f7r_steward_action(c.id,'111111111111111111',true,'vote','{"target":"reporter","penalty":"5 seconds","reason":"Own case"}',null);exception when others then rejected=true;end;assert rejected,'Involved driver voted';
 rejected=false;begin perform public.f7r_steward_action(c.id,'333333333333333333',false,'start_reporter_vote','{"target":"reporter","set":"F1","reason":"Duplicate request should not reset voting."}',null);exception when others then rejected=true;end;assert rejected,'Duplicate start reset votes';
 c=public.f7r_steward_action(c.id,'333333333333333333',false,'vote','{"target":"reporter","penalty":"50 seconds","reason":"Endurance separate vote"}',null);
 c=public.f7r_steward_action(c.id,'444444444444444444',true,'vote','{"target":"reporter","penalty":"Warning","reason":"Different assessment"}',null);
 rejected=false;begin perform public.f7r_steward_action(c.id,'333333333333333333',false,'close_vote','{"target":"reporter","explanation":"An ordinary steward must not close voting."}',c.revision);exception when others then rejected=true;end;assert rejected,'Non-leader closed vote';
 rejected=false;begin perform public.f7r_steward_action(c.id,'444444444444444444',true,'close_vote','{"target":"reporter","explanation":"Stale review must not close voting."}',0);exception when others then rejected=true;end;assert rejected,'Stale revision accepted';
 c=public.f7r_steward_action(c.id,'444444444444444444',true,'close_vote','{"target":"reporter","explanation":"The stewards have conflicting assessments."}',c.revision);
 assert c.data->'reporter_verdict'->>'status'='tied','Tie did not remain pending';
 c=public.f7r_steward_action(c.id,'444444444444444444',true,'tie_break','{"target":"reporter","penalty":"Warning","explanation":"The reporting driver receives a warning for this contact."}',c.revision);
 assert c.data->'reporter_verdict'->>'outcome'='Warning' and c.outcome='No further action','Decisions leaked between drivers';
 c=public.f7r_steward_action(c.id,'444444444444444444',true,'claim_notification','{"target":"reporter","recipient":"reporter"}',null);
 assert c.notifications->>'reporter'='sent' and c.data->'reporter_verdict'->'notifications'->>'reporter'='sending','DM claims leaked between verdicts';
 c=public.f7r_steward_action(c.id,'444444444444444444',true,'notification_result','{"target":"reporter","recipient":"reporter","result":"sent"}',null);
 rejected=false;begin perform public.f7r_steward_action(c.id,'444444444444444444',true,'claim_notification','{"target":"reporter","recipient":"reporter"}',null);exception when others then rejected=true;end;assert rejected,'Duplicate DM claim accepted';
 update public.f7r_steward_cases set data='{"kind":"penalty_appeal","defence":{"locked":true}}' where id=c.id;
 rejected=false;begin perform public.f7r_steward_action(c.id,'444444444444444444',true,'start_reporter_vote','{"target":"reporter","set":"F1","reason":"Appeals must remain separate."}',null);exception when others then rejected=true;end;assert rejected,'Appeal opened second verdict';
end $test$;
select 'Independent votes, ties, leader approval, recusal, stale updates and isolated DM claims passed' as verification;
rollback;
