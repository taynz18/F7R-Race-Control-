do $test$
declare c public.f7r_steward_cases; test_id uuid=gen_random_uuid(); rejected boolean;
begin
 insert into public.f7r_steward_routes(guild_id,id,config) values ('no-response-verification','no-response','{}');
 insert into public.f7r_steward_cases(id,number,guild_id,route_id,interaction_id,reporter_id,accused_id,data,status)
 overriding system value values(test_id,-4,'no-response-verification','no-response',test_id::text,'111111111111111111','222222222222222222','{"kind":"incident","report":{"locked":true,"statement":"Original report"},"defence":{"statement":"Existing unsubmitted defence","links":["https://example.com/clip"]}}','awaiting_defence_evidence') returning * into c;
 rejected=false;begin perform public.f7r_steward_action(c.id,'333333333333333333',false,'proceed_without_response','{"reason":"Deadline has passed."}',c.revision);exception when others then rejected=true;end;assert rejected,'Ordinary steward proceeded';
 rejected=false;begin perform public.f7r_steward_action(c.id,'222222222222222222',true,'proceed_without_response','{"reason":"Own case must be refused."}',c.revision);exception when others then rejected=true;end;assert rejected,'Involved leader proceeded';
 rejected=false;begin perform public.f7r_steward_action(c.id,'333333333333333333',true,'proceed_without_response','{"reason":"Deadline has passed."}',null);exception when others then rejected=true;end;assert rejected,'Missing reviewed revision accepted';
 rejected=false;begin perform public.f7r_steward_action(c.id,'333333333333333333',true,'proceed_without_response','{"reason":"short"}',c.revision);exception when others then rejected=true;end;assert rejected,'Missing reason accepted';
 c=public.f7r_steward_action(c.id,'333333333333333333',true,'proceed_without_response','{"reason":"Driver did not respond by the stated deadline.","links":["https://example.com/clip"],"clips":[],"no_video":false}',c.revision);
 assert c.status='discussion' and c.outcome is null and c.votes='{}','Continuation recorded a penalty or started voting';
 assert c.data->'defence'->>'statement'='Existing unsubmitted defence' and c.data->'report'->>'statement'='Original report','Existing statements changed';
 assert c.data->'defence'->'links'='["https://example.com/clip"]'::jsonb and (c.data->'defence'->>'locked')::boolean and (c.data->'defence'->>'no_response')::boolean,'Evidence lost or statement not locked';
 assert c.data->'defence'->>'advanced_by'='333333333333333333' and jsonb_array_length(c.comments)=1,'Leadership audit missing';
 rejected=false;begin perform public.f7r_steward_action(c.id,'333333333333333333',true,'proceed_without_response','{"reason":"Duplicate attempt must not advance twice."}',c.revision);exception when others then rejected=true;end;assert rejected,'Duplicate continuation accepted';
 c=public.f7r_steward_action(c.id,'333333333333333333',true,'start_vote','{"set":"F1"}',c.revision);
 assert c.status='voting','Normal verdict did not open';
end $test$;
select 'Leadership continuation preserves evidence, requires review and reason, records an audit, and leaves the verdict unchanged' as verification;
