export const APP_ID='1004676760815796334';
export const SITE='https://racecontrol.f7r.co.uk';
export const idOK=value=>typeof value==='string'&&/^\d{17,20}$/.test(value);
export const groupReference=value=>String(value||'').normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'');
export const uuidOK=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
export const safeText=value=>String(value||'').replace(/<[@#][^>]*>/g,'').slice(0,2000);
export function evidenceLinks(value) {
 const links=String(value||'').split(/\s+/).filter(Boolean);
 if(links.length>5)throw Error('Use up to five video evidence links.');
 return links.map(link=>{let url;try{url=new URL(link);}catch{throw Error('Use full HTTPS evidence links.');}if(url.protocol!=='https:'||url.username||url.password||link.length>500)throw Error('Use HTTPS evidence links, up to 500 characters each.');return url.href;});
}
export function penalties(set) {
 return ['No further action','Warning',...Array.from({length:set==='F1'?4:10},(_,i)=>`${(i+1)*5} seconds`),'Qualifying ban','Race ban','Season ban'];
}
export function verdictView(c,target='accused') {
 if(!['accused','reporter'].includes(target))throw Error('Invalid verdict target.');
 if(target==='accused')return c;
 if(c.data.kind==='penalty_appeal')throw Error('In-game appeals do not have a second verdict.');
 const v=c.data.reporter_verdict;
 return {...c,status:v?.status||'discussion',penalty_set:v?.penalty_set||null,votes:v?.votes||{},notifications:v?.notifications||{},outcome:v?.outcome||null,explanation:v?.explanation||null,decided_by:v?.decided_by||null};
}
export function tally(votes) {
 const totals={};for(const vote of Object.values(votes||{}))totals[vote.penalty]=(totals[vote.penalty]||0)+1;
 const max=Math.max(0,...Object.values(totals));return {totals,winners:Object.keys(totals).filter(k=>totals[k]===max),count:Object.keys(votes||{}).length};
}
export function accessFor(roles,config,driverId,incident) {
 const leader=(config.leader_roles||[]).some(id=>roles.includes(id));
 const involved=incident&&[incident.reporter_id,incident.accused_id].includes(driverId);
 return {leader:leader&&!involved,steward:!involved&&(leader||(incident?.data?.kind!=='penalty_appeal'&&(config.steward_roles||[]).some(id=>roles.includes(id))))};
}
export const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
export function createService(env,send=fetch) {
 const key=env('SUPABASE_SERVICE_ROLE_KEY'),base=env('SUPABASE_URL'),token=env('F7R_DISCORD_BOT_TOKEN'),guild=env('F7R_DISCORD_SERVER_ID');
 const db=async(path,method='GET',body)=>{
   const r=await send(base+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)})});
   if(!r.ok){const err=await r.json().catch(()=>({}));throw Error(err.message||'Case storage is unavailable.');}
   return r.status===204?null:r.json();
 };
 const discord=async(path,method='GET',body)=>{
   const r=await send('https://discord.com/api/v10'+path,{method,headers:{Authorization:'Bot '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
   if(!r.ok)throw Object.assign(Error(r.status===403?'Discord permission denied. Check the bot’s View Channel, Send Messages, Embed Links and Manage Channels permissions.':r.status===429?'Discord is busy. Try again shortly.':'Discord request failed (HTTP '+r.status+').'),{status:r.status});
   return r.status===204?null:r.json();
 };
 const route=async id=>(await db('f7r_steward_routes?guild_id=eq.'+guild+'&id=eq.'+encodeURIComponent(id)))[0];
 const incident=async id=>{if(!uuidOK(id))throw Error('Invalid case.');const row=(await db('f7r_steward_cases?guild_id=eq.'+guild+'&id=eq.'+id))[0];if(!row)throw Error('Case not found.');return row;};
 const member=async id=>{if(!idOK(id))throw Error('Invalid Discord member.');return discord('/guilds/'+guild+'/members/'+id);};
 const dm=async(id,payload)=>{try{const channel=await discord('/users/@me/channels','POST',{recipient_id:id});await discord('/channels/'+channel.id+'/messages','POST',{...payload,allowed_mentions:{parse:[]}});return 'sent';}catch{return 'failed_or_unverified';}};
 const action=async(c,actor,leader,name,value={},revision=null)=>{const result=await db('rpc/f7r_steward_action','POST',{p_id:c.id,p_actor:actor,p_leader:leader,p_action:name,p_value:value,p_revision:revision});return Array.isArray(result)?result[0]:result;};
 return {env,db,discord,route,incident,member,dm,action,guild,token};
}
export const rowButtons=buttons=>[{type:1,components:buttons}];
export const button=(label,custom_id,style=2)=>({type:2,style,label,custom_id});
export async function makeSession(s,driverId) {
 const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
 await s.db('f7r_steward_sessions','POST',{token_hash:await digest(token),guild_id:s.guild,driver_id:driverId});
 return SITE+'/stewards.html#access='+token;
}
export async function caseAccess(s,c,driverId) {
 const r=await s.route(c.route_id),m=await s.member(driverId),access=accessFor(m.roles||[],r.config,driverId,c);
 if(!access.steward)throw Error('Only assigned stewards who are not involved in this incident can review this case.');
 return {...access,route:r,member:m};
}
export async function notifyDefence(s,c) {
 const status=await s.dm(c.accused_id,{content:`**F7R case #${c.number}: defence requested**\nA report has been submitted concerning you in **${safeText(c.data.race)}**, ${safeText(c.data.lap)}. Please submit your own account and video evidence links. Your submission goes privately to the stewards.`,components:rowButtons([button('Submit defence','f7r-stew-defend:'+c.id)])});
 await s.db('f7r_steward_cases?id=eq.'+c.id,'PATCH',{data:{...c.data,defence_invitation:status}});
 return status;
}
export async function reviewChannel(s,c,r) {
 const appeal=c.data.kind==='penalty_appeal';
 if(!appeal&&!c.data.defence?.locked&&c.status!=='discussion'&&c.status!=='voting'&&c.status!=='tied'&&c.status!=='closed')throw Error('The reported driver must submit a defence before opening the review room.');
 if(c.review_channel_id)return c.review_channel_id;
 const allow=String(1024+2048+65536),roles=[...new Set([...(appeal?[]:r.config.steward_roles),...r.config.leader_roles])];
 const channel=await s.discord('/guilds/'+s.guild+'/channels','POST',{
   name:'case-'+c.number,type:0,...(r.config.category_id?{parent_id:r.config.category_id}:{}),
   permission_overwrites:[{id:s.guild,type:0,deny:'1024',allow:'0'},...roles.map(id=>({id,type:0,allow,deny:'0'})),{id:APP_ID,type:1,allow,deny:'0'},...[c.reporter_id,c.accused_id].filter(id=>id!==APP_ID).map(id=>({id,type:1,allow:'0',deny:'1024'}))]
 });
 await s.db('f7r_steward_cases?id=eq.'+c.id,'PATCH',{review_channel_id:channel.id});
 const statement=(title,id,data)=>{let list='';for(const [index,url] of (data.links||[]).entries()){const line=`[Evidence ${index+1}](${url})\n`;if(list.length+line.length<=900)list+=line;}return {title,description:`Driver: <@${id}>\n${safeText(data.statement)}`,fields:[{name:'Video evidence',value:data.no_video?'No video evidence provided. Take this into account when assessing the case.':list||'See the private clip ticket or Race Control for evidence.'}]};};
 await s.discord('/channels/'+channel.id+'/messages','POST',{
   content:roles.map(id=>'<@&'+id+'>').join(' ')+`\n**${appeal?'In-game penalty appeal':'Case'} #${c.number} · ${safeText(r.config.name)}**\n${safeText(c.data.race)} · ${safeText(c.data.lap)}\n`+(appeal?`Original penalty: ${safeText(c.data.original_penalty)}\nHead Steward / CEO: use /verdict to keep or remove the penalty.`:'Discuss privately here or in Race Control. Use /verdict to start voting.')+'\nEvidence tickets: '+[c.data.report_ticket,c.data.defence_ticket].filter(Boolean).map(id=>'<#'+id+'>').join(' '),
   allowed_mentions:{parse:[],roles},embeds:appeal?[statement('Appeal',c.reporter_id,c.data.report)]:[statement('Report',c.reporter_id,c.data.report),statement('Defence',c.accused_id,c.data.defence)],
   components:rowButtons([button('Admin Stewards Room','f7r-stew-access:'+c.id),button('Start / view verdict','f7r-stew-verdict:'+c.id),...(!appeal?[button('Reporting driver verdict','f7r-stew-verdict:'+c.id+':reporter')]:[])])
 });
 return channel.id;
}
export async function sendOutcomes(s,c,actor,leader,target='accused') {
 c=verdictView(c,target);
 const statuses={};
 const appeal=c.data.kind==='penalty_appeal';
 for(const recipient of appeal?['reporter']:['reporter','accused']) {
   try{await s.action(c,actor,leader,'claim_notification',{recipient,target});}
   catch{statuses[recipient]='already_attempted';continue;}
   const result=await s.dm(recipient==='reporter'?c.reporter_id:c.accused_id,{
     content:`**F7R ${appeal?'in-game penalty appeal':'steward decision'} · Case #${c.number}**\n**Race:** ${safeText(c.data.race)}\n**Incident:** ${safeText(c.data.lap)}\n`+(appeal?`**Original penalty:** ${safeText(c.data.original_penalty)}\n**Decision:** ${c.outcome}`:`**Outcome for the ${target==='reporter'?'reporting':'reported'} driver:** ${c.outcome}`)+`\n\n${safeText(c.explanation)}\n\n`+(appeal?'This appeal was decided by a Head Steward or CEO. Any required result correction must be applied by league administration.':'This decision was approved by the stewards.')
   });
   await s.action(c,actor,leader,'notification_result',{recipient,result,target});statuses[recipient]=result;
 }
 return statuses;
}
export async function evidenceTicket(s,c,r,phase) {
 const key=phase+'_ticket',existing=c.data[key];
 const driver=phase==='report'?c.reporter_id:c.accused_id,appeal=c.data.kind==='penalty_appeal';
 const roles=[...new Set([...(appeal?[]:r.config.steward_roles),...r.config.leader_roles])],allow=String(1024+2048+32768+65536+16384);
 const channel=existing?{id:existing}:await s.discord('/guilds/'+s.guild+'/channels','POST',{name:`case-${c.number}-${phase}`,type:0,...(r.config.category_id?{parent_id:r.config.category_id}:{}),permission_overwrites:[{id:s.guild,type:0,deny:'1024',allow:'0'},...roles.map(id=>({id,type:0,allow,deny:'0'})),{id:APP_ID,type:1,allow,deny:'0'},...[...new Set([c.reporter_id,c.accused_id])].filter(id=>id!==APP_ID).map(id=>({id,type:1,allow:id===driver?allow:'0',deny:id===driver?'0':'1024'}))]});
 if(!existing){const latest=await s.incident(c.id);await s.db('f7r_steward_cases?id=eq.'+c.id,'PATCH',{data:{...latest.data,[key]:channel.id}});}
 await s.discord('/channels/'+channel.id+'/messages','POST',{content:`<@${driver}> **${appeal?'In-game penalty appeal':phase==='report'?'Report':'Defence'} · Case #${c.number}**\n${safeText(c.data.race)} · ${safeText(c.data.lap)}\n\nAttach up to five video clips directly here, or paste up to five HTTPS evidence links. **Mention <@${APP_ID}> in each clip message** so the bot can read your evidence. **Video evidence is mandatory.** Press Submit below when ready. This locks your statement and removes your access. The other driver cannot see this room.`,embeds:[{description:safeText(c.data[phase].statement)}],allowed_mentions:{parse:[],users:[driver]},components:rowButtons([button(phase==='report'?'Submit report / appeal':'Submit defence','f7r-stew-finish-'+phase+':'+c.id,1)])});
 return channel.id;
}
export async function collectEvidence(s,c,phase,driver) {
 const channel=c.data[phase+'_ticket'];if(!channel)throw Error('Open your private evidence ticket first.');
 const messages=await s.discord('/channels/'+channel+'/messages?limit=100');
 if(messages.length===100)throw Error('This ticket has too many messages to capture safely. Ask a steward to reduce it to the relevant evidence before submitting.');
 const own=messages.filter(m=>m.author?.id===driver),clips=[];
 if(own.some(m=>!m.content&&!(m.attachments||[]).length))throw Error('Discord did not expose a message to the bot. Mention the F7R bot in each clip / evidence message, then submit again.');
 for(const m of own)for(const a of m.attachments||[]){
   if(!/^video\//.test(a.content_type||'')&&!/\.(mp4|mov|webm|mkv|m4v)$/i.test(a.filename||''))throw Error('Only attach video clips. Remove other files before submitting.');
   clips.push({channel_id:channel,message_id:m.id,attachment_id:a.id,filename:a.filename,url:a.url});
 }
 if(clips.length>5)throw Error('Keep at most five video clips in this ticket before submitting.');
 const external=[...new Set([...(c.data[phase].external_links||c.data[phase].links||[]),...own.flatMap(m=>m.content?.match(/https:\/\/[^\s<>]+/g)||[])])];
 evidenceLinks(external.join('\n'));
 return {external_links:external,clips,links:[...external,...clips.map(a=>a.url)],no_video:!external.length&&!clips.length};
}
export async function refreshEvidence(s,c) {
 for(const phase of ['report','defence']){
   const evidence=c.data[phase];if(!evidence?.clips?.length)continue;
   const messages=new Map();const urls=[];
   for(const clip of evidence.clips){try{const key=clip.channel_id+'/'+clip.message_id;if(!messages.has(key))messages.set(key,await s.discord('/channels/'+clip.channel_id+'/messages/'+clip.message_id));const a=messages.get(key).attachments?.find(a=>a.id===clip.attachment_id);urls.push(a?.url||clip.url);}catch{urls.push(clip.url);}}
   evidence.links=[...(evidence.external_links||[]),...urls];
 }
 return c;
}

