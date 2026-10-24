import {lapTime,reading,driverName,energy,feedState,acceptsSnapshot,damageAlert,penaltyLabel} from './model.js?v=0.5.1';
import {renderCar} from './car-view.js?v=0.4.1';
import {teamFor} from './teams.js?v=0.3.1';
import {startFlags,stopFlags} from './flag-view.js';
const $=id=>document.getElementById(id);
let client=null,member=null,races=[],race=null,snapshot=null,channel=null,selected=null,demo=false,generation=0,polling=false,refreshing=false,transport='Not connected';
const safeNode=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
function setTeamColors(node,team){node.style.setProperty('--team-color',team.color);node.style.setProperty('--team-accent',team.accent);node.style.setProperty('--team-wash',team.color+'20');node.style.setProperty('--team-wash-strong',team.color+'38')}
function teamMark(team,extra=''){
 const wrap=safeNode('span',undefined,'team-mark '+extra);
 if(team.logo){const img=safeNode('img');img.src='./assets/teams/'+team.logo;img.alt=team.name+' logo';img.width=38;img.height=38;wrap.append(img)}
 else{wrap.append(safeNode('span',team.key==='unknown'?'?':team.name==='Red Bull Racing'?'RBR':team.name.slice(0,3).toUpperCase(),'team-monogram'));wrap.setAttribute('aria-label',team.name)}
 return wrap;
}
function compoundBadge(code){
 const types={16:['S','Soft','#ff4d62'],17:['M','Medium','#ffda55'],18:['H','Hard','#f3f5fa'],7:['I','Intermediate','#6cdd99'],8:['W','Wet','#62adff']};
 const [letter,label,color]=types[code]||['—','Unknown','#8d99ad'];
 const icon=safeNode('span',undefined,'compound-icon');icon.style.setProperty('--compound-color',color);icon.setAttribute('role','img');icon.setAttribute('aria-label',label+' tyre');icon.title=label+' tyre';
 const background=safeNode('img');background.src='./assets/tyres/tyre.bg.png';background.alt='';background.width=36;background.height=36;const ring=safeNode('span',undefined,'compound-ring'),text=safeNode('b',letter,'compound-letter');text.setAttribute('aria-hidden','true');icon.append(background,ring,text);return icon;
}
function authMessage(text){$('auth-message').textContent=text}
function resetView(){snapshot=null;selected=null;$('rows').replaceChildren();$('detail').replaceChildren(safeNode('p','Select a driver to see car details.'));$('driver-count').textContent='';$('empty').hidden=false;$('empty').textContent='Waiting for telemetry…';$('race-description').textContent='Waiting for receiver';status();}
async function detach(){const old=channel;channel=null;if(old&&client)await client.removeChannel(old)}
function status(){const label=feedState(snapshot,race,Date.now(),demo);$('feed').textContent=label;$('feed').classList.toggle('green',label==='LIVE');$('freshness').textContent=snapshot?'Last snapshot: '+new Date(snapshot.received_at).toLocaleTimeString():'No telemetry received';$('transport').textContent=demo?'Simulation · not a real race':transport;$('notice').textContent=demo?'DESIGN DEMO — fictional names and simulated values.':label.startsWith('STALE')?'Receiver data is stale. Values below are the last known readings.':label==='RACE FINISHED'?'Race finished. Showing the last stored snapshot.':''}
function render(){
  status();const rows=Array.isArray(snapshot?.data?.drivers)?snapshot.data.drivers:[];const q=$('search').value.toLowerCase();
  $('driver-count').textContent=' / '+rows.length+' drivers';
  const visible=rows.filter(d=>(driverName(d,race)+' '+teamFor(d.team_id).name).toLowerCase().includes(q)).sort((a,b)=>(a.position||99)-(b.position||99));
  $('rows').replaceChildren();$('empty').hidden=visible.length>0;
  $('empty').textContent=rows.length?'No drivers match your search.':'No race data yet. The host must start the receiver.';
  for(const d of visible){
    const team=teamFor(d.team_id);const tr=safeNode('tr');tr.className='team-row';setTeamColors(tr,team);tr.tabIndex=0;tr.setAttribute('role','button');tr.setAttribute('aria-label','Inspect '+driverName(d,race)+' · '+team.name);tr.dataset.slot=d.slot;
    if(d.slot===selected)tr.className+=' selected';
    const alert=damageAlert(d);if(alert){tr.className+=' damage-'+alert.level;tr.title=(alert.level==='major'?'Major':'Minor')+' damage · '+alert.percent.toFixed(1)+'% maximum';tr.setAttribute('aria-label','Inspect '+driverName(d,race)+' · '+team.name+' · '+tr.title)}
    const identity=safeNode('td');identity.className='driver-identity';
    const wrap=safeNode('div',undefined,'identity-wrap'),copy=safeNode('div',undefined,'identity-copy');
    const nameLine=safeNode('span',undefined,'driver-name-line');nameLine.append(safeNode('b',driverName(d,race)));const penalty=penaltyLabel(d.penalties);if(penalty){const badge=safeNode('span',penalty,'penalty-badge');badge.setAttribute('aria-label',d.penalties+' second time penalty');nameLine.append(badge)}
    copy.append(nameLine,safeNode('small',team.name+' · #'+(d.race_number??'—'),'team-name'),safeNode('small',({1:'PC · Steam',3:'PlayStation',4:'Xbox',6:'PC · EA'}[d.platform]||'Platform unknown'),'platform-label'));
    wrap.append(teamMark(team),copy);identity.append(wrap);
    const tyreCell=safeNode('td',undefined,'compound-cell');tyreCell.append(compoundBadge(d.compound),safeNode('span',reading(d.tyre_age,'L'),'tyre-age'));
    tr.append(safeNode('td',d.position||'—'),identity,safeNode('td',d.lap??'—'),safeNode('td',d.position===1?'LEADER':reading(typeof d.gap_ms==='number'?d.gap_ms/1000:null,'s',3)),safeNode('td',lapTime(d.last_lap_ms)),tyreCell,safeNode('td',energy(d)+(d.deploy_mode===3?' · BOOST':'')),safeNode('td',d.telemetry_public?reading(d.fuel_kg,' kg',1):'Private'));
    const choose=()=>{selected=d.slot;render()};tr.onclick=choose;tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}};
    $('rows').append(tr);
  }
  if(selected===null&&rows.length){selected=rows[0].slot;render();return}
  const d=rows.find(d=>d.slot===selected);if(!d){$('detail').replaceChildren(safeNode('p','Select a driver to see car details.'));return}
  const detail=$('detail');setTeamColors(detail,teamFor(d.team_id));detail.replaceChildren(safeNode('div','DRIVER TELEMETRY','eyebrow'));
  const team=teamFor(d.team_id),head=safeNode('div',undefined,'driver');
  head.append(teamMark(team,'detail-team-mark'));const h=safeNode('div'),heading=safeNode('h2',driverName(d,race));const penalty=penaltyLabel(d.penalties);if(penalty){const badge=safeNode('span',penalty,'penalty-badge');badge.setAttribute('aria-label',d.penalties+' second time penalty');heading.append(badge)}h.append(heading,safeNode('p',team.name+' · Car #'+(d.race_number??'—'),'team-name'));head.append(h);detail.append(head);
  const context=safeNode('div',undefined,'driver-context');context.append(safeNode('span','P'+(d.position||'—')),safeNode('span',d.pit_status?'In pit lane':'On track'));detail.append(context);
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
function apply(next,g){if(g!==generation||!race||next?.session_id!==race.id||!acceptsSnapshot(snapshot,next))return;snapshot=next;render()}
async function readSnapshot(g=generation){if(!client||!member||!race||demo)return;const id=race.id;const {data,error}=await client.from('f7r_snapshots').select('*').eq('session_id',id).maybeSingle();if(g!==generation)return;if(error){transport='Snapshot read failed';$('notice').textContent='Could not load race data. Check connection and membership.';return}if(data)apply(data,g)}
async function chooseRace(id){
  const g=++generation;await detach();if(g!==generation)return;race=races.find(r=>r.id===id)||null;resetView();
  $('race-title').textContent=race?.title||'No races available';if(!race)return;
  $('race-description').textContent='UDP '+race.game_format+' · '+race.status;
  if(member?.telemetryUnavailable){transport='Telemetry setup required';$('notice').textContent='Flag controls are ready. Run the dashboard setup SQL to enable telemetry.';return}
  if(demo){snapshot={session_id:race.id,received_at:new Date().toISOString(),frame:1,data:{drivers:demoDrivers()}};render();return}
  channel=client.channel('f7r-race-'+id+'-'+g).on('postgres_changes',{event:'*',schema:'public',table:'f7r_snapshots',filter:'session_id=eq.'+id},payload=>apply(payload.new,g)).subscribe(s=>{if(g!==generation)return;transport=s==='SUBSCRIBED'?'Live connection':'Reconnecting · polling fallback';status();if(s==='SUBSCRIBED')readSnapshot(g)});
  await readSnapshot(g);
}
async function refreshRaces(){
  if(refreshing||demo||!client||!member)return;if(member.telemetryUnavailable){$('race-title').textContent='Telemetry setup required';$('notice').textContent='Your existing flag system is available in Flags. Run dashboard-01-setup.sql for live telemetry.';return}refreshing=true;const g=generation;
  try{const {data,error}=await client.from('f7r_sessions').select('*').order('created_at',{ascending:false}).limit(50);if(g!==generation)return;if(error)throw error;races=data||[];const id=races.find(r=>r.id===race?.id)?.id||races.find(r=>r.status==='live')?.id||races[0]?.id;$('race-select').replaceChildren(...races.map(r=>{const n=safeNode('option',r.title+' · '+r.status);n.value=r.id;return n}));if(id){$('race-select').value=id;await chooseRace(id)}else{race=null;resetView();$('race-title').textContent='No F7R races yet';$('empty').textContent='Your F7R admin needs to create the first race.'}}
  catch(e){$('notice').textContent='Could not load races: '+e.message}
  finally{refreshing=false}
}
async function signOut(){
  ++generation;member=null;race=null;demo=false;await stopFlags();$('flags').hidden=true;$('sign-out').textContent='Sign out';await detach();resetView();$('dashboard').hidden=true;$('connection').hidden=true;$('login').hidden=false;
  if(client){const {error}=await client.auth.signOut({scope:'local'});if(error)authMessage('Signed out of this view; session cleanup failed. Reload before signing in again.');else authMessage('Signed out.')}
}
$('login-form').onsubmit=async e=>{
  e.preventDefault();if(!client)return;const g=++generation;$('sign-in').disabled=true;authMessage('Signing in…');
  try{const {data,error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});$('password').value='';if(error)throw error;if(g!==generation)return;
    // The existing flag_admins table, never dashboard role or user metadata, controls flag access.
    const adminAccess=await client.from('flag_admins').select('user_id').eq('user_id',data.user.id).maybeSingle();
    if(g!==generation)return;
    const isFlagAdmin=!adminAccess.error&&!!adminAccess.data;
    const access=await client.from('f7r_members').select('display_name,role,approved').eq('user_id',data.user.id).maybeSingle();
    if(g!==generation)return;
    if(!access.data?.approved&&!isFlagAdmin){
      await client.auth.signOut({scope:'local'});
      throw Error(access.error?'Telemetry setup is not ready. Ask your F7R admin to run the dashboard setup query.':'Your account is awaiting F7R approval.');
    }
    member=access.data?.approved?access.data:{display_name:'Race admin',role:'admin',approved:true};
    member.telemetryUnavailable=!!access.error;demo=false;$('sign-out').textContent='Sign out';
    $('login').hidden=true;$('dashboard').hidden=false;$('welcome').textContent='Welcome, '+member.display_name+'. Choose telemetry or flags.';
    await startFlags(client,isFlagAdmin,data.user.id);
    if(g!==generation){await stopFlags();return}
    await refreshRaces();

  }catch(e){authMessage(e.message)}finally{$('sign-in').disabled=!client}
};
$('sign-out').onclick=signOut;$('search').oninput=render;$('refresh').onclick=refreshRaces;$('race-select').onchange=()=>chooseRace($('race-select').value);
$('setup-tab').onclick=()=>{$('flags').hidden=true;$('flags-tab').classList.remove('active');$('login').hidden=true;$('dashboard').hidden=true;$('connection').hidden=false;$('setup-tab').classList.add('active');$('live-tab').classList.remove('active')};
function showLive(){$('flags').hidden=true;$('flags-tab').classList.remove('active');$('connection').hidden=true;$('dashboard').hidden=!(member||demo);$('login').hidden=!!(member||demo);$('setup-tab').classList.remove('active');$('live-tab').classList.add('active')}
$('live-tab').onclick=showLive;$('back').onclick=showLive;
function demoDrivers(){
 const names=['Apex','Vortex','Phoenix','Storm','Nova','Ghost','Falcon','Blaze','Echo','Drift','Raven','Pulse','Atlas','Comet','Frost','Rogue','Viper','Orion','Titan','Zenith','Shadow','Spark'];
 const teams=[484,477,476,480,481,479,485,482,483,486,478];
 return names.map((n,i)=>({slot:i,name:i===21?null:'F7R '+n,team_id:teams[i%11],race_number:10+i,platform:[1,3,4][i%3],position:i+1,lap:18,last_lap_ms:87182+i*73,sector1_ms:28000,sector2_ms:30000,gap_ms:i*1742,compound:[17,16,18][i%3],tyre_age:5+i%10,ers_percent:i===21?null:Math.max(12,86-i*3),deploy_mode:i===21?null:i===2?3:1,fuel_kg:i===21?null:21.4+i*.3,fuel_laps:i===21?null:8.3,wear:i===21?null:[18+i,20+i,21+i,23+i],damage:i===21?null:{front_left:i===0?12:0,front_right:i===1?42:0,rear:0,floor:i===3?8:0,engine:0},telemetry_public:i!==21,penalties:i===1?3:i===3?5:0,speed_kph:285,pit_status:0}));
}
$('demo').onclick=async()=>{++generation;await stopFlags();$('flags').hidden=true;await detach();demo=true;member=null;races=[{id:'demo',title:'British Grand Prix · design demo',status:'live',game_format:2026}];$('race-select').replaceChildren(new Option('Design demo','demo'));$('login').hidden=true;$('dashboard').hidden=false;$('sign-out').textContent='Exit demo';$('welcome').textContent='Fictional data for exploring the dashboard.';await chooseRace('demo')};
setInterval(async()=>{status();if(demo&&snapshot){snapshot.received_at=new Date().toISOString();snapshot.data.drivers.forEach(d=>d.ers_percent=Math.max(5,Math.min(100,d.ers_percent+Math.floor(Math.random()*7)-3)));render()}},1000);
setInterval(async()=>{if(polling||demo||!member||member.telemetryUnavailable)return;polling=true;try{await readSnapshot();if(race){const g=generation;const {data,error}=await client.from('f7r_sessions').select('status,driver_names').eq('id',race.id).maybeSingle();if(g!==generation)return;if(error||!data){await signOut();authMessage('Access ended or the race is unavailable.');return}Object.assign(race,data);render()}}finally{polling=false}},5000);
async function start(){try{const response=await fetch('./config.json',{cache:'no-store'});if(!response.ok)throw Error('Missing config.json');const c=await response.json();if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.supabase_url)||!c.supabase_publishable_key?.startsWith('sb_publishable_'))throw Error('Set the Supabase project URL and publishable key in config.json.');if(!window.supabase)throw Error('Sign-in library did not load. Check your internet connection.');client=window.supabase.createClient(c.supabase_url,c.supabase_publishable_key,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}});client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'&&member)setTimeout(signOut,0)});$('sign-in').disabled=false;authMessage('Ready to sign in.')}catch(e){authMessage(e.message)}}start();

async function showFlags(){
 if(demo)await signOut();
 if(!member){$('auth-message').textContent='Sign in with your F7R account to view live flags. Admin approval is required to send signals.';showLive();return}
 $('login').hidden=true;$('dashboard').hidden=true;$('connection').hidden=true;$('flags').hidden=false;
 $('flags-tab').classList.add('active');$('live-tab').classList.remove('active');$('setup-tab').classList.remove('active');
}
$('flags-tab').onclick=showFlags;$('banner-flags').onclick=showFlags;$('flags-logout').onclick=signOut;

