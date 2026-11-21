import {filterChannels} from './channel-search.js';
const $=id=>document.getElementById(id);
const stateNames={awaiting_report_evidence:'Report / appeal · adding clips',awaiting_defence:'Awaiting defence',awaiting_defence_evidence:'Defence · adding clips',discussion:'Ready for review',voting:'Voting open',tied:'Tied · decision needed',closed:'Closed'};
let config,client,token=sessionStorage.getItem('f7r-steward-access'),desk,setup,current,busy=false,verdictTarget='accused';
const fragment=new URLSearchParams(location.hash.slice(1));
if(fragment.has('access')){token=fragment.get('access');sessionStorage.setItem('f7r-steward-access',token);history.replaceState(null,'',location.pathname);}
const status=text=>{$('status').textContent=text||'';};
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
const who=id=>id===desk?.driverId?'You':'Discord driver …'+id.slice(-6);
async function api(action,details={}) {
 const {data}=await client.auth.getSession(),adminAccess=data.session?.access_token;
 if(!adminAccess)throw Error('Sign in with your approved admin account. Steward reviews and voting remain available in Discord.');
 const access=token||adminAccess;
 const response=await fetch(config.supabase_url+'/functions/v1/f7r-stewards',{method:'POST',headers:{Authorization:'Bearer '+access,'x-f7r-admin-token':adminAccess,apikey:config.supabase_publishable_key,'Content-Type':'application/json'},body:JSON.stringify({action,...details})});
 const result=await response.json();if(!response.ok||result.error){if(response.status===401||response.status===403){$('workspace').hidden=true;$('entry').hidden=false;}throw Error(result.error||'Stewards Room unavailable.');}return result;
}
async function run(work) {
 if(busy)return;busy=true;status('Working…');
 try{await work();}catch(error){status(error.message);if(!$('setup').hidden)$('setup-result').textContent=error.message;}finally{busy=false;}
}
function options(id,items,placeholder) {
 const select=$(id);select.replaceChildren();if(placeholder!==undefined)select.add(new Option(placeholder,''));
 for(const item of items)select.add(new Option(item.name??item,item.id??item));
}
function renderList() {
 const list=$('case-list');list.replaceChildren();
 for(const c of desk.cases.filter(c=>(!$('group-filter').value||c.route_id===$('group-filter').value)&&(!$('state-filter').value||c.status===$('state-filter').value))) {
   const button=node('button',undefined,'steward-case');button.type='button';
   const title=node('span');title.append(node('strong',`${c.kind==='penalty_appeal'?'Appeal ':''}#${c.number} · ${c.race}`),node('small',(desk.routes.find(r=>r.id===c.route_id)?.config.name||c.route_id)+' · '+c.lap));
   button.append(title,node('span',stateNames[c.status]||c.status,'steward-status'));button.onclick=()=>run(async()=>{verdictTarget='accused';await loadCase(c.id);});list.append(button);
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
 current=await api('case',{id,target:verdictTarget});const raw=current.incident,a=current.access,appeal=raw.data.kind==='penalty_appeal';
 if(appeal)verdictTarget='accused';
 const secondary=verdictTarget==='reporter',v=raw.data.reporter_verdict;
 const c=secondary?{...raw,status:v?.status||'discussion',penalty_set:v?.penalty_set||null,votes:v?.votes||{},notifications:v?.notifications||{},outcome:v?.outcome||null,explanation:v?.explanation||null}:raw;
 current.baseIncident=raw;current.incident=c;
 $('verdict-target-section').hidden=appeal;$('verdict-target').value=verdictTarget;
 $('verdict-target-help').textContent=secondary?'Separate outcome for the driver who submitted the report. The reported driver’s votes and decision remain unchanged.':'Outcome for the driver named in the report.';
 $('reporter-reason').hidden=$('reporter-reason-label').hidden=!secondary||Boolean(v);
 $('reporter-reason').value='';
 $('case-detail').hidden=false;$('case-group').textContent=a.route.config.name;
 $('case-title').textContent=`${appeal?'In-game penalty appeal':'Case'} #${c.number} · ${c.data.race}`;$('case-meta').textContent=c.data.lap+' · '+(v?'Reported driver: '+stateNames[raw.status]+' · Reporting driver: '+stateNames[v.status]:stateNames[c.status]);
 $('case-access').textContent=a.steward?(a.leader?'Head Steward / CEO access · you can close voting and decide ties.':'Steward access · discussion and one vote per case.'):'Admin oversight · use your Discord steward access link to take part in the verdict.';
 $('report-driver').textContent=c.data.reporter_name||who(c.reporter_id);$('report-text').textContent=c.data.report.statement;links('report-links',c.data.report.links);
 $('report-heading').textContent=(appeal?'Appeal':'Report')+(c.status==='awaiting_report_evidence'?' · draft, collecting clips':' · locked');
 $('original-penalty').hidden=!appeal;$('original-penalty').textContent=appeal?'Original in-game penalty: '+c.data.original_penalty:'';
 $('defence-section').hidden=appeal;
 $('defence-heading').textContent=c.status==='awaiting_defence_evidence'?'Defence · draft, collecting clips':'Defence'+(c.data.defence?' · locked':' · awaiting submission');
 for(const phase of ['report','defence']){const ticket=$(phase+'-ticket');ticket.hidden=!c.data[phase+'_ticket'];if(c.data[phase+'_ticket'])ticket.href=`https://discord.com/channels/${c.guild_id}/${c.data[phase+'_ticket']}`;if(c.data[phase]?.no_video)$(phase+'-text').textContent+='\n\nNo video evidence provided. Take this into account when assessing the case.';}
 $('defence-driver').textContent=c.data.accused_name||who(c.accused_id);$('defence-text').textContent=c.data.defence?.statement||'Awaiting the reported driver’s statement.';links('defence-links',c.data.defence?.links);
 if(c.data.defence?.no_video)$('defence-text').textContent+='\n\nNo video evidence provided. Take this into account when assessing the case.';
 $('defence-invite').textContent=c.data.defence_invitation?'Defence invitation: '+c.data.defence_invitation:'';
 $('invite').hidden=c.status!=='awaiting_defence'||c.data.defence_invitation==='sent'||(!desk.admin&&!a.leader);
 $('open-review').disabled=appeal?c.status==='awaiting_report_evidence':!['discussion','voting','tied','closed'].includes(c.status);
 $('review-link').hidden=!c.review_channel_id;if(c.review_channel_id)$('review-link').href=`https://discord.com/channels/${c.guild_id}/${c.review_channel_id}`;
 $('comments').replaceChildren(...c.comments.map(x=>node('p',`${who(x.author)} · ${new Date(x.at).toLocaleString()}\n${x.text}`,'steward-entry')));
 $('comment-form').hidden=!a.steward||(raw.status==='closed'&&(!v||v.status==='closed'));
 $('verdict-heading').textContent=appeal?'In-game penalty review':secondary?'Verdict vote · reporting driver':'Verdict vote · reported driver';
 $('vote-state').textContent=appeal?'Only a Head Steward or CEO decides whether the in-game penalty stays or is removed. This appeal does not use a steward penalty vote.':`${c.penalty_set?c.penalty_set+' rules · ':''}${current.tally.count} steward vote(s). Any number of stewards may vote. Only a Head Steward or CEO closes voting.`;
 $('tally').replaceChildren(...Object.entries(current.tally.totals).map(([penalty,count])=>node('span',`${penalty}: ${count}`,'steward-status')));
 $('start-form').hidden=appeal||!a.steward||(c.status!=='discussion'||!['discussion','voting','tied','closed'].includes(raw.status));$('penalty-set').value=a.route.config.default_set;
 $('vote-form').hidden=appeal||!a.steward||c.status!=='voting';options('penalty',current.penalties);
 const own=c.votes[desk.driverId];if(own){$('penalty').value=own.penalty;$('vote-reason').value=own.reason;}else $('vote-reason').value='';
 $('votes').replaceChildren(...Object.entries(c.votes).map(([id,v])=>node('p',`${who(id)} · ${v.penalty}\n${v.reason}`,'steward-entry')));
 $('approval').hidden=!a.leader||!(appeal?c.status==='discussion':['voting','tied'].includes(c.status));$('explanation').value='';$('brief-note').textContent=desk.aiAvailable?'AI drafting is connected. Every draft needs a steward’s review and approval.':'AI summarisation is not connected yet. The draft button provides an editable template; you can write and approve the explanation now.';
 $('approval-help').textContent=appeal?'Review the driver’s explanation and clips. Select Keep or Remove and explain the decision. Any result correction must still be applied by league administration.':'Review the votes and explanation before closing. A tied vote stays pending until a Head Steward or CEO selects one of the tied outcomes.';
 $('explanation-label').textContent=appeal?'Approved appeal explanation to send to the driver':'Approved explanation to send to both drivers';
 const tied=c.status==='tied';$('tie-label').hidden=$('tie-choice').hidden=!tied&&!appeal;options('tie-choice',appeal?['In-game penalty kept','In-game penalty removed']:current.tally.winners);$('tie-label').textContent=appeal?'Keep or remove the original in-game penalty':'Deciding vote · tied outcomes only';
 $('close-vote').textContent=appeal?'Decide appeal and send driver DM':tied?'Cast deciding vote and send outcome DMs':'Close voting and send outcome DMs';
 $('decision').hidden=c.status!=='closed';$('decision-outcome').textContent=c.outcome||'';$('decision-text').textContent=c.explanation||'';
 $('delivery').textContent=c.status==='closed'?`Outcome DMs · ${appeal?'appealing':'reporting'} driver: ${c.notifications.reporter||'not attempted'}`+(appeal?'':` · reported driver: ${c.notifications.accused||'not attempted'}`):'';
 $('send-pending').hidden=!a.leader||c.status!=='closed'||Boolean(c.notifications.reporter&&(appeal||c.notifications.accused));
 $('case-detail').scrollIntoView({behavior:'smooth',block:'start'});status(`Case #${c.number} loaded.`);
}
async function change(action,details={}){const id=current.incident.id;await api(action,{id,target:verdictTarget,...details});await loadDesk();await loadCase(id);}
$('verdict-target').onchange=()=>run(async()=>{verdictTarget=$('verdict-target').value;await loadCase(current.incident.id);});
$('group-filter').onchange=$('state-filter').onchange=renderList;
$('refresh').onclick=()=>run(loadDesk);
$('logout').onclick=()=>run(async()=>{await api('logout');token=null;sessionStorage.removeItem('f7r-steward-access');await client.auth.signOut({scope:'local'});location.reload();});
$('login').onsubmit=event=>{event.preventDefault();run(async()=>{const {error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)throw error;$('password').value='';await loadDesk();});};
$('comment-form').onsubmit=event=>{event.preventDefault();run(async()=>{await change('comment',{text:$('comment').value,target:'accused'});$('comment').value='';});};
$('start-form').onsubmit=event=>{event.preventDefault();run(()=>change(verdictTarget==='reporter'&&!current.baseIncident.data.reporter_verdict?'start_reporter_vote':'start_vote',{set:$('penalty-set').value,reason:$('reporter-reason').value,revision:current.incident.revision}));};
$('vote-form').onsubmit=event=>{event.preventDefault();run(()=>change('vote',{penalty:$('penalty').value,reason:$('vote-reason').value}));};
$('open-review').onclick=()=>run(()=>change('open_review'));
$('invite').onclick=()=>run(()=>change('invite_defence'));
$('send-pending').onclick=()=>run(()=>change('send_pending'));
$('brief').onclick=()=>run(async()=>{const result=await api('brief',{id:current.incident.id,target:verdictTarget});$('explanation').value=result.draft;$('brief-note').textContent=(result.ai?'AI draft. ':'Template. ')+result.note;status('Draft ready. Review and edit it before approving.');});
$('close-vote').onclick=()=>run(async()=>{
 const c=current.incident;if($('explanation').value.trim().length<20)throw Error('Write or approve an explanation of at least 20 characters.');
 const appeal=c.data.kind==='penalty_appeal';
 if(!window.confirm(appeal?'Finalise this in-game penalty appeal and DM the driver your decision?':'Finalise the '+(verdictTarget==='reporter'?'reporting':'reported')+' driver verdict on case #'+c.number+'? If there is a winner, both drivers will receive this outcome and explanation.'))return;
 await change(appeal?'appeal_decision':c.status==='tied'?'tie_break':'close_vote',{penalty:$('tie-choice').value,explanation:$('explanation').value,revision:c.revision});
 status(current.incident.status==='tied'?'Voting is tied. Select a tied outcome and cast the deciding vote.':'Decision recorded. Check the outcome DM delivery status below.');
});
async function loadSetup() {
 setup=await api('setup_options');
 options('route-picker',setup.routes.map(r=>({id:r.id,name:r.config.name})),'New group');
 filterChannelChoices();
 for(const [field,id]of[['driver_roles','driver-roles'],['steward_roles','steward-roles'],['leader_roles','leader-roles']]){
   $(id).replaceChildren();for(const role of [...setup.roles].sort((a,b)=>a.name.localeCompare(b.name))){const label=node('label',undefined,'steward-check'),input=node('input');input.type='checkbox';input.value=role.id;input.dataset.roleGroup=field;label.append(input,document.createTextNode(role.name));$(id).append(label);}
 }
 selectRoute();
}
function selectRoute(){
 const r=setup.routes.find(r=>r.id===$('route-picker').value),c=r?.config;
 $('report-channel-search').value='';$('review-category-search').value='';filterChannelChoices();
 $('route-id').value=r?.id||'';$('route-id').readOnly=Boolean(r);$('route-name').value=c?.name||'';$('default-set').value=c?.default_set||'F1';$('report-channel').value=c?.report_channel||'';$('review-category').value=c?.category_id||'';$('route-enabled').checked=c?.enabled||false;
 document.querySelectorAll('[data-role-group]').forEach(input=>{input.checked=Boolean(c?.[input.dataset.roleGroup]?.includes(input.value));});showTicketDestination();
}
function showTicketDestination(){
 const category=setup?.channels.find(c=>c.id===$('review-category').value&&c.type===4);
 $('ticket-destination').textContent=category?'New case channels will open inside: '+category.name+'. Both drivers and steward review use the same case channel in this category.':'No category selected. New case channels will appear at the server’s top level. Choose a category to keep this tier’s tickets together.';
}
$('review-category').onchange=showTicketDestination;
function filterChannelChoices() {
 if(!setup)return;
 for(const [id,type,placeholder]of[['report-channel',0,'Choose reporting channel'],['review-category',4,'No category']]){
   const previous=$(id).value,matches=filterChannels(setup.channels,$(id+'-search').value,type);
   const selected=setup.channels.find(c=>c.id===previous&&c.type===type),rows=[...matches];
   if(selected&&!rows.some(c=>c.id===previous))rows.unshift(selected);
   options(id,rows.map(c=>({id:c.id,name:(type===0?'#':'')+c.name+(c===selected&&!matches.includes(c)?' · selected':'' )})),matches.length?placeholder:type===0?'No matching channels':'No category');
   if(selected)$(id).value=previous;
   $(id+'-count').textContent=`${matches.length} of ${setup.channels.filter(c=>c.type===type).length} ${type===0?'channels':'categories'} match`+(selected&&!matches.includes(selected)?'. Current selection kept.':'.');
 }
 showTicketDestination();
}
$('report-channel-search').oninput=$('review-category-search').oninput=filterChannelChoices;
$('route-picker').onchange=selectRoute;
function routeFormConfig(enabled=$('route-enabled').checked){
 if(!$('route-form').reportValidity())throw Error('Complete the group reference, name and reporting channel first.');
 const roles=key=>[...document.querySelectorAll(`[data-role-group="${key}"]:checked`)].map(x=>x.value);
 const config={name:$('route-name').value,default_set:$('default-set').value,report_channel:$('report-channel').value,category_id:$('review-category').value,enabled,driver_roles:roles('driver_roles'),steward_roles:roles('steward_roles'),leader_roles:roles('leader_roles')};
 if(!config.driver_roles.length||!config.steward_roles.length||!config.leader_roles.length)throw Error('Select at least one driver role, one steward role, and one Head Steward / CEO role.');
 return {id:$('route-id').value,config};
}
$('route-form').onsubmit=event=>{event.preventDefault();run(async()=>{
 const values=routeFormConfig(),saved=await api('save_route',values),id=saved.id||values.id;
 await loadSetup();$('route-picker').value=id;selectRoute();await loadDesk();$('setup-result').textContent='Reporting group saved. Nothing has been posted. Publish the desk when ready.';status('Group saved.');
});};
$('publish').onclick=()=>run(async()=>{
 const values=routeFormConfig(true);
 if(!window.confirm('Save, enable and publish '+values.config.name+' in the selected Discord reporting channel? Existing desks for this group will be updated.'))return;
 const saved=await api('save_route',values),id=saved.id||values.id;$('route-id').value=id;$('route-enabled').checked=true;
 const result=await api('publish_panel',{id});await loadSetup();$('route-picker').value=id;selectRoute();
 const a=node('a','Open the Discord reporting desk ↗');a.href=result.url;a.target='_blank';a.rel='noopener noreferrer';$('setup-result').replaceChildren(a);if(result.warning)$('setup-result').append(document.createTextNode(' '+result.warning));status(result.warning||'Reporting desk published.');
});
try{
 const r=await fetch('config.json',{cache:'no-store'});if(!r.ok)throw Error('Configuration unavailable.');config=await r.json();client=window.supabase.createClient(config.supabase_url,config.supabase_publishable_key,{auth:window.F7RAuth.options()});
 const {data}=await client.auth.getSession();if(token||data.session)await run(loadDesk);
}catch(error){status(error.message);}

