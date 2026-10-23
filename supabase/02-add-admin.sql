-- First create your user in Supabase: Authentication > Users > Add user.
-- Replace the email below with that user's email. Then run this whole query.
do $$
declare
  admin_email text := 'REPLACE-WITH-YOUR-ADMIN-EMAIL';
  admin_id uuid;
begin
  if admin_email not like '%@%' then
    raise exception 'Replace the email placeholder before running this query.';
  end if;
  select id into admin_id from auth.users where lower(email) = lower(admin_email);
  if admin_id is null then
    raise exception 'No user found for %. Create the user in Authentication > Users first.', admin_email;
  end if;
  insert into public.flag_admins (user_id) values (admin_id) on conflict do nothing;
  raise notice 'Race admin approved: %', admin_email;
end;
$$;
