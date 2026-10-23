'use strict';
const $ = id => document.getElementById(id);
const FLAGS = {
  CLEAR: ['Clear flags','Hide driver overlays','#d8e2df','#81938c'],
  YELLOW: ['Yellow','Caution','#ffda36','#9c7600'],
  'SAFETY CAR': ['Safety car','SC deployed','#ffda36','#9c7600'],
  FCY: ['FCY','Full course yellow','#ffda36','#9c7600'],
  RED: ['Red','Session stopped','#ff5558','#971824'],
  GREEN: ['Green','Track clear','#49dc8b','#166d40'],
  BLUE: ['Blue','Blue flag','#579aff','#234d94'],
  WHITE: ['White','White flag','#f4f4ef','#92958c'],
  BLACK: ['Black','Black flag','#252b30','#080b0c'],
  CHEQUERED: ['Chequered','Session complete','#efefed','#565c60']
};
let client, channel, user, state, changing=false, verified=false, checkGeneration=0, messageDirty=false, clockOffset=0;
function message(text='') { $('message').textContent=text; }
function buttons() { $('custom-message').disabled=changing || !verified; $('countdown-seconds').disabled=changing || !verified; $('update-message').disabled=changing || !verified || !state || state.flag==='CLEAR'; $('start-countdown').disabled=changing || !verified; $('cancel-countdown').disabled=changing || !verified || !state?.countdown_ends_at || state.flag!=='FCY'; document.querySelectorAll('.flag').forEach(b => {b.disabled=changing || !verified; b.setAttribute('aria-pressed', String(b.dataset.flag===state?.flag));}); }
function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '—';
  const seconds=Math.max(0,Math.floor(milliseconds/1000));
  return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60]
    .map(value=>String(value).padStart(2,'0')).join(':');
}
function updateDuration(now=Date.now()+clockOffset) {
  const active=state && state.flag!=='CLEAR';
  const countdown=active && state.flag==='FCY' && state.countdown_ends_at;
  const remaining=countdown?Math.max(0,Math.ceil((Date.parse(state.countdown_ends_at)-now)/1000)):null;
  $('duration-label').textContent=countdown?(remaining===0?'AWAITING GREEN':'GREEN IN'):active?'LIVE FOR':'NO FLAG ACTIVE';
  $('flag-duration').textContent=countdown?formatDuration(remaining*1000):active?formatDuration(now-Date.parse(state.updated_at)):'—';
}
function applyState(next) {
  if (!next || !FLAGS[next.flag] || (state && next.revision < state.revision)) return;
  if(next.server_time && Number.isFinite(Date.parse(next.server_time)))clockOffset=Date.parse(next.server_time)-Date.now();
  state=next;
  $('live-custom-message').textContent=next.custom_message||'';
  $('live-custom-message').hidden=!next.custom_message;
  if(!messageDirty)$('custom-message').value=next.custom_message||'';
  updateDuration();
  const halo=next.flag==='CLEAR'?'#657c92':next.flag==='BLACK'?'#748197':FLAGS[next.flag][2];
  $('race-atmosphere').style.cssText=`--halo:${halo};--deep:${FLAGS[next.flag][3]}`;
  $('active-flag').textContent=next.flag==='CLEAR'?'No active flag':FLAGS[next.flag][0];
  $('changed-at').textContent=(next.flag==='CLEAR'?'Cleared ':'Live since ')+new Date(next.updated_at).toLocaleString();
  document.querySelector('.current').style.cssText=`--current-signal:${FLAGS[next.flag][2]};--current-edge:${FLAGS[next.flag][3]}`;buttons();
}
async function refreshState() {
  const {data,error}=await client.rpc('get_race_state');
  if(error) throw error; applyState(data);
}
async function history() {
  const {data,error}=await client.from('flag_history').select('revision,flag,changed_at,custom_message,reason,countdown_ends_at').order('revision',{ascending:false}).limit(10);
  if(error) throw error;
  $('history').replaceChildren();
  if(!data.length){const li=document.createElement('li');li.textContent='No signals sent yet.';$('history').append(li);}
  for(const row of data){const li=document.createElement('li'),label=document.createElement('strong'),time=document.createElement('time');label.textContent=(FLAGS[row.flag]?.[0]||row.flag)+(row.reason==='countdown'?' · Automatic restart':row.reason==='message'?' · Message updated':'')+(row.custom_message?' — '+row.custom_message:'');time.dateTime=row.changed_at;time.textContent=new Date(row.changed_at).toLocaleString();li.append(label,time);$('history').append(li);}
}
async function changeFlag(flag, countdown=null) {
  if(changing || !verified)return;
  changing=true;buttons();message('Sending signal…');
  try {
    const {data,error}=await client.rpc('set_race_signal',{requested_flag:flag,requested_message:flag==='CLEAR'?'':$('custom-message').value.trim(),countdown_seconds:countdown,expected_revision:state?.revision??null});
    if(error)throw error;
    messageDirty=false;applyState(Array.isArray(data)?data[0]:data);message('Signal saved. Connected drivers will receive the update.');
    try{await history();}catch{message('Signal saved; history could not refresh.');}
  } catch(error){message('Could not confirm the signal. Check the current signal before trying again. '+error.message);}
  finally{changing=false;buttons();}
}
async function checkAccess(session) {
  const generation=++checkGeneration;user=session?.user;verified=false;buttons();
  $('console').hidden=true;$('login-card').hidden=false;
  if(channel){await client.removeChannel(channel);channel=null;}
  if(generation!==checkGeneration || !user){if(!user)$('race-atmosphere').style.cssText='';return;}
  const {data,error}=await client.from('flag_admins').select('user_id').eq('user_id',user.id).maybeSingle();
  if(generation!==checkGeneration)return;
  if(error || !data){message(error?'Cannot verify admin access. Check your connection.':'This account has not been approved as a race admin. Ask the project owner to add it to flag_admins.');return;}
  verified=true;$('login-card').hidden=true;$('console').hidden=false;message();buttons();
  channel=client.channel('admin-flag-state').on('postgres_changes',{event:'UPDATE',schema:'public',table:'flag_state',filter:'id=eq.1'},payload=>{applyState(payload.new);history().catch(()=>{});}).subscribe(status=>{
    $('connection').textContent=status==='SUBSCRIBED'?'Live connection':'Reconnecting';
    if(status==='SUBSCRIBED')refreshState().catch(()=>message('Unable to load current signal.'));
  });
  try{await refreshState();await history();}catch{message('Could not load race state. Check the database setup and connection.');}
}
for(const [flag,[label,description,fill,border]] of Object.entries(FLAGS)) {
  const b=document.createElement('button');b.className='flag'+(flag==='CHEQUERED'?' chequered':'');b.dataset.flag=flag;
  b.setAttribute('aria-label',label+'. '+description);
  b.style.cssText=`--fill:${fill};--border:${border};--text:${flag==='BLACK'?'#fff':'#111820'}`;
  const title=document.createElement('strong'),detail=document.createElement('span');title.textContent=label;detail.textContent=description;b.append(title,detail);b.onclick=()=>changeFlag(flag);$('flag-grid').append(b);
}
$('custom-message').oninput=()=>{messageDirty=true;};
$('update-message').onclick=async()=>{
  if(changing || !verified || !state || state.flag==='CLEAR')return;
  changing=true;buttons();
  try {
    const {data,error}=await client.rpc('update_flag_message',{requested_message:$('custom-message').value.trim(),expected_revision:state.revision});
    if(error)throw error;
    messageDirty=false;applyState(Array.isArray(data)?data[0]:data);message('Live message updated.');
    await history();
  } catch(error){message('Could not update the live message. '+error.message);await refreshState().catch(()=>{});}
  finally{changing=false;buttons();}
};
$('start-countdown').onclick=()=>{
  const value=$('countdown-seconds').value.trim();
  const seconds=Number(value);
  if(!/^\d+$/.test(value) || !Number.isSafeInteger(seconds) || seconds<1 || seconds>2147483647){message('Enter a whole number of seconds, from 1 to 2147483647.');return;}
  return changeFlag('FCY',seconds);
};
$('cancel-countdown').onclick=async()=>{
  if(changing || !verified || state?.flag!=='FCY' || !state.countdown_ends_at)return;
  changing=true;buttons();
  try {
    const {data,error}=await client.rpc('set_race_signal',{requested_flag:'FCY',requested_message:state.custom_message||'',countdown_seconds:null,expected_revision:state.revision});
    if(error)throw error;
    applyState(Array.isArray(data)?data[0]:data);message('Countdown cancelled. FCY remains live.');await history();
  } catch(error){message('Could not cancel the timer. '+error.message);await refreshState().catch(()=>{});}
  finally{changing=false;buttons();}
};
$('login-form').onsubmit=async e=>{
  e.preventDefault();if(!client)return;$('sign-in').disabled=true;message('Signing in…');
  try{const {data,error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)throw error;$('password').value='';await checkAccess(data.session);}
  catch(error){message('Sign-in failed. '+error.message);}finally{$('sign-in').disabled=false;}
};
$('sign-out').onclick=async()=>{verified=false;buttons();const {error}=await client.auth.signOut({scope:'local'});if(error)message(error.message);else await checkAccess(null);};
$('refresh-history').onclick=()=>history().catch(()=>message('History is unavailable.'));
async function start(){
  try{
    const r=await fetch('./config.json',{cache:'no-store'});if(!r.ok)throw Error('Missing config.json');const c=await r.json();
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.supabase_url) || !c.supabase_publishable_key?.startsWith('sb_publishable_') || c.supabase_publishable_key.includes('REPLACE'))throw Error('Add your Supabase project URL and publishable key to config.json.');
    if(!window.supabase)throw Error('Supabase library could not load. Check your internet connection.');
    client=window.supabase.createClient(c.supabase_url,c.supabase_publishable_key,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}});
    client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')setTimeout(()=>checkAccess(null),0);});
    $('sign-in').disabled=false;message();
    setInterval(async()=>{if(!verified)return;try{await refreshState();}catch{$('connection').textContent='Connection interrupted';}},10000);
  }catch(error){message(error.message);}
}
setInterval(()=>{if(verified)updateDuration();},1000);
start();
