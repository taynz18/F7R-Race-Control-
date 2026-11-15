-- Optional attendance reminders. Only the authenticated admin Edge Function and worker use this table.
create table public.f7r_discord_reminders (
 guild_id text not null, message_id text not null, channel_id text not null, role_id text not null,
 starts_at timestamptz not null, interval_hours integer not null check(interval_hours between 1 and 720),
 total_count integer not null check(total_count between 1 and 20), sent_count integer not null default 0,
 next_at timestamptz not null, status text not null default 'active' check(status in ('active','completed','cancelled','paused')),
 claim uuid, lease_until timestamptz, last_error text,
 primary key(guild_id,message_id)
);
alter table public.f7r_discord_reminders enable row level security;
revoke all on public.f7r_discord_reminders from anon, authenticated;
grant all on public.f7r_discord_reminders to service_role;
create index on public.f7r_discord_reminders(next_at) where status='active';

create or replace function public.f7r_claim_discord_reminders() returns setof public.f7r_discord_reminders
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update f7r_discord_reminders set status='paused',last_error='Delivery uncertain. Check Discord before restarting.',claim=null,lease_until=null
 where status='active' and claim is not null and lease_until<now();
 update f7r_discord_reminders set status='completed' where status='active' and (starts_at<=now() or sent_count>=total_count);
 return query
 with due as (select guild_id,message_id from f7r_discord_reminders where status='active' and claim is null and next_at<=now() order by next_at for update skip locked limit 10)
 update f7r_discord_reminders r set claim=gen_random_uuid(),lease_until=now()+interval '5 minutes'
 from due where r.guild_id=due.guild_id and r.message_id=due.message_id returning r.*;
end $$;

create or replace function public.f7r_finish_discord_reminder(p_guild text,p_message text,p_claim uuid,p_status text,p_error text default null,p_retry_seconds integer default 300)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_status not in ('sent','active','completed','cancelled','paused') then raise exception 'Invalid reminder result'; end if;
 update f7r_discord_reminders set
 sent_count=sent_count+case when p_status='sent' then 1 else 0 end,
 status=case when p_status='sent' then case when sent_count+1>=total_count or now()+make_interval(hours=>interval_hours)>=starts_at then 'completed' else 'active' end else p_status end,
 next_at=case when p_status='sent' then now()+make_interval(hours=>interval_hours) else now()+make_interval(secs=>greatest(60,least(3600,p_retry_seconds))) end,
 last_error=left(p_error,300),claim=null,lease_until=null
 where guild_id=p_guild and message_id=p_message and claim=p_claim and status='active';
end $$;
revoke all on function public.f7r_claim_discord_reminders() from public,anon,authenticated;
revoke all on function public.f7r_finish_discord_reminder(text,text,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.f7r_claim_discord_reminders() to service_role;
grant execute on function public.f7r_finish_discord_reminder(text,text,uuid,text,text,integer) to service_role;

do $$ begin
 if not exists(select 1 from vault.secrets where name='f7r_discord_reminder_token') then
 perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'f7r_discord_reminder_token');
 end if;
end $$;
select cron.schedule('f7r-discord-attendance-reminders','* * * * *', $job$
 select net.http_post(
 url:='https://uyiafrzsyzrtnuxxjkye.supabase.co/functions/v1/f7r-discord-reminders',
 headers:=jsonb_build_object('Content-Type','application/json','x-reminder-token',(select decrypted_secret from vault.decrypted_secrets where name='f7r_discord_reminder_token')),
 body:='{}'::jsonb,timeout_milliseconds:=120000)
 where exists(select 1 from public.f7r_discord_reminders where status='active' and next_at<=now());
 $job$);
