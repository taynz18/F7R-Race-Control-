import {deliverReminder} from '../_shared/attendance-reminders.js';
const tokenHash = 'c1bf4fae52f0226a38269b7263cf0b9363c756088d1e3effafe23dbecf681098';
Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Use POST', {status:405});
  const supplied = request.headers.get('x-reminder-token') || '';
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(supplied)))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if (hash !== tokenHash) return new Response('Unauthorized', {status:401});
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = Deno.env.get('F7R_DISCORD_BOT_TOKEN'), guild = Deno.env.get('F7R_DISCORD_SERVER_ID');
  if (!token || !guild) return new Response('Bot unavailable', {status:503});
  const rpc = (name, body) => fetch(url + '/rest/v1/rpc/' + name, {method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const claimed = await rpc('f7r_claim_discord_reminders', {});
  if (!claimed.ok) return new Response('Queue unavailable', {status:503});
  const rows = await claimed.json();
  for (const row of rows) {
    const result = row.guild_id === guild ? await deliverReminder(row,{token}) : {status:'cancelled',error:'Server configuration changed.'};
    const finished = await rpc('f7r_finish_discord_reminder', {p_guild:row.guild_id,p_message:row.message_id,p_claim:row.claim,p_status:result.status,p_error:result.error || null,p_retry_seconds:result.retrySeconds || 300});
    if (!finished.ok) console.error('Could not acknowledge reminder delivery',row.message_id);
  }
  return Response.json({processed:rows.length});
});
