export const APP_ID='1004676760815796334';
export const SITE='https://racecontrol.f7r.co.uk';
export const idOK=value=>typeof value==='string'&&/^\d{17,20}$/.test(value);
export const uuidOK=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
export const safeText=value=>String(value||'').replace(/<[@#][^>]*>/g,'').slice(0,2000);
export function evidenceLinks(value) {
 const links=String(value||'').split(/\s+/).filter(Boolean);
 if(!links.length||links.length>5)throw Error('Add one to five video evidence links.');
 return links.map(link=>{let url;try{url=new URL(link);}catch{throw Error('Use full HTTPS evidence links.');}if(url.protocol!=='https:'||url.username||url.password||link.length>500)throw Error('Use HTTPS evidence links, up to 500 characters each.');return url.href;});
}
export function penalties(set) {
 return ['No further action','Warning',...Array.from({length:set==='F1'?4:10},(_,i)=>`${(i+1)*5} seconds`),'Qualifying ban','Race ban','Season ban'];
}
export function tally(votes) {
 const totals={};for(const vote of Object.values(votes||{}))totals[vote.penalty]=(totals[vote.penalty]||0)+1;
 const max=Math.max(0,...Object.values(totals));return {totals,winners:Object.keys(totals).filter(k=>totals[k]===max),count:Object.keys(votes||{}).length};
}
export function accessFor(roles,config,driverId,incident) {
 const leader=(config.leader_roles||[]).some(id=>roles.includes(id));
 const involved=incident&&[incident.reporter_id,incident.accused_id].includes(driverId);
 return {leader:leader&&!involved,steward:!involved&&(leader||(config.steward_roles||[]).some(id=>roles.includes(id)))};
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
   if(!r.ok)throw Error(r.status===403?'Discord permission denied. Check the bot and driver privacy settings.':r.status===429?'Discord is busy. Try again shortly.':'Discord request failed.');
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
 if(!c.data.defence)throw Error('The reported driver must submit a defence before opening the review room.');
 if(c.review_channel_id)return c.review_channel_id;
 const allow=String(1024+2048+65536),roles=[...new Set([...r.config.steward_roles,...r.config.leader_roles])];
 const channel=await s.discord('/guilds/'+s.guild+'/channels','POST',{
   name:'case-'+c.number,type:0,...(r.config.category_id?{parent_id:r.config.category_id}:{}),
   permission_overwrites:[{id:s.guild,type:0,deny:'1024',allow:'0'},...roles.map(id=>({id,type:0,allow,deny:'0'})),{id:APP_ID,type:1,allow,deny:'0'},...[c.reporter_id,c.accused_id].map(id=>({id,type:1,allow:'0',deny:'1024'}))]
 });
 await s.db('f7r_steward_cases?id=eq.'+c.id,'PATCH',{review_channel_id:channel.id});
 const statement=(title,id,data)=>({title,description:`Driver: <@${id}>\n${safeText(data.statement)}\n\n${(data.links||[]).join('\n')}`});
 await s.discord('/channels/'+channel.id+'/messages','POST',{
   content:roles.map(id=>'<@&'+id+'>').join(' ')+`\n**Case #${c.number} · ${safeText(r.config.name)}**\n${safeText(c.data.race)} · ${safeText(c.data.lap)}\nDiscuss privately here or in Race Control. Use /verdict to start voting.`,
   allowed_mentions:{parse:[],roles},embeds:[statement('Report',c.reporter_id,c.data.report),statement('Defence',c.accused_id,c.data.defence)],
   components:rowButtons([button('Open Stewards Room','f7r-stew-access:'+c.id),button('Start / view verdict','f7r-stew-verdict:'+c.id)])
 });
 return channel.id;
}
export async function sendOutcomes(s,c,actor,leader) {
 const statuses={};
 for(const recipient of ['reporter','accused']) {
   try{await s.action(c,actor,leader,'claim_notification',{recipient});}
   catch{statuses[recipient]='already_attempted';continue;}
   const result=await s.dm(recipient==='reporter'?c.reporter_id:c.accused_id,{
     content:`**F7R steward decision · Case #${c.number}**\n**Race:** ${safeText(c.data.race)}\n**Incident:** ${safeText(c.data.lap)}\n**Outcome for the reported driver:** ${c.outcome}\n\n${safeText(c.explanation)}\n\nThis decision was approved by the stewards.`
   });
   await s.action(c,actor,leader,'notification_result',{recipient,result});statuses[recipient]=result;
 }
 return statuses;
}
