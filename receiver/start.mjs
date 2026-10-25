import dgram from 'node:dgram';
import {readFile} from 'node:fs/promises';
import {networkInterfaces} from 'node:os';
import {header,Decoder} from './decoder.mjs';
const config=JSON.parse(await readFile(new URL('../config.json',import.meta.url),'utf8'));
const env=process.env,sessionId=env.F7R_SESSION_ID,source=env.F7R_GAME_IP||'auto',port=Number(env.F7R_UDP_PORT||20777);
if(!/^[0-9a-f-]{36}$/i.test(sessionId||'')||!source||!env.F7R_RECEIVER_EMAIL||!env.F7R_RECEIVER_PASSWORD)
  throw Error('Set F7R_SESSION_ID, F7R_GAME_IP, F7R_RECEIVER_EMAIL and F7R_RECEIVER_PASSWORD. See README.');
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid UDP port');
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabase_url)||!config.supabase_publishable_key?.startsWith('sb_publishable_'))
  throw Error('Use a Supabase URL and publishable key, never a secret key.');
let auth,expires=0;
async function request(route,body,method='POST',token=null,prefer=null){
  const r=await fetch(config.supabase_url+route,{method,signal:AbortSignal.timeout(8000),
    headers:{apikey:config.supabase_publishable_key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(prefer?{Prefer:prefer}:{})},
    ...(body===null?{}:{body:JSON.stringify(body)})});
  const raw=await r.text();let data;try{data=raw?JSON.parse(raw):null}catch{data=null}
  if(!r.ok)throw Error('Supabase request failed ('+r.status+'): '+(data?.message||data?.msg||'Check configuration and access'));
  return data;
}
async function authenticate(){
  auth=await request('/auth/v1/token?grant_type=password',{email:env.F7R_RECEIVER_EMAIL,password:env.F7R_RECEIVER_PASSWORD});
  delete env.F7R_RECEIVER_PASSWORD;expires=Date.now()+auth.expires_in*1000;
}
await authenticate();
const races=await request('/rest/v1/f7r_sessions?id=eq.'+sessionId+'&select=id,publisher_id,status,game_format',null,'GET',auth.access_token);
if(races?.length!==1||races[0].publisher_id!==auth.user.id||races[0].status!=='live')throw Error('Account is not the assigned publisher for this live race');
const race=races[0],decoder=new Decoder(),socket=dgram.createSocket('udp4');let enabled=false,controlAt=0,healthAt=0,healthState='waiting',lastUpload=0;let lockedSource=null;let busy=false,lastFrame=-1,stopped=false,lastPacket=0;
const existing=await request('/rest/v1/f7r_snapshots?session_id=eq.'+sessionId+'&select=game_uid,frame',null,'GET',auth.access_token);
if(existing?.[0]){decoder.uid=existing[0].game_uid;decoder.format=race.game_format;lastFrame=existing[0].frame;}
socket.on('error',e=>{console.error('UDP error:',e.code==='EADDRINUSE'?'Port '+port+' is already in use. Close Racing League Tools or use its UDP forwarding to another port, then restart.':e.message);stop();process.exitCode=1});
socket.on('message',(b,rinfo)=>{
  if(source!=='auto'&&rinfo.address!==source)return;
  if(lockedSource&&rinfo.address!==lockedSource)return;
  if(!lockedSource){
    try{
      const h=header(b);if(!h)return;
      if(h.format!==race.game_format)throw Error('Game UDP format does not match the selected F7R race. Check F1 telemetry format and choose the correct race.');
      if(decoder.uid&&h.uid!==decoder.uid)throw Error('New game session detected. The selected F7R race contains an earlier game session. Select a fresh live race in the receiver and dashboard, then reconnect.');
    }catch(e){console.error(e.message);stop();process.exitCode=1;return}
    lockedSource=rinfo.address;console.log('Game feed found at '+lockedSource+'. Locked to this device until restart.');
  }
  try{if(decoder.accept(b)){lastPacket=Date.now();if(decoder.format!==race.game_format)throw Error('Wrong UDP format for this F7R race');}}
  catch(e){console.error(e.message);if(/session changed|Wrong UDP/.test(e.message)){stop();process.exitCode=1}}
});
const capacity=env.F7R_ERS_CAPACITY_J?Number(env.F7R_ERS_CAPACITY_J):null;
if(capacity!==null&&(!Number.isFinite(capacity)||capacity<=0))throw Error('F7R_ERS_CAPACITY_J must be a positive number');
const timer=setInterval(async()=>{
  if(busy||stopped)return;
  busy=true;
  try {
    if(Date.now()>expires-60000){auth=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:auth.refresh_token});expires=Date.now()+auth.expires_in*1000;}
    if(Date.now()-controlAt>2000){
      // A failed control read must stop uploads until the next successful read.
      enabled=false;
      const rows=await request('/rest/v1/f7r_receiver_controls?session_id=eq.'+sessionId+'&select=enabled',null,'GET',auth.access_token);
      enabled=rows?.[0]?.enabled===true;controlAt=Date.now();
    }
    const snap=decoder.snapshot();
    const state=!enabled?'paused':Date.now()-lastPacket>2500?(lastPacket?'stale':'waiting'):lastUpload&&Date.now()-lastUpload<2500?'publishing':'waiting';
    if(Date.now()-healthAt>5000||healthState!==state){
      await request('/rest/v1/f7r_receiver_status?on_conflict=session_id',{session_id:sessionId,state,last_seen:new Date().toISOString(),driver_count:snap?.data?.drivers.length||0},'POST',auth.access_token,'resolution=merge-duplicates,return=minimal');
      healthAt=Date.now();if(healthState!==state)console.log('Receiver state: '+state);healthState=state;
    }
    if(!enabled||Date.now()-lastPacket>2500||!snap||snap.frame<=lastFrame)return;
    snap.data.drivers.forEach(d=>{d.ers_percent=capacity&&d.ers_joules!==null?Math.max(0,Math.min(100,d.ers_joules/capacity*100)):null});
    await request('/rest/v1/f7r_snapshots?on_conflict=session_id',{session_id:sessionId,...snap},'POST',auth.access_token,'resolution=merge-duplicates,return=minimal');
    lastFrame=snap.frame;lastUpload=Date.now();
    process.stdout.write('\rPublishing frame '+lastFrame+' · '+snap.data.drivers.length+' drivers   ');
  }catch(e){console.error('\nReceiver request failed:',e.message);enabled=false;controlAt=0}
  finally{busy=false}
},550);
function stop(){if(stopped)return;stopped=true;clearInterval(timer);socket.close();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
socket.bind(port,'0.0.0.0',()=>{
  console.log('F7R Race Control receiver. Listening on port '+port+'; game source: '+source);
  console.log('Receiver addresses:',Object.values(networkInterfaces()).flat().filter(x=>x.family==='IPv4'&&!x.internal).map(x=>x.address).join(', '));
  console.log('Open the dashboard as admin and click Start live telemetry. Keep this window open.');
  console.log('Waiting for game packets. Public telemetry and online names must be enabled.');
  console.log(capacity?'ERS percentage uses configured capacity '+capacity+' J.':'ERS energy shown in MJ until capacity is verified and configured.');
});

