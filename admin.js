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
let client, channel, user, state, changing=false, verified=false, checkGeneration=0;
function message(text='') { $('message').textContent=text; }
function buttons() { document.querySelectorAll('.flag').forEach(b => {b.disabled=changing || !verified; b.setAttribute('aria-pressed', String(b.dataset.flag===state?.flag));}); }
function applyState(next) {
  if (!next || !FLAGS[next.flag] || (state && next.revision < state.revision)) return;
  state=next;
  $('active-flag').textContent=next.flag==='CLEAR'?'No active flag':FLAGS[next.flag][0];
  $('changed-at').textContent='Updated '+new Date(next.updated_at).toLocaleString();
  document.querySelector('.current').style.borderLeftColor=FLAGS[next.flag][3];buttons();
}
async function refreshState() {
  const {data,error}=await client.from('flag_state').select('*').eq('id',1).single();
  if(error) throw error; applyState(data);
}
async function history() {
  const {data,error}=await client.from('flag_history').select('revision,flag,changed_at').order('revision',{ascending:false}).limit(10);
  if(error) throw error;
  $('history').replaceChildren();
  if(!data.length){const li=document.createElement('li');li.textContent='No signals sent yet.';$('history').append(li);}
  for(const row of data){const li=document.createElement('li'),label=document.createElement('strong'),time=document.createElement('time');label.textContent=FLAGS[row.flag]?.[0]||row.flag;time.dateTime=row.changed_at;time.textContent=new Date(row.changed_at).toLocaleString();li.append(label,time);$('history').append(li);}
}
async function changeFlag(flag) {
  if(changing || !verified)return;
  changing=true;buttons();message('Sending signal…');
  try {
    const {data,error}=await client.rpc('set_flag',{requested_flag:flag});
    if(error)throw error;
    applyState(Array.isArray(data)?data[0]:data);message('Signal saved. Connected drivers will receive the update.');
    try{await history();}catch{message('Signal saved; history could not refresh.');}
  } catch(error){message('Could not confirm the signal. Check the current signal before trying again. '+error.message);}
  finally{changing=false;buttons();}
}
async function checkAccess(session) {
  const generation=++checkGeneration;user=session?.user;verified=false;buttons();
  $('console').hidden=true;$('login-card').hidden=false;
  if(channel){await client.removeChannel(channel);channel=null;}
  if(generation!==checkGeneration || !user)return;
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
  b.style.cssText=`--fill:${fill};--border:${border};--text:${flag==='BLACK'?'#fff':'#111820'}`;
  const title=document.createElement('strong'),detail=document.createElement('span');title.textContent=label;detail.textContent=description;b.append(title,detail);b.onclick=()=>changeFlag(flag);$('flag-grid').append(b);
}
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
start();
