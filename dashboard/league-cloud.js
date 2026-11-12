import {resolveTeam,styleTeamLogo} from './wec-logos.js?v=1';
import {TEAMS} from './teams.js?v=0.14.0';
const $=id=>document.getElementById(id);
const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
let client,current,sequence=0,canReadSync=false;
const cache=new Map();
const msg=text=>{$('archive-message').textContent=text;};
const points=v=>v?.formatted??v??'';
const time=v=>v||'—';
const color=v=>/^#[0-9a-f]{8}$/i.test(v||'')?'#'+v.slice(3):/^#[0-9a-f]{6}$/i.test(v||'')?v:'#7eb9ef';
const countryNames={England:'GB',UK:'GB','United Kingdom':'GB',Netherlands:'NL',Italy:'IT',Germany:'DE',France:'FR',Spain:'ES',Australia:'AU',Austria:'AT',Belgium:'BE',Brazil:'BR',Canada:'CA',China:'CN',Hungary:'HU',Japan:'JP',Mexico:'MX',Monaco:'MC',Portugal:'PT',Qatar:'QA',Singapore:'SG','Saudi Arabia':'SA',Bahrain:'BH','United States':'US',USA:'US','United Arab Emirates':'AE',UAE:'AE',Finland:'FI',Poland:'PL'};
function flag(country){const c=countryNames[country]||country;return /^[A-Z]{2}$/.test(c||'')?String.fromCodePoint(...[...c].map(c=>127397+c.charCodeAt(0)))+' ':'';}
function car(name,info){const n=el('span');n.className='archive-team';const team=resolveTeam(name,info);if(team?.logo){const img=el('img');img.src='./assets/teams/'+team.logo;img.alt=team.name+' logo';styleTeamLogo(img,team);n.append(img);}n.style.color=color(info?.primaryColor||team?.color);n.append(el('span',name||'—'));return n;}
function table(target,headers,rows){const wrap=el('div'),t=el('table');wrap.className='data-table';const h=t.createTHead().insertRow();headers.forEach(x=>h.append(el('th',x)));const b=t.createTBody();for(const row of rows){const tr=b.insertRow();for(const value of row){const td=tr.insertCell();value instanceof Node?td.append(value):td.textContent=value??'—';}}wrap.append(t);target.replaceChildren(wrap);}
function picker(n,items){n.replaceChildren(...items.map(([value,label])=>{const o=el('option',label);o.value=value;return o;}));}
function download(){if(!current)return;const u=URL.createObjectURL(new Blob([JSON.stringify(current,null,2)],{type:'application/json'}));const a=el('a');a.href=u;a.download='F7R-RLT-season-'+current.index.seasonId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function driverDetails(driver){const target=$('archive-driver-detail');target.replaceChildren(el('h3',driver.driverName||'Unnamed driver'),el('p',[driver.status,driver.classInfo?.name,driver.car?.carName].filter(Boolean).join(' · ')));table(target.appendChild(el('div')),['Lap','Time','S1','S2','S3','Tyre','Position','Valid'],(driver.laps||[]).map(l=>[l.lapNumber,time(l.lapTime),time(l.sector1Time),time(l.sector2Time),time(l.sector3Time),l.tyreCompound||'—',l.positionAfterLap||'—',l.isValid==null?'—':l.isValid?'Yes':'No']));if(!driver.laps?.length)target.append(el('p','No lap-by-lap records were available from RLT for this driver.'));}
function renderSession(){const event=current.events[Number($('archive-event').value)],s=event?.sessions[Number($('archive-session').value)];$('archive-driver-detail').replaceChildren();$('archive-session-note').textContent=s?[s.sessionInfo.sessionType,s.sessionInfo.completedStatus,s.sessionInfo.weatherType,s.sessionInfo.totalLaps&&s.sessionInfo.totalLaps+' laps'].filter(Boolean).join(' · '):'No sessions recorded.';table($('archive-results'),['Pos','Driver','Team / car','Class','Status','Grid','Laps','Fastest','Gap','Points','Game pen.','Steward pen.'],(s?.drivers||[]).map(d=>{const b=el('button',d.driverName||'Unnamed driver');b.onclick=()=>driverDetails(d);return[d.classificationPosition>0?d.classificationPosition:d.position||'—',b,car(d.team?.name||d.car?.carName,d.team),d.classInfo?.name||'—',d.status||'—',d.gridPosition||'—',d.lapsCompleted??'—',time(d.fastestLapTime),d.gap||'—',points(d.driverPoints),d.penalties?.inGamePenaltySeconds??'—',d.penalties?.stewardPenaltySeconds??'—'];}));}
function renderEvent(){const event=current.events[Number($('archive-event').value)];picker($('archive-session'),(event?.sessions||[]).map((s,i)=>[i,s.sessionInfo.sessionCaption||s.sessionInfo.sessionType]));renderSession();}
function render(){const i=current.index,stats=current.standings.seasonStatistics; $('archive-title').textContent=i.seasonName;$('archive-summary').textContent=(i.isArchive?'Archived':'Current')+' · '+(i.championshipName||'')+' · '+current.events.length+' events · imported '+new Date(current.importedAt).toLocaleString();
 const champion=stats.status?.isCompleted;const winners=(stats.driverStandings||[]).filter(d=>champion&&d.isChampionshipSecured&&d.position===1&&(d.points?.raw??0)>0);$('archive-honours').textContent=winners.map(d=>'🏆 '+d.driverName).join(' · ');
 table($('archive-standings'),['Pos','Driver','Team','Class','Points','Wins','Podiums','Poles','Fastest laps'],(stats.driverStandings||[]).map(d=>[d.position,d.driverName||'Unnamed driver',car(d.teamName,d.teamInfo),d.classInfo?.name||'—',points(d.points),d.positions?.wins??'—',d.positions?.podiums??'—',d.positions?.polePositions??'—',d.positions?.fastestLaps??'—']));
 table($('archive-constructors'),['Pos','Team','Points','Wins','Podiums'],(stats.teamStandings||[]).map(d=>[d.position,car(d.teamName,d.teamInfo),points(d.points),d.positions?.wins??'—',d.positions?.podiums??'—']));
 picker($('archive-event'),current.events.map((e,j)=>[j,'R'+e.event.round+' · '+flag(e.event.track.country)+e.event.track.trackName+' · '+(e.event.eventDate||'Date unavailable')]));renderEvent();$('archive-content').hidden=false;
}
async function select(keepView=false){const oldEvent=$('archive-event').value,oldSession=$('archive-session').value;const id=Number($('archive-season').value),seq=++sequence;current=null;$('archive-content').hidden=true;msg('Loading season…');try{let value=cache.get(id);if(!value){const {data,error}=await client.from('f7r_league_archive').select('payload_gzip_base64').eq('source_id',id).single();if(error)throw error;const bytes=Uint8Array.from(atob(data.payload_gzip_base64),c=>c.charCodeAt(0));value=JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());cache.set(id,value);if(cache.size>3)cache.delete(cache.keys().next().value);}if(seq!==sequence)return;current=value;render();if(keepView&&current.events[Number(oldEvent)]){$('archive-event').value=oldEvent;renderEvent();if(current.events[Number(oldEvent)].sessions[Number(oldSession)]){$('archive-session').value=oldSession;renderSession();}}msg('RLT records · original points, standings and missing values preserved. Select a driver in a result to see their laps.');}catch(e){if(seq===sequence)msg('Could not load season: '+e.message);}}
async function start(){try{const response=await fetch('./config.json',{cache:'no-store'});if(!response.ok)throw Error('Connection settings unavailable');const c=await response.json();client=window.supabase.createClient(c.supabase_url,c.supabase_publishable_key,{auth:window.F7RAuth.options()});const {data:{session}}=await client.auth.getSession();if(!session||session.user.is_anonymous){msg('Sign in with your driver or admin account to view the shared archive.');return;}const {data,error}=await client.from('f7r_league_archive').select('source_id,name,archived,event_count,session_count').order('archived').order('name');if(error)throw error;const chosen=$('archive-season').value;picker($('archive-season'),data.map(s=>[s.source_id,s.name+(s.archived?' · Archived':' · Current')]));if(data.some(s=>String(s.source_id)===chosen))$('archive-season').value=chosen;$('archive-season').disabled=!data.length;canReadSync=true;await syncStatus();msg(data.length+' shared seasons available.');if(data.length)await select();}catch(e){msg('Could not connect to shared archive: '+e.message);}}
async function pollLibrary(){
 if(!client||!canReadSync||document.hidden)return;
 await syncStatus();
 try{
  const {data,error}=await client.from('f7r_league_archive').select('source_id,name,archived,imported_at').order('archived').order('name');if(error)throw error;
  const selected=$('archive-season').value;
  picker($('archive-season'),data.map(s=>[s.source_id,s.name+(s.archived?' · Archived':' · Current')]));
  if(data.some(s=>String(s.source_id)===selected))$('archive-season').value=selected;
  const newest=data.find(s=>s.source_id===current?.index.seasonId);
  if(newest&&Date.parse(newest.imported_at)>Date.parse(current.importedAt)){cache.delete(newest.source_id);await select(true);}
 }catch{/* Keep the last available saved results on connection failure. */}
}
async function syncStatus(){
 if(!client||!canReadSync)return;
 try{
  const {data,error}=await client.rpc('f7r_rlt_sync_status');if(error)throw error;
  const parts=['AUTOMATIC RLT CLOUD SYNC · checks every 2 minutes'];
  if(data.last_checked)parts.push('Last checked '+new Date(data.last_checked).toLocaleString());
  if(data.last_success)parts.push('Last update '+new Date(data.last_success).toLocaleString());
  if(data.pending)parts.push(data.pending+' season(s) queued');
  if(data.last_error)parts.push('Retry pending: '+data.last_error);
  $('archive-sync-status').textContent=parts.join(' · ');
 }catch{$('archive-sync-status').textContent='Sync status unavailable. Saved seasons remain available.';}
}
setInterval(pollLibrary,60000);
$('archive-season').onchange=()=>select();$('archive-event').onchange=renderEvent;$('archive-session').onchange=renderSession;$('archive-download').onclick=download;$('archive-refresh').onclick=()=>{cache.clear();start();};start();


