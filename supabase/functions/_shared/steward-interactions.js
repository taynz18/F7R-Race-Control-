import {APP_ID,idOK,evidenceLinks,penalties,accessFor,button,rowButtons,makeSession,caseAccess,notifyDefence,reviewChannel} from './stewards.js';
const reply=content=>Response.json({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
const label=(name,component)=>({type:18,label:name,component});
const text=(id,style,max)=>({type:4,custom_id:id,style,required:true,max_length:max});
const modal=(id,title,components)=>Response.json({type:9,data:{custom_id:id,title,components}});
function values(interaction) {
 const fields={};for(const label of interaction.data.components||[])for(const c of [label.component,...(label.components||[])].filter(Boolean))fields[c.custom_id]=c.values?.[0]??c.value;return fields;
}
const required=(value,name,min=1,max=1500)=>{if(typeof value!=='string'||value.trim().length<min||value.length>max)throw Error('Check '+name+'.');return value.trim();};
export async function stewardInteraction(i,s,waitUntil) {
 const custom=i.data?.custom_id||'',command=i.type===2&&i.data?.name==='verdict';
 if(!custom.startsWith('f7r-stew-')&&!command)return null;
 const user=i.member?.user||i.user;
 if(!idOK(user?.id)||user.bot)return reply('Sign in with your driver Discord account.');
 if(i.guild_id&&i.guild_id!==s.guild)return reply('This is only available in the F7R server.');
 const [kind,reference]=custom.split(':');
 const defer=work=>{
   waitUntil((async()=>{let content;try{content=await work();}catch(error){content=error.message||'The case could not be updated.';}await fetch('https://discord.com/api/v10/webhooks/'+APP_ID+'/'+i.token+'/messages/@original',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,allowed_mentions:{parse:[]}})});})().catch(()=>console.error('Steward interaction response failed')));
   return Response.json({type:5,data:{flags:64}});
 };
 try {
   if(kind==='f7r-stew-report') {
     const route=await s.route(reference),m=await s.member(user.id);
     if(!route?.config.enabled||!route.config.driver_roles.some(id=>m.roles.includes(id)))return reply('This reporting desk is not open to your driver role.');
     return modal('f7r-stew-submit:'+route.id,'Report an incident',[
       label('Driver you are reporting',{type:5,custom_id:'driver',min_values:1,max_values:1,required:true}),
       label('Race / round / date',text('race',1,150)),label('Lap and corner / timestamp',text('lap',1,150)),
       label('Your account of the incident',text('statement',2,1500)),label('Video links (HTTPS, up to five)',text('links',2,1500))
     ]);
   }
   if(kind==='f7r-stew-submit'&&i.type===5) return defer(async()=>{
     const route=await s.route(reference),m=await s.member(user.id),v=values(i);
     if(!route?.config.enabled||!route.config.driver_roles.some(id=>m.roles.includes(id)))throw Error('That reporting desk is unavailable.');
     if(!idOK(v.driver)||v.driver===user.id)throw Error('Choose the other driver involved.');
     const accused=await s.member(v.driver);if(accused.user?.bot||!route.config.driver_roles.some(id=>accused.roles.includes(id)))throw Error('Choose a driver from this reporting group.');
     const prior=await s.db('f7r_steward_cases?interaction_id=eq.'+i.id);
     if(prior.length)return `Report already saved as case #${prior[0].number}.`;
     const open=await s.db('f7r_steward_cases?select=id&guild_id=eq.'+s.guild+'&reporter_id=eq.'+user.id+'&status=neq.closed');
     if(open.length>=10)throw Error('You have ten open cases. Ask a steward before submitting another.');
     const data={race:required(v.race,'race',1,150),lap:required(v.lap,'lap / corner',1,150),report:{statement:required(v.statement,'statement',10),links:evidenceLinks(v.links)},reporter_name:user.global_name||user.username,accused_name:accused.user.global_name||accused.user.username};
     const c=(await s.db('f7r_steward_cases','POST',{guild_id:s.guild,route_id:route.id,interaction_id:i.id,reporter_id:user.id,accused_id:v.driver,data}))[0];
     await s.dm(user.id,{content:`**F7R report received · Case #${c.number}**\n${data.race} · ${data.lap}\nYour report is submitted and locked. The other driver will be asked for a private defence. Both drivers will receive the final outcome by DM.`});
     const invited=await notifyDefence(s,c);
     return `Case #${c.number} submitted. Your statement is locked. `+(invited==='sent'?'The other driver has been invited to submit their defence.':'Their defence DM could not be verified. The case is saved; ask a steward to check the invitation.');
   });
   if(kind==='f7r-stew-defend') {
     const c=await s.incident(reference);if(c.accused_id!==user.id||c.status!=='awaiting_defence')return reply('This defence invitation is unavailable or already submitted.');
     await s.member(user.id);
     return modal('f7r-stew-defence:'+c.id,'Submit your defence',[
       label('Your account of the incident',text('statement',2,1500)),label('Video links (HTTPS, up to five)',text('links',2,1500))
     ]);
   }
   if(kind==='f7r-stew-defence'&&i.type===5)return defer(async()=>{
     const c=await s.incident(reference),v=values(i);await s.member(user.id);
     const updated=await s.action(c,user.id,false,'defence',{statement:required(v.statement,'defence',10),links:evidenceLinks(v.links)});
     let channel;try{channel=await reviewChannel(s,updated,await s.route(c.route_id));}catch{ /* The case remains visible in Race Control for recovery. */ }
     return 'Defence submitted and locked. The stewards can now review both statements.'+(channel?'':' The Discord review room could not open; a steward can open it from Race Control.');
   });
   if(kind==='f7r-stew-access')return defer(async()=>{
     if(reference==='desk') {
       const routes=await s.db('f7r_steward_routes?guild_id=eq.'+s.guild),m=await s.member(user.id);
       if(!routes.some(r=>accessFor(m.roles,r.config,user.id).steward))throw Error('Assigned steward access required.');
     }else await caseAccess(s,await s.incident(reference),user.id);
     return 'Open your private Stewards Room (valid for four hours; do not share):\n'+await makeSession(s,user.id);
   });
   let c;
   if(command){c=(await s.db('f7r_steward_cases?guild_id=eq.'+s.guild+'&review_channel_id=eq.'+i.channel_id))[0];if(!c)return reply('Use /verdict inside an F7R case review channel.');}
   else if(['f7r-stew-verdict','f7r-stew-start','f7r-stew-vote'].includes(kind))c=await s.incident(reference);
   if(c) {
     const access=await caseAccess(s,c,user.id);
     if(c.status==='discussion'&&(command||kind==='f7r-stew-verdict'))return modal('f7r-stew-start:'+c.id,'Choose penalty rules',[
       label('Penalty set',{type:3,custom_id:'set',options:['F1','Endurance'].map(value=>({label:value,value})),min_values:1,max_values:1})
     ]);
     if(kind==='f7r-stew-start'&&i.type===5)return defer(async()=>{
       await s.action(c,user.id,access.leader,'start_vote',{set:values(i).set},c.revision);
       return 'Verdict voting opened. Use /verdict again to vote, or open Race Control.';
     });
     if(c.status==='voting'&&(command||kind==='f7r-stew-verdict'))return modal('f7r-stew-vote:'+c.id,'Vote on the outcome',[
       label('Your penalty vote',{type:3,custom_id:'penalty',options:penalties(c.penalty_set).map(value=>({label:value,value})),min_values:1,max_values:1}),
       label('Reason for your vote',text('reason',2,1500))
     ]);
     if(kind==='f7r-stew-vote'&&i.type===5)return defer(async()=>{
       const v=values(i);if(!penalties(c.penalty_set).includes(v.penalty))throw Error('Invalid penalty.');
       await s.action(c,user.id,access.leader,'vote',{penalty:v.penalty,reason:required(v.reason,'vote reason',10)});
       return 'Your vote is saved. Each steward has one vote; voting again replaces your own vote. A Head Steward or CEO closes voting.';
     });
     return reply(c.status==='tied'?'This vote is tied. A Head Steward or CEO must decide in Race Control.':'This case is not ready for voting or is already closed.');
   }
   return reply('Open the reporting desk and try again.');
 }catch(error){return reply(error.message||'Stewards Room is unavailable.');}
}
