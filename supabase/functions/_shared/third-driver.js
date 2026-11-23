import {APP_ID,button,rowButtons,caseAccess,idOK,safeText,collectEvidence,refreshEvidence} from './stewards.js';

export const addDriverCommand={name:'add-driver',description:'Add a third driver or witness to this incident case',type:1,options:[{name:'driver',description:'Server member involved in this incident',type:6,required:true},{name:'role',description:'Whether this driver needs a verdict or is a witness',type:3,required:true,choices:[{name:'Involved driver · separate verdict',value:'involved'},{name:'Witness · statement only',value:'witness'}]}]};
export async function registerAddDriver(s){
 const path='/applications/'+APP_ID+'/guilds/'+s.guild+'/commands',commands=await s.discord(path);
 const existing=commands.find(c=>c.name===addDriverCommand.name);
 const shape=options=>options?.map(o=>({name:o.name,description:o.description,type:o.type,required:o.required,...(o.choices?{choices:o.choices.map(c=>({name:c.name,value:c.value}))}:{})}));
 if(existing&&JSON.stringify(shape(existing.options))===JSON.stringify(shape(addDriverCommand.options)))return existing;
 return s.discord(path,'POST',addDriverCommand);
}

export async function thirdTicket(s,c){
 const r=await s.route(c.route_id),t=c.data.third;if(!t)throw Error('Add the third driver first.');
 if(c.data.third_ticket)return c.data.third_ticket;
 const name='case-'+c.number+'-third',topic='F7R case '+c.id+' · private third-driver evidence';
 const channels=await s.discord('/guilds/'+s.guild+'/channels');
 let channel=channels.find(x=>x.name===name&&x.topic===topic);
 if(!channel){const allow=String(1024+2048+32768+65536+16384),roles=[...new Set([...r.config.steward_roles,...r.config.leader_roles])];
 channel=await s.discord('/guilds/'+s.guild+'/channels','POST',{name,topic,type:0,...(r.config.category_id?{parent_id:r.config.category_id}:{}),permission_overwrites:[{id:s.guild,type:0,allow:'0',deny:'1024'},...roles.map(id=>({id,type:0,allow,deny:'0'})),{id:APP_ID,type:1,allow,deny:'0'},...[c.reporter_id,c.accused_id,t.driver_id].map(id=>({id,type:1,allow:id===t.driver_id?allow:'0',deny:id===t.driver_id?'0':'1024'}))]});}
 await s.action(c,t.added_by,false,'third_ticket',{channel_id:channel.id},c.revision);
 return channel.id;
}
export async function postThirdEvidence(s,c){
 c=await refreshEvidence(s,c);const t=c.data.third,channel=c.review_channel_id||c.data.report_ticket;if(!channel)return;
 let links='';for(const [i,url] of (t.links||[]).entries()){const line='[Evidence '+(i+1)+']('+url+')\n';if(links.length+line.length<=900)links+=line;}
 const payload={content:'**Third driver · Case #'+c.number+'**\n'+(t.role==='witness'?'Witness statement · no penalty vote.':'Involved driver · use /verdict and select Third driver for a separate decision.')+'\nPrivate evidence: <#'+c.data.third_ticket+'>',embeds:[{title:t.role==='witness'?'Witness':'Third driver defence',description:'Driver: <@'+t.driver_id+'>\n'+safeText(t.statement),fields:[{name:'Video evidence',value:t.no_video?'No video evidence provided.':links||'See the private evidence ticket.'}]}],allowed_mentions:{parse:[]},...(t.role==='involved'?{components:rowButtons([button('Third driver verdict','f7r-stew-verdict:'+c.id+':third')])}:{})};
 const messages=await s.discord('/channels/'+channel+'/messages?limit=100');const prior=messages.find(m=>m.author?.id===APP_ID&&m.content?.startsWith('**Third driver · Case #'+c.number+'**'));
 await s.discord('/channels/'+channel+'/messages'+(prior?'/'+prior.id:''),prior?'PATCH':'POST',payload);
}
export async function thirdInteraction(i,s,defer){
 const custom=i.data?.custom_id||'',user=i.member?.user||i.user,command=i.type===2&&i.data?.name==='add-driver';
 if(!command&&!custom.startsWith('f7r-stew-third'))return null;
 const reply=content=>Response.json({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
 const [kind,id,revision]=custom.split(':');
 if(command)return defer(async()=>{
   const c=(await s.db('f7r_steward_cases?guild_id=eq.'+s.guild+'&or=(review_channel_id.eq.'+i.channel_id+',data->>report_ticket.eq.'+i.channel_id+',data->>defence_ticket.eq.'+i.channel_id+')'))[0];
   if(!c)throw Error('Use /add-driver inside the original incident case ticket.');
   await caseAccess(s,c,user.id);
   if(!['discussion','voting','tied'].includes(c.status)||!c.data.report?.locked||!c.data.defence?.locked||c.data.kind==='penalty_appeal'||c.outcome||c.status==='closed'||c.data.deletion)throw Error('Add a driver to an open incident before any verdict is finalised.');
   const fields=Object.fromEntries((i.data.options||[]).map(x=>[x.name,x.value])),member=await s.member(fields.driver);
   if(!idOK(fields.driver)||(!member.user||member.user.bot)||!['involved','witness'].includes(fields.role)||[user.id,c.reporter_id,c.accused_id].includes(fields.driver))throw Error('Choose another server member and select Involved driver or Witness.');
   if(c.data.third&&(c.data.third.driver_id!==fields.driver||c.data.third.role!==fields.role))throw Error('This case already has a third driver.');
   const updated=c.data.third?c:await s.action(c,user.id,false,'add_third',{driver_id:fields.driver,role:fields.role,name:member.user.global_name||member.user.username},c.revision);
   await s.discord('/channels/'+i.channel_id+'/permissions/'+fields.driver,'PUT',{type:1,allow:'0',deny:'1024'});
   const channel=await thirdTicket(s,updated),t=updated.data.third;
   if(t.locked){await s.discord('/channels/'+channel+'/permissions/'+fields.driver,'PUT',{type:1,allow:'0',deny:'1024'});await postThirdEvidence(s,await s.incident(c.id));return 'The submitted third-driver evidence is linked to case #'+c.number+'. Use /verdict to review.';}
   const messages=await s.discord('/channels/'+channel+'/messages?limit=100');
   if(!messages.some(m=>m.author?.id===APP_ID&&m.components?.some(row=>row.components?.some(b=>b.custom_id==='f7r-stew-thirdstatement:'+c.id)))){
     await s.discord('/channels/'+channel+'/messages','POST',{content:'<@'+fields.driver+'> **'+(t.role==='witness'?'Witness statement':'Third driver defence')+' · Case #'+c.number+'**\n'+safeText(c.data.race)+' · '+safeText(c.data.lap)+'\nAdd your statement, then upload your video clips or paste HTTPS evidence links here. Your statement locks when submitted and your access closes. This evidence space is private from the other drivers.',allowed_mentions:{parse:[],users:[fields.driver]},components:rowButtons([button('Add statement','f7r-stew-thirdstatement:'+c.id,1)])});
     const delivery=await s.dm(fields.driver,{content:'You have been added as '+(t.role==='witness'?'a witness':'an involved driver')+' to F7R case #'+c.number+' · '+safeText(c.data.race)+' · '+safeText(c.data.lap)+'. Add your statement and footage in your private ticket:\nhttps://discord.com/channels/'+s.guild+'/'+channel});
     await s.discord('/channels/'+i.channel_id+'/messages','POST',{content:'**Third driver added · Case #'+c.number+'**\n<@'+fields.driver+'> · '+t.role+'\nPrivate evidence: <#'+channel+'>\nInvitation DM: '+delivery+'. '+(t.role==='involved'?'A separate third-driver verdict is required before the case locks.':'Witnesses do not receive a penalty vote.'),allowed_mentions:{parse:[]}});
   }
   return 'Third driver linked to case #'+c.number+'. Private evidence: https://discord.com/channels/'+s.guild+'/'+channel;
 });
 const c=await s.incident(id),t=c.data.third;
 if(!t||t.driver_id!==user.id||c.data.deletion||t.locked||i.channel_id!==c.data.third_ticket)return reply('This statement is locked or is not your private evidence ticket.');
 if(kind==='f7r-stew-thirdstatement'&&i.type===3)return Response.json({type:9,data:{custom_id:'f7r-stew-thirddraft:'+c.id+':'+c.revision,title:t.role==='witness'?'Witness statement':'Third driver defence',components:[{type:18,label:'Your account of the incident',component:{type:4,custom_id:'statement',style:2,required:true,min_length:1,max_length:1500,...(t.statement?{value:t.statement}:{})}}]}});
 if(kind==='f7r-stew-thirddraft'&&i.type===5)return defer(async()=>{
   const statement=i.data.components?.flatMap(x=>[x.component,...(x.components||[])].filter(Boolean)).find(x=>x.custom_id==='statement')?.value?.trim();
   if(!statement||statement.length>1500)throw Error('Enter your statement, up to 1,500 characters.');
   const updated=await s.action(c,user.id,false,'third_draft',{statement},Number(revision));
   return {content:'Statement saved. Add your video clips or HTTPS links here, then submit. You may also submit without footage; stewards will see that no video was provided.',components:rowButtons([button('Submit statement and evidence','f7r-stew-thirdfinish:'+c.id,1),button('Edit statement','f7r-stew-thirdstatement:'+c.id)])};
 });
 if(kind==='f7r-stew-thirdfinish')return defer(async()=>{
   if(!t.statement)throw Error('Add your statement first.');
   const evidence=await collectEvidence(s,c,'third',user.id),updated=await s.action(c,user.id,false,'third_submit',evidence,c.revision);
   await s.discord('/channels/'+c.data.third_ticket+'/permissions/'+user.id,'PUT',{type:1,allow:'0',deny:'1024'});
   await postThirdEvidence(s,updated);
   await s.dm(user.id,{content:'Your statement and evidence for F7R case #'+c.number+' are submitted and locked.'+(t.role==='involved'?' Your final decision will be sent by DM.':' Thank you for providing a witness statement.')});
   return {content:'Statement submitted and locked. Your private ticket access has closed.',components:[]};
 });
 return reply('Open your private evidence ticket to continue.');
}
