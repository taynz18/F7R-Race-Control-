-- Run after approving the receiver account with role publisher or admin.
-- Use a NEW F7R race for each new in-game session UID (including new qualifying/race).
do $$
declare receiver_email text := 'REPLACE_WITH_RECEIVER_ACCOUNT_EMAIL';
        race_title text := 'F7R — Race night';
        receiver_id uuid;
        race_id uuid;
begin
  select u.id into strict receiver_id from auth.users u join public.f7r_members m on m.user_id=u.id
    where lower(u.email)=lower(receiver_email) and m.approved and m.role in ('publisher','admin');
  insert into public.f7r_sessions(title,publisher_id) values(race_title,receiver_id)
    returning id into race_id;
  raise notice 'F7R_SESSION_ID = %',race_id;
end $$;
select id,title,status,created_at from public.f7r_sessions order by created_at desc limit 10;
-- Finish a race: update public.f7r_sessions set status='finished' where id='RACE_UUID';
-- If console names are unavailable, supply a SESSION-SPECIFIC slot mapping:
-- update public.f7r_sessions set driver_names='{"0":"F7R Driver One","1":"F7R Driver Two"}'
-- where id='RACE_UUID';
-- Slots are zero-based and must be verified against the current lobby.

