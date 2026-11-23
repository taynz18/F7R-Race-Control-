import {APP_ID,idOK,uuidOK,groupReference,button,rowButtons,ensureMessageReading} from './stewards.js';
export function lapMillis(value){
 const match=/^(\d{1,2}):([0-5]\d)\.(\d{3})$/.exec(String(value).trim());
 if(!match)throw Error('Enter a lap time as m:ss.mmm, for example 1:34.700.');
 const result=(Number(match[1])*60+Number(match[2]))*1000+Number(match[3]);
 if(result<10000||result>3599999)throw Error('Check the lap time (10 seconds to 59:59.999).');return result;
}
export const formatLap=value=>{const ms=Math.round(value);return Math.floor(ms/60000)+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');};
export function validatePace(config){
 if(!config||typeof config.name!=='string'||!config.name.trim()||config.name.length>80)throw Error('Enter a panel name, up to 80 characters.');
 if(!Array.isArray(config.tracks)||config.tracks.length<1||config.tracks.length>10)throw Error('Choose 1–10 required tracks.');
 const tracks=config.tracks.map((t,i)=>{if(typeof t.name!=='string'||!t.name.trim()||t.name.length>70)throw Error('Enter each track name.');return {id:'track-'+i,name:t.name.trim(),benchmark_ms:lapMillis(t.benchmark)};});
 if(new Set(tracks.map(t=>t.name.toLowerCase())).size!==tracks.length)throw Error('Each required track must be different.');
 if(!Array.isArray(config.tiers)||config.tiers.length<2||config.tiers.length>10)throw Error('Choose 2–10 tiers.');
 let previous=-100;const tiers=config.tiers.map((t,i)=>{if(i<config.tiers.length-1&&(t.max_gap===null||t.max_gap===undefined||t.max_gap===''))throw Error('Enter each tier percentage boundary.');const max=i===config.tiers.length-1?null:Number(t.max_gap);if(!t.name?.trim()||t.name.length>50||!idOK(t.role_id)||max!==null&&(!Number.isFinite(max)||max<0||max<=previous||max>100))throw Error('Choose a tier role and increasing percentage boundaries; the last tier has no upper limit.');previous=max??previous;return {name:t.name.trim(),role_id:t.role_id,max_gap:max};});
 if(new Set(tiers.map(t=>t.role_id)).size!==tiers.length)throw Error('Use a different Discord role for every tier.');
 const roleList=(key,required)=>{const ids=config[key]||[];if(!Array.isArray(ids)||ids.length>20||required&&!ids.length||ids.some(id=>!idOK(id)))throw Error('Choose valid '+key.replaceAll('_',' ')+'.');return [...new Set(ids)];};
 const reviewer_roles=roleList('reviewer_roles',true),driver_roles=roleList('driver_roles',false),remove_roles=roleList('remove_roles',false);
 if(tiers.some(t=>reviewer_roles.includes(t.role_id))||remove_roles.some(id=>reviewer_roles.includes(id)||tiers.some(t=>t.role_id===id)))throw Error('Tier and trial roles must be separate from reviewer roles.');
 if(!idOK(config.channel_id)||!idOK(config.category_id))throw Error('Choose the submission desk channel and private ticket category.');
 return {name:config.name.trim(),tracks,tiers,reviewer_roles,driver_roles,remove_roles,channel_id:config.channel_id,category_id:config.category_id,instructions:String(config.instructions||'Use qualifying sessions with equal car performance and valid laps. Time Trial laps are not accepted. Screenshots must show the qualifying results, your driver name, track and lap time.').slice(0,1500),enabled:config.enabled===true};
}
export function paceAssessment(snapshot,entries){
 const results=snapshot.tracks.map(track=>{const entry=entries[track.id];if(!Number.isSafeInteger(entry?.ms)||entry.ms<10000||!entry.proof?.message_id)throw Error('Submit a time and screenshot for every required track.');return {...track,ms:entry.ms,gap:(entry.ms/track.benchmark_ms-1)*100};});
 const gap=results.reduce((sum,t)=>sum+t.gap,0)/results.length;
 return {tracks:results,gap,tier:snapshot.tiers.find(t=>t.max_gap===null||gap<=t.max_gap+1e-9),average_ms:results.reduce((n,t)=>n+t.ms,0)/results.length};
}
export async function pacePanel(s,id){const p=(await s.db('f7r_pace_panels?guild_id=eq.'+s.guild+'&id=eq.'+encodeURIComponent(groupReference(id))))[0];if(!p)throw Error('Pace panel not found.');return p;}
export async function paceTicket(s,id){if(!uuidOK(id))throw Error('Invalid pace ticket.');const t=(await s.db('f7r_pace_tickets?guild_id=eq.'+s.guild+'&id=eq.'+id))[0];if(!t)throw Error('Pace ticket not found.');return t;}
export async function paceUpdate(s,t,changes){const rows=await s.db('f7r_pace_tickets?guild_id=eq.'+s.guild+'&id=eq.'+t.id+'&revision=eq.'+t.revision,'PATCH',{...changes,revision:t.revision+1,updated_at:new Date().toISOString()});if(!rows?.length)throw Error('This ticket changed. Use the latest ticket buttons and try again.');return rows[0];}
export async function paceReviewer(s,t,user){
 if(user===t.driver_id)throw Error('Another admin must review your own pace submission.');
 const panel=await pacePanel(s,t.panel_id),member=await s.member(user);
 if(!panel.config.reviewer_roles.some(id=>member.roles.includes(id)))throw Error('Only the configured pace admins can review this ticket.');return panel;
}
export function paceControls(t){return rowButtons(t.status==='draft'?[button('Add / update qualifying time','f7r-pace-track:'+t.id,1),button('Submit all times for review','f7r-pace-submit:'+t.id,3),button('Cancel submission','f7r-pace-cancel:'+t.id,4)]:t.status==='review'?[button('Review and assign tier','f7r-pace-review:'+t.id,3),button('Request corrections','f7r-pace-return:'+t.id)]:t.status==='assigning'?[button('Retry approved role assignment','f7r-pace-retry:'+t.id,3)]:[]);}
export const ticketURL=(s,t)=>'https://discord.com/channels/'+s.guild+'/'+t.channel_id;
export async function paceSummary(s,t,notify=false){
 const a=paceAssessment(t.snapshot,t.entries),lines=a.tracks.map(track=>`${track.name}: **${formatLap(track.ms)}** · ${track.gap.toFixed(3)}% from benchmark\n[View screenshot](https://discord.com/channels/${s.guild}/${t.channel_id}/${t.entries[track.id].proof.message_id})`);
 const payload={content:notify?t.snapshot.reviewer_roles.map(id=>'<@&'+id+'>').join(' '):'',embeds:[{title:'Pace submission #'+t.number+' · '+t.status,description:'Driver: <@'+t.driver_id+'>\n\n'+lines.join('\n\n')+'\n\n**Average gap: '+a.gap.toFixed(3)+'%**\nSuggested tier: **'+a.tier.name+'**\n'+(t.status==='approved'?'Approved tier: **'+t.decision.tier.name+'**':'An admin must verify every screenshot before assigning a tier.'),color:0x27c9ad}],components:paceControls(t),allowed_mentions:{parse:[],...(notify?{roles:t.snapshot.reviewer_roles}:{})}};
 await s.discord('/channels/'+t.channel_id+'/messages','POST',payload);return a;
}
export async function validatePaceRoles(s,config){
 const [roles,bot]=await Promise.all([s.discord('/guilds/'+s.guild+'/roles'),s.member(APP_ID)]);
 const top=Math.max(0,...roles.filter(r=>bot.roles.includes(r.id)).map(r=>r.position)),permissions=roles.filter(r=>r.id===s.guild||bot.roles.includes(r.id)).reduce((n,r)=>n|BigInt(r.permissions||0),0n);
 if(!(permissions&8n)&&!(permissions&268435456n))throw Error('Give the bot Manage Roles before assigning tiers.');
 for(const id of [...config.tiers.map(t=>t.role_id),...config.remove_roles]){const role=roles.find(r=>r.id===id);if(!role||id===s.guild||role.managed||role.position>=top||(BigInt(role.permissions||0)&(8n|16n|32n|268435456n)))throw Error('Choose ordinary tier / trial roles below the bot, without admin or role-management permissions.');}
 if([...config.reviewer_roles,...config.driver_roles].some(id=>id===s.guild||!roles.some(r=>r.id===id)))throw Error('Choose existing reviewer and driver roles.');
}
export async function assignPaceTier(s,t){
 if(t.status!=='assigning'||!t.decision?.tier)throw Error('Approve the screenshots and tier first.');
 await validatePaceRoles(s,t.snapshot);const selected=t.decision.tier,member=await s.member(t.driver_id);
 // Add the selected tier first. Only explicitly configured tier/trial roles are removed.
 await s.discord('/guilds/'+s.guild+'/members/'+t.driver_id+'/roles/'+selected.role_id,'PUT');
 for(const role of [...t.snapshot.tiers.map(x=>x.role_id),...t.snapshot.remove_roles])if(role!==selected.role_id&&member.roles.includes(role))await s.discord('/guilds/'+s.guild+'/members/'+t.driver_id+'/roles/'+role,'DELETE');
 const check=await s.member(t.driver_id);if(!check.roles.includes(selected.role_id)||[...t.snapshot.tiers.map(x=>x.role_id),...t.snapshot.remove_roles].some(id=>id!==selected.role_id&&check.roles.includes(id)))throw Error('Role assignment is incomplete. Use Retry approved role assignment; the approved tier is saved.');
 t=await paceUpdate(s,t,{status:'approved'});
 await s.discord('/channels/'+t.channel_id+'/permissions/'+t.driver_id,'PUT',{type:1,allow:'66560',deny:'34816'});
 await paceSummary(s,t);
 const delivery=await s.dm(t.driver_id,{content:'Your F7R pace submission #'+t.number+' has been approved.\nAssigned tier: **'+selected.name+'**\n'+t.decision.reason+'\n'+ticketURL(s,t)});
 return {ticket:t,delivery};
}
export async function findPaceProof(s,t,driver,trackId){
 await ensureMessageReading(s);let before,seen=0;
 const used=new Set(Object.entries(t.entries).filter(([id])=>id!==trackId).map(([,e])=>e.proof?.attachment_id));
 while(seen<1000){const batch=await s.discord('/channels/'+t.channel_id+'/messages?limit=100'+(before?'&before='+before:''));
 for(const message of batch)if(message.author?.id===driver)for(const a of message.attachments||[])if((/^image\//.test(a.content_type||'')||/\.(png|jpe?g|webp)$/i.test(a.filename||''))&&!used.has(a.id))return {channel_id:t.channel_id,message_id:message.id,attachment_id:a.id,filename:a.filename};
 if(batch.length<100)break;before=batch.at(-1).id;seen+=batch.length;
 }throw Error('Upload a screenshot for this track in the private ticket, then press Add / update qualifying time again. One different screenshot is required per track.');
}