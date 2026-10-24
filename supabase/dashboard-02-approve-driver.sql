-- Create each driver's email/password account in Authentication > Users first.
-- This query grants access only to the matching existing account.
-- Replace BOTH values. Use role 'publisher' for the receiver account or
-- 'admin' for your own dashboard administrator. Other drivers use 'driver'.
do $$
declare target_email text := 'REPLACE_WITH_DRIVER_EMAIL';
        target_name text := 'REPLACE_WITH_F7R_NAME';
        target_role text := 'driver';
        target_id uuid;
begin
  if target_email like 'REPLACE%' or target_name like 'REPLACE%' then
    raise exception 'Replace the email and F7R name before running';
  end if;
  select id into strict target_id from auth.users where lower(email)=lower(target_email);
  insert into public.f7r_members(user_id,display_name,role,approved)
    values(target_id,target_name,target_role,true)
    on conflict(user_id) do update set display_name=excluded.display_name,
      role=excluded.role,approved=true;
end $$;

