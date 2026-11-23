-- Run inside a rollback transaction. No Discord requests, real cases or identity sequence changes.
do $test$
declare c public.f7r_steward_cases; test_id uuid=gen_random_uuid(); rejected boolean; prior_data jsonb;
begin
 insert into public.f7r_steward_routes(guild_id,id,config) values ('third-verification','third-test','{}');
 insert into public.f7r_steward_cases(id,number,guild_id,route_id,interaction_id,reporter_id,accused_id,data,status,penalty_set,votes)
 overriding system value values(test_id,-3,'third-verification','third-test',test_id::text,'111111111111111111','222222222222222222','{"kind":"incident","report":{"locked":true,"statement":"Original report"},"defence":{"locked":true,"statement":"Original defence"}}','voting','F1','{"444444444444444444":{"penalty":"No further action","reason":"Original vote"}}') returning * into c;
 prior_data=c.data;
 c=public.f7r_steward_action(c.id,'444444444444444444',false,'add_third','{"driver_id":"333333333333333333","role":"involved","name":"Third"}',c.revision);
 assert c.data->'report'=prior_data->'report' and c.data->'defence'=prior_data->'defence' and c.status='voting' and c.votes->'444444444444444444'->>'penalty'='No further action','Existing report, defence or votes changed';
 rejected=false;begin perform public.f7r_steward_action(c.id,'444444444444444444',true,'start_vote','{"target":"third","set":"F1"}',c.revision);exception when others then rejected=true;end;assert rejected,'Unsubmitted third-driver statement accepted for voting';
 rejected=false;begin perform public.f7r_steward_action(c.id,'444444444444444444',true,'close_vote','{"explanation":"Original case must wait for third statement."}',c.revision);exception when others then rejected=true;end;assert rejected,'Unsubmitted evidence did not block finalisation';
 rejected=false;begin perform public.f7r_steward_action(c.id,'333333333333333333',true,'vote','{"penalty":"Warning","reason":"Own incident"}',null);exception when others then rejected=true;end;assert rejected,'Third driver voted on their own case';
 rejected=false;begin perform public.f7r_steward_action(c.id,'444444444444444444',true,'third_draft','{"statement":"Impersonating third driver"}',null);exception when others then rejected=true;end;assert rejected,'Another person changed the third statement';
 c=public.f7r_steward_action(c.id,'333333333333333333',false,'third_draft','{"statement":"Third driver account"}',c.revision);
 c=public.f7r_steward_action(c.id,'333333333333333333',false,'third_submit','{"links":["https://example.com/clip"],"no_video":false}',c.revision);
 assert (c.data->'third'->>'locked')::boolean and c.data->'third'->>'driver_id'='333333333333333333','Third submit corrupted identity';
 rejected=false;begin perform public.f7r_steward_action(c.id,'333333333333333333',false,'third_draft','{"statement":"Changed locked statement"}',null);exception when others then rejected=true;end;assert rejected,'Locked statement changed';
 c=public.f7r_steward_action(c.id,'444444444444444444',true,'start_vote','{"target":"third","set":"F1"}',c.revision);
 c=public.f7r_steward_action(c.id,'444444444444444444',true,'vote','{"target":"third","penalty":"5 seconds","reason":"Third driver caused contact"}',null);
 assert c.votes->'444444444444444444'->>'penalty'='No further action','Third vote overwrote original vote';
 c=public.f7r_steward_action(c.id,'444444444444444444',true,'close_vote','{"explanation":"The original reported driver is not at fault."}',c.revision);
 assert c.status='closed' and c.data->'third_verdict'->>'status'='voting','Primary close changed third voting';
 rejected=false;begin perform public.f7r_steward_action(c.id,'444444444444444444',true,'delete_ticket_claim','{"reason":"Must wait"}',c.revision);exception when others then rejected=true;end;assert rejected,'Case deleted with pending third verdict';
 c=public.f7r_steward_action(c.id,'444444444444444444',true,'close_vote','{"target":"third","explanation":"The third driver caused avoidable contact."}',c.revision);
 assert c.outcome='No further action' and c.data->'third_verdict'->>'outcome'='5 seconds','Verdicts are not independent';
 c=public.f7r_steward_action(c.id,'444444444444444444',true,'claim_notification','{"target":"third","recipient":"third"}',null);
 assert c.data->'third_verdict'->'notifications'->>'third'='sending' and c.notifications='{}','Third notifications leaked into primary';
 rejected=false;begin perform public.f7r_steward_action(c.id,'444444444444444444',true,'claim_notification','{"target":"third","recipient":"third"}',null);exception when others then rejected=true;end;assert rejected,'Duplicate DM claim accepted';
 update public.f7r_steward_cases set data=jsonb_set(data,'{third,role}','"witness"') where id=c.id;
 rejected=false;begin perform public.f7r_steward_action(c.id,'444444444444444444',true,'vote','{"target":"third","penalty":"Warning"}',null);exception when others then rejected=true;end;assert rejected,'Witness was included in penalty voting';
end $test$;
select 'Third-driver evidence, independent decisions, recusal, locking and notification checks passed' as verification;
