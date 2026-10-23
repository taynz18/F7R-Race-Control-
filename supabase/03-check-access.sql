-- Run after setup.sql in the Supabase SQL Editor. All changes roll back.
begin;
do $$ begin
  if has_table_privilege('anon','public.flag_state','UPDATE')
     or has_table_privilege('authenticated','public.flag_state','UPDATE')
     or has_table_privilege('authenticated','public.flag_admins','INSERT') then
    raise exception 'Client write privileges are too broad';
  end if;
  if has_function_privilege('anon','public.set_flag(text)','EXECUTE') then
    raise exception 'Anonymous drivers can execute the control function';
  end if;
end $$;
set local role anon;
do $$ begin
  if (select count(*) from public.flag_state) <> 1 then
    raise exception 'Drivers cannot read the current flag';
  end if;
  begin
    update public.flag_state set flag='RED' where id=1;
    raise exception 'Driver was allowed to change the flag';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.set_flag('RED');
    raise exception 'An unapproved user was allowed to send a flag';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
