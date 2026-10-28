import {renderTrackMap} from './track-map.js?v=0.13.1';
import {lapTime,reading,driverName,energy,feedState,acceptsSnapshot,damageAlert,penaltyLabel,currentLiveRace,safetyPeriod,inPitLane,GridChanges} from './model.js?v=0.12.0';
import {renderCar} from './car-view.js?v=0.4.1';
import {teamFor} from './teams.js?v=0.13.1';
import {startFlags,stopFlags} from './flag-view.js';
const $=id=>document.getElementById(id);
let signingUp=false,isReceiverAdmin=false,receiverReadBusy=false,receiverWriteBusy=false,receiverEnabled=false;
let client=null,member=null,races=[],race=null,snapshot=null,channel=null,selected=null,demo=false,generation=0,polling=false,refreshing=false,transport='Not connected';
const gridChanges=new GridChanges(),movementBadges=new Map();
const safeNode=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
function setTeamColors(node,team){node.style.setProperty('--team-color',team.color);node.style.setProperty('--team-accent',team.accent);node.style.setProperty('--team-wash',team.color+'20');node.style.setProperty('--team-wash-strong',team.color+'38')}
function teamMark(team,extra=''){
 const wrap=safeNode('span',undefined,'team-mark '+extra);
 if(team.logo){const img=safeNode('img');img.src='./assets/teams/'+team.logo;img.alt=team.name+' logo';img.width=38;img.height=38;wrap.append(img)}
 else{wrap.append(safeNode('span',team.key==='unknown'?'?':team.name==='Red Bull Racing'?'RBR':team.name.slice(0,3).toUpperCase(),'team-monogram'));wrap.setAttribute('aria-label',team.name)}
 return wrap;
}
function compoundBadge(code){
 const types={16:['S','Soft','#ff4d62'],17:['M','Medium','#ffda55'],18:['H','Hard','#f3f5fa'],7:['I','Intermediate','#6cdd99'],8:['W','Wet','#62adff'],15:['W','F2 Wet','#62adff'],19:['SS','F2 Super soft','#ca82ff'],20:['S','F2 Soft','#ff4d62'],21:['M','F2 Medium','#ffda55'],22:['H','F2 Hard','#f3f5fa']};
 const [letter,label,color]=types[code]||['—','Unknown','#8d99ad'];
 const icon=safeNode('span',undefined,'compound-icon');icon.style.setProperty('--compound-color',color);icon.setAttribute('role','img');icon.setAttribute('aria-label',label+' tyre');icon.title=label+' tyre';
 const background=safeNode('img');background.src='./assets/tyres/tyre.bg.png';background.alt='';background.width=36;background.height=36;const ring=safeNode('span',undefined,'compound-ring'),text=safeNode('b',letter,'compound-letter');text.setAttribute('aria-hidden','true');icon.append(background,ring,text);return icon;
}
function setSignupMode(next){
 signingUp=next;$('signup-name-label').hidden=!next;$('signup-name').required=next;
 $('password').autocomplete=next?'new-password':'current-password';
 $('auth-title').textContent=next?'Create driver account':'Driver sign in';
 $('sign-in').textContent=next?'Create account':'Sign in';
 $('signup-toggle').textContent=next?'Already have an account? Sign in':'Create a driver account';
 authMessage(next?'Create an account to view race telemetry. Admin approval is only required for race controls.':'Ready to sign in.');
}
$('signup-toggle').onclick=()=>setSignupMode(!signingUp);
$('guest').onclick=async()=>{
 if(!client)return;$('guest').disabled=true;
 try{
   await signOut();const g=++generation;
   member={display_name:'Guest',role:'guest',approved:false,guest:true};demo=false;
   $('login').hidden=true;$('dashboard').hidden=false;$('sign-out').textContent='Exit guest';
   $('welcome').textContent='Guest viewing · live race data. Sign in as an approved admin to use race controls.';
   await startFlags(client,false,null);if(g!==generation){await stopFlags();return}
   await refreshRaces();
 }catch(e){await signOut();authMessage('Could not open guest viewing. '+e.message)}
 finally{$('guest').disabled=!client}
};
function authMessage(text){$('auth-message').textContent=text}
function resetView(){$('series-mark').src='./assets/teams/f1-2026.png';$('series-mark').alt='Formula 1';$('series-mark').className='f1-mark';gridChanges.reset();movementBadges.clear();$('stat-grid').textContent='—';$('stat-sharing').textContent='—';$('stat-lap').textContent='—';$('track-map').replaceChildren();$('receiver-panel').hidden=true;snapshot=null;selected=null;$('rows').replaceChildren();$('detail').replaceChildren(safeNode('p','Select a driver to see car details.'));$('driver-count').textContent='';$('empty').hidden=false;$('empty').textContent='Waiting for telemetry…';$('race-description').textContent='Waiting for receiver';status();}
async function detach(){const old=channel;channel=null;if(old&&client)await client.removeChannel(old)}
function status(){for(const [node,until] of movementBadges)node.hidden=Date.now()>=until||!snapshot||feedState(snapshot,race,Date.now(),demo)!==(demo?'DEMO DATA':'LIVE');const period=safetyPeriod(snapshot,race,Date.now(),demo);$('safety-banner').hidden=!period;$('race-surface').classList.toggle('safety-active',!!period);$('safety-code').textContent=period?.code||'';$('safety-label').textContent=period?.label||'';$('safety-message').textContent=period?.message||'';$('race-surface').classList.toggle('local-yellow',!!period?.local);const label=feedState(snapshot,race,Date.now(),demo);$('feed').textContent=label;$('feed').classList.toggle('green',label==='LIVE');$('freshness').textContent=snapshot?'Last snapshot: '+new Date(snapshot.received_at).toLocaleTimeString():'No telemetry received';$('transport').textContent=demo?'Simulation · not a real race':transport;$('notice').textContent=demo?'DESIGN DEMO — fictional names and simulated values.':label.startsWith('STALE')?'Receiver data is stale. Values below are the last known readings.':label==='RACE FINISHED'?'Race finished. Showing the last stored snapshot.':''}
function render(){
  status();const rows=Array.isArray(snapshot?.data?.drivers)?snapshot.data.drivers:[];const q=$('search').value.toLowerCase();
  const f2=rows.some(d=>teamFor(d.team_id).series==='F2');$('series-mark').src='./assets/teams/'+(f2?'f2-2026.png':'f1-2026.png');$('series-mark').alt=f2?'Formula 2':'Formula 1';$('series-mark').className='f1-mark'+(f2?' f2-mark':'');
  $('driver-count').textContent=' / '+rows.length+' drivers';
  $('stat-grid').textContent=rows.length||'—';$('stat-sharing').textContent=rows.length?rows.filter(d=>d.telemetry_public).length+' / '+rows.length:'—';
  const leader=rows.find(d=>d.position===1);$('stat-lap').textContent=leader?.lap?leader.lap+(snapshot?.data?.total_laps?' / '+snapshot.data.total_laps:''):'—';
  $('track-map').replaceChildren(renderTrackMap(snapshot?.data,{selected,onSelect:slot=>{selected=slot;render()},race,stale:feedState(snapshot,race,Date.now(),demo).startsWith('STALE'),demo}));
  const visible=rows.filter(d=>(driverName(d,race)+' '+teamFor(d.team_id).name).toLowerCase().includes(q)).sort((a,b)=>(a.position||99)-(b.position||99));
  movementBadges.clear();$('rows').replaceChildren();$('empty').hidden=visible.length>0;
  $('empty').textContent=rows.length?'No drivers match your search.':'No race data yet. The host must start the receiver.';
  for(const d of visible){
    const team=teamFor(d.team_id);const tr=safeNode('tr');tr.className='team-row';setTeamColors(tr,team);tr.tabIndex=0;tr.setAttribute('role','button');tr.setAttribute('aria-label','Inspect '+driverName(d,race)+' · '+team.name);tr.dataset.slot=d.slot;
    if(d.slot===selected)tr.className+=' selected';
    const alert=damageAlert(d);if(alert){tr.className+=' damage-'+alert.level;tr.title=(alert.level==='major'?'Major':'Minor')+' damage · '+alert.percent.toFixed(1)+'% maximum';tr.setAttribute('aria-label','Inspect '+driverName(d,race)+' · '+team.name+' · '+tr.title)}
    const identity=safeNode('td');identity.className='driver-identity';
    const wrap=safeNode('div',undefined,'identity-wrap'),copy=safeNode('div',undefined,'identity-copy');
    const nameLine=safeNode('span',undefined,'driver-name-line');nameLine.append(safeNode('b',driverName(d,race)));const penalty=penaltyLabel(d.penalties);if(penalty){const badge=safeNode('span',penalty,'penalty-badge');badge.setAttribute('aria-label',d.penalties+' second time penalty');nameLine.append(badge)}
    if(inPitLane(d)){const pit=safeNode('span','PIT','pit-badge');pit.setAttribute('aria-label','In pit lane');nameLine.append(pit)}
    copy.append(nameLine,safeNode('small',team.name+' · #'+(d.race_number??'—'),'team-name'),safeNode('small',({1:'PC · Steam',3:'PlayStation',4:'Xbox',6:'PC · EA'}[d.platform]||'Platform unknown'),'platform-label'));
    wrap.append(teamMark(team),copy);identity.append(wrap);
    const tyreCell=safeNode('td',undefined,'compound-cell');tyreCell.append(compoundBadge(d.compound),safeNode('span',reading(d.tyre_age,'L'),'tyre-age'));
    const energyCell=safeNode('td',undefined,'energy-cell');energyCell.append(safeNode('span',energy(d)));if(d.telemetry_public===true&&d.status_stale!==true&&d.deploy_mode===3){const boost=safeNode('span','BOOST','boost-active');boost.setAttribute('aria-label','Boost deployment active');energyCell.append(boost)}
    const positionCell=safeNode('td',undefined,'position-cell');positionCell.append(safeNode('span',d.position||'—'));const change=gridChanges.get(d.slot);if(change&&feedState(snapshot,race,Date.now(),demo)===(demo?'DEMO DATA':'LIVE')){const up=change.delta>0,badge=safeNode('span',(up?'↑':'↓')+Math.abs(change.delta),'position-change '+(up?'position-up':'position-down'));badge.title=(up?'Gained ':'Lost ')+Math.abs(change.delta)+' position'+(Math.abs(change.delta)===1?'':'s');badge.setAttribute('aria-label',badge.title);movementBadges.set(badge,change.until);positionCell.append(badge)}
    tr.append(positionCell,identity,safeNode('td',d.lap??'—'),safeNode('td',d.position===1?'LEADER':reading(typeof d.gap_ms==='number'?d.gap_ms/1000:null,'s',3)),safeNode('td',lapTime(d.last_lap_ms)),tyreCell,energyCell,safeNode('td',d.telemetry_public?reading(d.fuel_kg,' kg',1):'Private'));
    const choose=()=>{selected=d.slot;render()};tr.onclick=choose;tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}};
    $('rows').append(tr);
  }
  if(selected===null&&rows.length){selected=rows[0].slot;render();return}
  const d=rows.find(d=>d.slot===selected);if(!d){$('detail').replaceChildren(safeNode('p','Select a driver to see car details.'));return}
  const detail=$('detail');setTeamColors(detail,teamFor(d.team_id));detail.replaceChildren(safeNode('div','DRIVER TELEMETRY','eyebrow'));
  const team=teamFor(d.team_id),head=safeNode('div',undefined,'driver');
  head.append(teamMark(team,'detail-team-mark'));const h=safeNode('div'),heading=safeNode('h2',driverName(d,race));const penalty=penaltyLabel(d.penalties);if(penalty){const badge=safeNode('span',penalty,'penalty-badge');badge.setAttribute('aria-label',d.penalties+' second time penalty');heading.append(badge)}if(inPitLane(d)){const pit=safeNode('span','PIT','pit-badge');pit.setAttribute('aria-label','In pit lane');heading.append(pit)}h.append(heading,safeNode('p',team.name+' · Car #'+(d.race_number??'—'),'team-name'));head.append(h);detail.append(head);
  const context=safeNode('div',undefined,'driver-context');context.append(safeNode('span','P'+(d.position||'—')),safeNode('span',inPitLane(d)?'In pit lane':'On track'));detail.append(context);
  const compoundInfo=safeNode('div',undefined,'detail-compound');compoundInfo.append(compoundBadge(d.compound),safeNode('span','Tyre age · '+reading(d.tyre_age,' laps')));detail.append(compoundInfo);
  detail.append(renderCar(d));
  const metric=(name,value)=>{const n=safeNode('div',undefined,'metric');n.append(safeNode('span',name),safeNode('b',value));detail.append(n)};
  metric('Last lap',lapTime(d.last_lap_ms));metric('Speed',reading(d.speed_kph,' km/h'));metric('Sector 1',lapTime(d.sector1_ms));metric('Sector 2',lapTime(d.sector2_ms));metric('Penalties',reading(d.penalties,'s'));
  detail.append(safeNode('div','Tyre wear · percentage used','sectiontitle'));const wheels=safeNode('div',undefined,'wheels');
  for(const [j,name] of [[2,'FL'],[3,'FR'],[0,'RL'],[1,'RR']]){const n=safeNode('div',undefined,'wheel');n.append(safeNode('span',name),safeNode('b',d.telemetry_public?reading(d.wear?.[j],'%',1):'Private'));wheels.append(n)}detail.append(wheels);
  detail.append(safeNode('div','Energy & fuel','sectiontitle'));metric('ERS battery',energy(d));metric('Deploy mode',d.telemetry_public?({0:'None',1:'Medium',2:'Hotlap',3:'Boost'}[d.deploy_mode]||'—'):'Private');metric('Overtake',d.overtake_active===null||d.overtake_active===undefined?'—':d.overtake_active?'Active':'Inactive');metric('Fuel',d.telemetry_public?reading(d.fuel_kg,' kg',1):'Private');metric('Fuel laps (game estimate)',d.telemetry_public?reading(d.fuel_laps,'',2):'Private');
  detail.append(safeNode('div','Car damage','sectiontitle'));for(const [key,name] of Object.entries({front_left:'Front left wing',front_right:'Front right wing',rear:'Rear wing',floor:'Floor',engine:'Engine'}))metric(name,d.telemetry_public?reading(d.damage?.[key],'%'):'Private');
  if(!d.telemetry_public)detail.append(safeNode('p','Driver telemetry is private. Ask the driver to enable Public sharing.'));
}
function apply(next,g){if(g!==generation||!race||next?.session_id!==race.id||!acceptsSnapshot(snapshot,next))return;gridChanges.update(next);snapshot=next;render()}
async function readSnapshot(g=generation){if(!client||!member||!race||demo)return;const id=race.id;const {data,error}=await client.from('f7r_snapshots').select('*').eq('session_id',id).maybeSingle();if(g!==generation)return;if(error){transport='Snapshot read failed';$('notice').textContent='Could not load race data. Check connection and membership.';return}if(data)apply(data,g)}
async function chooseRace(id){
  const g=++generation;await detach();if(g!==generation)return;race=races.find(r=>r.id===id)||null;resetView();
  $('race-title').textContent=demo?race?.title:'F7R live telemetry';if(!race)return;
  $('race-description').textContent='Automatic race feed · PC / PlayStation / Xbox';
  if(member?.telemetryUnavailable){transport='Telemetry setup required';$('notice').textContent='Flag controls are ready. Run the dashboard setup SQL to enable telemetry.';return}
  if(demo){snapshot={session_id:race.id,received_at:new Date().toISOString(),frame:1,data:demoMapData()};render();return}
  channel=client.channel('f7r-race-'+id+'-'+g).on('postgres_changes',{event:'*',schema:'public',table:'f7r_snapshots',filter:'session_id=eq.'+id},payload=>apply(payload.new,g)).subscribe(s=>{if(g!==generation)return;transport=s==='SUBSCRIBED'?'Live connection':'Reconnecting · polling fallback';status();if(s==='SUBSCRIBED')readSnapshot(g)});
  await readSnapshot(g);await refreshReceiver();
}
async function refreshRaces(){
 if(refreshing||demo||!client||!member)return;
 if(member.telemetryUnavailable){$('race-title').textContent='Telemetry setup required';$('notice').textContent='Flags are available. Run dashboard-01-setup.sql to enable telemetry.';return}
 refreshing=true;const g=generation;
 try{
  const {data,error}=await client.from('f7r_sessions').select('*').order('created_at',{ascending:false}).limit(50);
  if(g!==generation)return;if(error)throw error;races=data||[];
  const live=races.filter(r=>r.status==='live');let stamps=[];
  if(live.length){const result=await client.from('f7r_snapshots').select('session_id,received_at').in('session_id',live.map(r=>r.id)).order('received_at',{ascending:false}).limit(50);if(result.error)throw result.error;stamps=result.data||[]}
  if(g!==generation)return;
  const next=currentLiveRace(races,stamps);
  if(next){if(next.id!==race?.id)await chooseRace(next.id);else{Object.assign(race,next);await refreshReceiver()}}
  else{race=null;resetView();$('race-title').textContent='Waiting for the race host';$('empty').textContent='The live grid will appear automatically when the host connects.'}
 }catch(e){$('notice').textContent='Could not refresh the live feed: '+e.message}
 finally{refreshing=false}
}
async function signOut(){
  ++generation;isReceiverAdmin=false;member=null;race=null;demo=false;await stopFlags();$('flags').hidden=true;$('sign-out').textContent='Sign out';await detach();resetView();$('dashboard').hidden=true;$('connection').hidden=true;$('login').hidden=false;
  if(client){const {error}=await client.auth.signOut({scope:'local'});if(error)authMessage('Signed out of this view; session cleanup failed. Reload before signing in again.');else authMessage('Signed out.')}
}
$('login-form').onsubmit=async e=>{
  e.preventDefault();if(!client)return;const g=++generation,createAccount=signingUp;$('sign-in').disabled=true;authMessage(createAccount?'Creating your account…':'Signing in…');
  try{
    let response;
    if(createAccount){
      const displayName=$('signup-name').value.trim();
      if(!displayName||displayName.length>64)throw Error('Enter your driver name, up to 64 characters.');
      if($('password').value.length<8)throw Error('Choose a password with at least 8 characters.');
      response=await client.auth.signUp({email:$('email').value.trim(),password:$('password').value,options:{data:{display_name:displayName}}});
    }else response=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
    $('password').value='';const {data,error}=response;if(error)throw error;if(g!==generation)return;
    if(createAccount&&!data.session){setSignupMode(false);authMessage('Check your email for a confirmation link, then return here to sign in. If you already have an account, sign in with it.');return}

    // The existing flag_admins table, never dashboard role or user metadata, controls flag access.
    const adminAccess=await client.from('flag_admins').select('user_id').eq('user_id',data.user.id).maybeSingle();
    if(g!==generation)return;
    const isFlagAdmin=!adminAccess.error&&!!adminAccess.data;isReceiverAdmin=isFlagAdmin;
    const access=await client.from('f7r_members').select('display_name,role,approved').eq('user_id',data.user.id).maybeSingle();
    if(g!==generation)return;
    // Account metadata is used only for display, never to authorize admin/publisher access.
    const displayName=typeof data.user.user_metadata?.display_name==='string'?data.user.user_metadata.display_name.slice(0,64):'Driver';
    member=access.data?.approved?access.data:{display_name:isFlagAdmin?'Race admin':displayName,role:isFlagAdmin?'admin':'driver',approved:isFlagAdmin};
    member.telemetryUnavailable=!!access.error;demo=false;$('sign-out').textContent='Sign out';
    $('login').hidden=true;$('dashboard').hidden=false;$('welcome').textContent='Welcome, '+member.display_name+'. You are watching the shared F7R race feed.';
    await startFlags(client,isFlagAdmin,data.user.id);
    if(g!==generation){await stopFlags();return}
    await refreshRaces();

  }catch(e){authMessage(e.message)}finally{$('sign-in').disabled=!client}
};
$('sign-out').onclick=signOut;$('search').oninput=render;
$('setup-tab').onclick=()=>{$('flags').hidden=true;$('flags-tab').classList.remove('active');$('login').hidden=true;$('dashboard').hidden=true;$('connection').hidden=false;$('setup-tab').classList.add('active');$('live-tab').classList.remove('active')};
function showLive(){$('flags').hidden=true;$('flags-tab').classList.remove('active');$('connection').hidden=true;$('dashboard').hidden=!(member||demo);$('login').hidden=!!(member||demo);$('setup-tab').classList.remove('active');$('live-tab').classList.add('active')}
$('live-tab').onclick=showLive;$('back').onclick=showLive;
function demoDrivers(){
 const names=['Apex','Vortex','Phoenix','Storm','Nova','Ghost','Falcon','Blaze','Echo','Drift','Raven','Pulse','Atlas','Comet','Frost','Rogue','Viper','Orion','Titan','Zenith','Shadow','Spark'];
 const teams=[484,477,476,480,481,479,485,482,483,486,478];
 return names.map((n,i)=>({slot:i,name:i===21?null:'F7R '+n,team_id:teams[i%11],race_number:10+i,platform:[1,3,4][i%3],position:i+1,lap:18,last_lap_ms:87182+i*73,sector1_ms:28000,sector2_ms:30000,gap_ms:i*1742,compound:[17,16,18][i%3],tyre_age:5+i%10,ers_percent:i===21?null:Math.max(12,86-i*3),deploy_mode:i===21?null:i===2?3:1,fuel_kg:i===21?null:21.4+i*.3,fuel_laps:i===21?null:8.3,wear:i===21?null:[18+i,20+i,21+i,23+i],damage:i===21?null:{front_left:i===0?12:0,front_right:i===1?42:0,rear:0,floor:i===3?8:0,engine:0},telemetry_public:i!==21,penalties:i===1?3:i===3?5:0,speed_kph:285,pit_status:0}));
}
$('demo').onclick=async()=>{++generation;await stopFlags();$('flags').hidden=true;await detach();demo=true;member=null;races=[{id:'demo',title:'British Grand Prix · design demo',status:'live',game_format:2026}];$('login').hidden=true;$('dashboard').hidden=false;$('sign-out').textContent='Exit demo';$('welcome').textContent='Fictional data for exploring the dashboard.';await chooseRace('demo')};
setInterval(async()=>{status();if(demo&&snapshot){snapshot.received_at=new Date().toISOString();snapshot.data.drivers.forEach(d=>d.ers_percent=Math.max(5,Math.min(100,d.ers_percent+Math.floor(Math.random()*7)-3)));render()}},1000);
setInterval(async()=>{if(polling||demo||!member||member.telemetryUnavailable)return;polling=true;try{await refreshRaces();await readSnapshot();render()}finally{polling=false}},5000);
async function start(){try{const response=await fetch('./config.json',{cache:'no-store'});if(!response.ok)throw Error('Missing config.json');const c=await response.json();if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.supabase_url)||!c.supabase_publishable_key?.startsWith('sb_publishable_'))throw Error('Set the Supabase project URL and publishable key in config.json.');if(!window.supabase)throw Error('Sign-in library did not load. Check your internet connection.');client=window.supabase.createClient(c.supabase_url,c.supabase_publishable_key,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}});client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'&&member&&!member.guest)setTimeout(signOut,0)});$('sign-in').disabled=false;$('guest').disabled=false;authMessage('Ready to sign in or continue as guest.')}catch(e){authMessage(e.message)}}start();

