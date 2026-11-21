const $=id=>document.getElementById(id);
const stateNames={awaiting_defence:'Awaiting defence',discussion:'Discussion',voting:'Voting open',tied:'Tied · decision needed',closed:'Closed'};
let config,client,token=sessionStorage.getItem('f7r-steward-access'),desk,setup,current,busy=false;
const fragment=new URLSearchParams(location.hash.slice(1));
if(fragment.has('access')){token=fragment.get('access');sessionStorage.setItem('f7r-steward-access',token);history.replaceState(null,'',location.pathname);}
const status=text=>{$('status').textContent=text||'';};
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
const who=id=>id===desk?.driverId?'You':'Discord driver …'+id.slice(-6);
async function api(action,details={}) {
 let access=token;if(!access){const {data}=await client.auth.getSession();access=data.session?.access_token;}
 if(!access)throw Error('Open your private steward link from Discord or sign in for admin setup.');
 const response=await fetch(config.supabase_url+'/functions/v1/f7r-stewards',{method:'POST',headers:{Authorization:'Bearer '+access,apikey:config.supabase_publishable_key,'Content-Type':'application/json'},body:JSON.stringify({action,...details})});
 const result=await response.json();if(!response.ok||result.error)throw Error(result.error||'Stewards Room unavailable.');return result;
}
async function run(work) {
 if(busy)return;busy=true;status('Working…');
 try{await work();}catch(error){status(error.message);}finally{busy=false;}
}
function options(id,items,placeholder) {
 const select=$(id);select.replaceChildren();if(placeholder!==undefined)select.add(new Option(placeholder,''));
 for(const item of items)select.add(new Option(item.name??item,item.id??item));
}
function renderList() {
 const list=$('case-list');list.replaceChildren();
 for(const c of desk.cases.filter(c=>(!$('group-filter').value||c.route_id===$('group-filter').value)&&(!$('state-filter').value||c.status===$('state-filter').value))) {
   const button=node('button',undefined,'steward-case');button.type='button';
   const title=node('span');title.append(node('strong',`#${c.number} · ${c.race}`),node('small',(desk.routes.find(r=>r.id===c.route_id)?.config.name||c.route_id)+' · '+c.lap));
   button.append(title,node('span',stateNames[c.status]||c.status,'steward-status'));button.onclick=()=>run(()=>loadCase(c.id));list.append(button);
 }
}
async function loadDesk() {
 desk=await api('list');$('entry').hidden=true;$('workspace').hidden=false;$('setup').hidden=!desk.admin;
 $('access-title').textContent=desk.admin?'Admin case oversight':'Your steward case desk';
 const previous=$('group-filter').value;options('group-filter',desk.routes.map(r=>({id:r.id,name:r.config.name})),'All assigned groups');$('group-filter').value=previous;renderList();
 status(desk.admin?'Admin oversight: use your private Discord steward link to discuss, vote and approve decisions.':'Private steward access verified against your current Discord roles.');
 if(desk.admin&&!setup)await loadSetup();
}
function links(id,urls) {
 const list=$(id);list.replaceChildren();for(const url of urls||[]){let parsed;try{parsed=new URL(url);}catch{continue;}if(parsed.protocol!=='https:')continue;const li=node('li'),a=node('a',url);a.href=parsed.href;a.target='_blank';a.rel='noopener noreferrer';li.append(a);list.append(li);}
}
async function loadCase(id) {
 current=await api('case',{id});const c=current.incident,a=current.access;
 $('case-detail').hidden=false;$('case-group').textContent=a.route.config.name;
 $('case-title').textContent=`Case #${c.number} · ${c.data.race}`;$('case-meta').textContent=c.data.lap+' · '+stateNames[c.status];
 $('case-access').textContent=a.steward?(a.leader?'Head Steward / CEO access · you can close voting and decide ties.':'Steward access · discussion and one vote per case.'):'Admin oversight · use your Discord steward access link to take part in the verdict.';
 $('report-driver').textContent=c.data.reporter_name||who(c.reporter_id);$('report-text').textContent=c.data.report.statement;links('report-links',c.data.report.links);
 $('defence-driver').textContent=c.data.accused_name||who(c.accused_id);$('defence-text').textContent=c.data.defence?.statement||'Awaiting the reported driver’s statement.';links('defence-links',c.data.defence?.links);
 $('defence-invite').textContent=c.data.defence_invitation?'Defence invitation: '+c.data.defence_invitation:'';
 $('invite').hidden=c.status!=='awaiting_defence'||c.data.defence_invitation==='sent'||(!desk.admin&&!a.leader);
 $('open-review').disabled=!c.data.defence;
 $('review-link').hidden=!c.review_channel_id;if(c.review_channel_id)$('review-link').href=`https://discord.com/channels/${c.guild_id}/${c.review_channel_id}`;
 $('comments').replaceChildren(...c.comments.map(x=>node('p',`${who(x.author)} · ${new Date(x.at).toLocaleString()}\n${x.text}`,'steward-entry')));
 $('comment-form').hidden=!a.steward||c.status==='closed';
 $('vote-state').textContent=`${c.penalty_set?c.penalty_set+' rules · ':''}${current.tally.count} steward vote(s). Any number of stewards may vote. Only a Head Steward or CEO closes voting.`;
 $('tally').replaceChildren(...Object.entries(current.tally.totals).map(([penalty,count])=>node('span',`${penalty}: ${count}`,'steward-status')));
 $('start-form').hidden=!a.steward||c.status!=='discussion';$('penalty-set').value=a.route.config.default_set;
 $('vote-form').hidden=!a.steward||c.status!=='voting';options('penalty',current.penalties);
 const own=c.votes[desk.driverId];if(own){$('penalty').value=own.penalty;$('vote-reason').value=own.reason;}else $('vote-reason').value='';
 $('votes').replaceChildren(...Object.entries(c.votes).map(([id,v])=>node('p',`${who(id)} · ${v.penalty}\n${v.reason}`,'steward-entry')));
 $('approval').hidden=!a.leader||!['voting','tied'].includes(c.status);$('explanation').value='';$('brief-note').textContent='AI drafts are optional and always require steward approval. If AI is not configured, an editable template is available.';
 const tied=c.status==='tied';$('tie-label').hidden=$('tie-choice').hidden=!tied;options('tie-choice',current.tally.winners);
 $('close-vote').textContent=tied?'Cast deciding vote and send outcome DMs':'Close voting and send outcome DMs';
 $('decision').hidden=c.status!=='closed';$('decision-outcome').textContent=c.outcome||'';$('decision-text').textContent=c.explanation||'';
 $('delivery').textContent=c.status==='closed'?`Outcome DMs · reporting driver: ${c.notifications.reporter||'not attempted'} · reported driver: ${c.notifications.accused||'not attempted'}`:'';
 $('send-pending').hidden=!a.leader||c.status!=='closed'||Boolean(c.notifications.reporter&&c.notifications.accused);
 $('case-detail').scrollIntoView({behavior:'smooth',block:'start'});status(`Case #${c.number} loaded.`);
}
async function change(action,details={}){const id=current.incident.id;await api(action,{id,...details});await loadDesk();await loadCase(id);}
$('group-filter').onchange=$('state-filter').onchange=renderList;
$('refresh').onclick=()=>run(loadDesk);
$('logout').onclick=()=>run(async()=>{await api('logout');token=null;sessionStorage.removeItem('f7r-steward-access');await client.auth.signOut({scope:'local'});location.reload();});
$('login').onsubmit=event=>{event.preventDefault();run(async()=>{const {error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)throw error;$('password').value='';token=null;sessionStorage.removeItem('f7r-steward-access');await loadDesk();});};
$('comment-form').onsubmit=event=>{event.preventDefault();run(async()=>{await change('comment',{text:$('comment').value});$('comment').value='';});};
$('start-form').onsubmit=event=>{event.preventDefault();run(()=>change('start_vote',{set:$('penalty-set').value,revision:current.incident.revision}));};
$('vote-form').onsubmit=event=>{event.preventDefault();run(()=>change('vote',{penalty:$('penalty').value,reason:$('vote-reason').value}));};
$('open-review').onclick=()=>run(()=>change('open_review'));
$('invite').onclick=()=>run(()=>change('invite_defence'));
$('send-pending').onclick=()=>run(()=>change('send_pending'));
$('brief').onclick=()=>run(async()=>{const result=await api('brief',{id:current.incident.id});$('explanation').value=result.draft;$('brief-note').textContent=(result.ai?'AI draft. ':'Template. ')+result.note;status('Draft ready. Review and edit it before approving.');});
$('close-vote').onclick=()=>run(async()=>{
 const c=current.incident;if($('explanation').value.trim().length<20)throw Error('Write or approve an explanation of at least 20 characters.');
 if(!window.confirm('Close voting on case #'+c.number+'? If there is a winner, the approved outcome and explanation will be sent to both drivers.'))return;
 await change(c.status==='tied'?'tie_break':'close_vote',{penalty:$('tie-choice').value,explanation:$('explanation').value,revision:c.revision});
 status(current.incident.status==='tied'?'Voting is tied. Select a tied outcome and cast the deciding vote.':'Decision recorded. Check the outcome DM delivery status below.');
});
async function loadSetup() {
 setup=await api('setup_options');
 options('route-picker',setup.routes.map(r=>({id:r.id,name:r.config.name})),'New group');
 options('report-channel',setup.channels.filter(c=>c.type===0).map(c=>({id:c.id,name:'#'+c.name})),'Choose reporting channel');
 options('review-category',setup.channels.filter(c=>c.type===4),'No category');
 for(const [field,id]of[['driver_roles','driver-roles'],['steward_roles','steward-roles'],['leader_roles','leader-roles']]){
   $(id).replaceChildren();for(const role of [...setup.roles].sort((a,b)=>a.name.localeCompare(b.name))){const label=node('label',undefined,'steward-check'),input=node('input');input.type='checkbox';input.value=role.id;input.dataset.roleGroup=field;label.append(input,document.createTextNode(role.name));$(id).append(label);}
 }
 selectRoute();
}
function selectRoute(){
 const r=setup.routes.find(r=>r.id===$('route-picker').value),c=r?.config;
 $('route-id').value=r?.id||'';$('route-id').readOnly=Boolean(r);$('route-name').value=c?.name||'';$('default-set').value=c?.default_set||'F1';$('report-channel').value=c?.report_channel||'';$('review-category').value=c?.category_id||'';$('route-enabled').checked=c?.enabled||false;
 document.querySelectorAll('[data-role-group]').forEach(input=>{input.checked=Boolean(c?.[input.dataset.roleGroup]?.includes(input.value));});
}
$('route-picker').onchange=selectRoute;
$('route-form').onsubmit=event=>{event.preventDefault();run(async()=>{
 const id=$('route-id').value,roles=key=>[...document.querySelectorAll(`[data-role-group="${key}"]:checked`)].map(x=>x.value);
 await api('save_route',{id,config:{name:$('route-name').value,default_set:$('default-set').value,report_channel:$('report-channel').value,category_id:$('review-category').value,enabled:$('route-enabled').checked,driver_roles:roles('driver_roles'),steward_roles:roles('steward_roles'),leader_roles:roles('leader_roles')}});
 await loadSetup();$('route-picker').value=id;selectRoute();await loadDesk();$('setup-result').textContent='Reporting group saved. Nothing has been posted. Publish the desk when ready.';status('Group saved.');
});};
$('publish').onclick=()=>run(async()=>{
 const id=$('route-picker').value;if(!id)throw Error('Save and select a reporting group first.');
 if(!window.confirm('Publish the Report Incident desk to this group’s selected Discord channel?'))return;
 const result=await api('publish_panel',{id});const a=node('a','Open the Discord reporting desk ↗');a.href=result.url;a.target='_blank';a.rel='noopener noreferrer';$('setup-result').replaceChildren(a);status('Reporting desk published.');
});
try{
 const r=await fetch('config.json',{cache:'no-store'});if(!r.ok)throw Error('Configuration unavailable.');config=await r.json();client=window.supabase.createClient(config.supabase_url,config.supabase_publishable_key,{auth:window.F7RAuth.options()});
 const {data}=await client.auth.getSession();if(token||data.session)await run(loadDesk);
}catch(error){status(error.message);}
