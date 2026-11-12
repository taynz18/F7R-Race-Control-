select cron.schedule(
 'f7r-rlt-archive-sync','*/2 * * * *',
 $job$select net.http_post(
 url:='https://uyiafrzsyzrtnuxxjkye.supabase.co/functions/v1/f7r-rlt-sync',
 headers:=jsonb_build_object('Content-Type','application/json','x-sync-token',(select decrypted_secret from vault.decrypted_secrets where name='f7r_rlt_sync_token')),
 body:='{}'::jsonb, timeout_milliseconds:=120000
 );$job$
);