async function showFlags(){
 if(demo)await signOut();
 if(!member){$('auth-message').textContent='Sign in with your F7R account to view live flags. Admin approval is required to send signals.';showLive();return}
 $('login').hidden=true;$('dashboard').hidden=true;$('connection').hidden=true;$('flags').hidden=false;
 $('flags-tab').classList.add('active');$('live-tab').classList.remove('active');$('setup-tab').classList.remove('active');
}
$('flags-tab').onclick=showFlags;$('banner-flags').onclick=showFlags;$('flags-logout').onclick=signOut;


async function refreshReceiver(){
 const id=race?.id,g=generation;
 $('receiver-panel').hidden=!isReceiverAdmin||demo||!id;
 if(!isReceiverAdmin||demo||!id||receiverReadBusy)return;
 receiverReadBusy=true;
 try{
  const [control,health]=await Promise.all([
   client.from('f7r_receiver_controls').select('enabled').eq('session_id',id).maybeSingle(),
   client.from('f7r_receiver_status').select('*').eq('session_id',id).maybeSingle()
  ]);
  if(g!==generation||race?.id!==id)return;
  if(control.error||health.error)throw Error('Could not check receiver connection.');
  receiverEnabled=control.data?.enabled===true;
  $('receiver-toggle').textContent=receiverEnabled?'Stop live telemetry':'Start live telemetry';
  $('receiver-toggle').disabled=receiverWriteBusy||race.status!=='live';
  const h=health.data,online=h&&Date.now()-Date.parse(h.last_seen)<20000;
  $('receiver-status').textContent=!online?'Receiver offline · open START-F7R-RECEIVER on your laptop':!receiverEnabled?'Receiver connected · telemetry paused':h.state==='publishing'?'Live · '+h.driver_count+' drivers':h.state==='paused'?'Start requested · waiting for receiver':h.state==='waiting'?'Receiver connected · waiting for game':h.state==='stale'?'Game feed interrupted':'Receiver error · check the laptop window';
 }catch(e){if(g===generation){$('receiver-status').textContent=e.message;$('receiver-toggle').disabled=true;}}
 finally{receiverReadBusy=false;}
}
$('receiver-toggle').onclick=async()=>{
 if(!isReceiverAdmin||!race||demo||receiverWriteBusy)return;
 const id=race.id,g=generation;receiverWriteBusy=true;$('receiver-toggle').disabled=true;
 try{
  const {error}=await client.from('f7r_receiver_controls').upsert({session_id:id,enabled:!receiverEnabled},{onConflict:'session_id'});
  if(error)throw error;
 }catch{if(g===generation)$('receiver-status').textContent='Control was not saved. Check your admin access and connection.';}
 finally{receiverWriteBusy=false;if(g===generation)await refreshReceiver();}
};
setInterval(refreshReceiver,3000);

function demoMapData(){
 const points=Array.from({length:192},(_,i)=>{const a=i/192*Math.PI*2,r=900+180*Math.sin(a*3)+90*Math.cos(a*7);return {i,x:Math.cos(a)*r,z:Math.sin(a)*r*.65}});
 const drivers=demoDrivers().map((d,i)=>({...d,world_position:{x:points[i*8].x,z:points[i*8].z},motion_stale:false}));
 return {format:2026,track_id:7,track_map:{bins:192,points},drivers};
}
