-- Run in a rollback transaction. No Discord calls or real driver records.
do $test$
declare a public.f7r_seat_requests;b public.f7r_seat_requests;c public.f7r_seat_requests;rejected boolean;
begin
 a=public.f7r_seat_draft('999999999999999991','999999999999999992','F1','{"racing_name":"Driver One"}','{}');
 assert a.number=1001 and a.status='draft','F1 numbering must start at 1001';
 b=public.f7r_seat_draft('999999999999999991','999999999999999993','F1','{"racing_name":"Driver Two"}','{}');
 assert b.number=1002,'F1 second request must be 1002';
 c=public.f7r_seat_draft('999999999999999991','999999999999999992','LMU','{"racing_name":"Driver One"}','{}');
 assert c.number=1001,'LMU must use a separate counter';
 c=public.f7r_seat_draft('999999999999999991','999999999999999992','ACC','{"racing_name":"Driver One"}','{}');
 assert c.number=1001,'ACC must use a separate counter';
 c=public.f7r_seat_draft('999999999999999991','999999999999999992','F1','{"racing_name":"Updated draft"}','{}');
 assert c.id=a.id and c.number=1001 and c.profile->>'racing_name'='Updated draft','Repeated application must reuse its draft';
 update public.f7r_seat_requests set status='waiting',channel_id='999999999999999994' where id=a.id;
 c=public.f7r_seat_draft('999999999999999991','999999999999999992','F1','{"racing_name":"Must not replace open request"}','{}');
 assert c.id=a.id and c.status='waiting' and c.profile->>'racing_name'='Updated draft','Open request must not be overwritten';
 update public.f7r_seat_requests set status='acquired' where id=a.id;
 c=public.f7r_seat_draft('999999999999999991','999999999999999992','F1','{}','{}');
 assert c.number=1003 and c.id<>a.id,'A new application after acquisition must have a new number';
 rejected=false;begin perform public.f7r_seat_draft('999999999999999991','999999999999999992','UNKNOWN','{}','{}');exception when others then rejected=true;end;assert rejected,'Unknown series accepted';
 rejected=false;begin perform public.f7r_seat_draft(null,'999999999999999992','F1','{}','{}');exception when others then rejected=true;end;assert rejected,'Missing guild accepted';
 assert not has_table_privilege('anon','public.f7r_seat_requests','SELECT'),'Private applications exposed to anonymous visitors';
 assert not has_function_privilege('authenticated','public.f7r_seat_draft(text,text,text,jsonb,jsonb)','EXECUTE'),'Public client can create requests directly';
end $test$;
select 'Seat numbering, duplicate protection, draft retention and private database access verified' as verification;
