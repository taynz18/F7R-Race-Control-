import {thirdInteraction} from './third-driver.js';
import {draftExplanation,postVoteProgress,APP_ID,completeVerdict,syncTicketLock,deleteTicket,ticketDeleteAccess,verdictView,tally,idOK,evidenceLinks,penalties,accessFor,button,rowButtons,makeSession,caseAccess,notifyDefence,reviewChannel,evidenceTicket,collectEvidence,sendOutcomes} from './stewards.js';
const reply=content=>Response.json({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
const label=(name,component)=>({type:18,label:name,component});
const text=(id,style,max,required=true)=>({type:4,custom_id:id,style,required,max_length:max,...(required?{min_length:id==='explanation'?20:id==='reason'?10:1}:{}),...(id==='statement'?{placeholder:'Describe what happened.'}:{})});
const modal=(id,title,components)=>Response.json({type:9,data:{custom_id:id,title,components}});
function values(interaction) {
 const fields={};for(const label of interaction.data.components||[])for(const c of [label.component,...(label.components||[])].filter(Boolean))fields[c.custom_id]=c.values?.[0]??c.value;return fields;
}
const ticketLink=(guild,channel)=>({type:2,style:5,label:'Open private video ticket',url:'https://discord.com/channels/'+guild+'/'+channel});
const required=(value,name,min=1,max=1500)=>{if(typeof value!=='string'||value.trim().length<min||value.length>max)throw Error(['statement','defence'].includes(name)?'Enter an incident description, up to '+max+' characters. Short descriptions are accepted.':'Check '+name+'.');return value.trim();};
export async function stewardInteraction(i,s,waitUntil) {
 const custom=i.data?.custom_id||'',command=i.type===2&&['verdict','add-driver'].includes(i.data?.name);
 if(!custom.startsWith('f7r-stew-')&&!command)return null;
 const user=i.member?.user||i.user;
 if(!idOK(user?.id)||user.bot)return reply('Sign in with your driver Discord account.');
 if(i.guild_id&&i.guild_id!==s.guild)return reply('This is only available in the F7R server.');
 const [kind,reference,selectedTarget,expectedRevision]=custom.split(':');
 const defer=work=>{
   waitUntil((async()=>{let result;try{result=await work();}catch(error){console.error('Steward workflow failed',kind,error.message);result=error.message||'The case could not be updated.';}const response=await fetch('https://discord.com/api/v10/webhooks/'+APP_ID+'/'+i.token+'/messages/@original',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...typeof result==='string'?{content:result}:result,allowed_mentions:{parse:[]}})});if(!response.ok)console.error('Steward response delivery failed',kind,response.status);})().catch(()=>console.error('Steward interaction response failed')));
   return Response.json({type:5,data:{flags:64}});
 };
 try {
   const thirdResponse=await thirdInteraction(i,s,defer);if(thirdResponse)return thirdResponse;
   if(kind==='f7r-stew-delete'||kind==='f7r-stew-deleteconfirm'){
     const c=await s.incident(reference),access=await ticketDeleteAccess(s,c,user.id);
     const completed=Boolean(c.outcome||c.data.reporter_verdict?.outcome||c.data.third_verdict?.outcome);
     if(kind==='f7r-stew-deleteconfirm'&&i.type===5)return defer(async()=>{
       const v=values(i);if(v.confirm_value?.trim()!=='DELETE')throw Error('Type DELETE to confirm permanent ticket deletion.');
       const revision=Number(selectedTarget);if(!Number.isInteger(revision))throw Error('Open the deletion form again.');
       await deleteTicket(s,c,user.id,access.leader,required(v.delete_reason,'deletion reason',1,500),revision);
       return completed?'Completed Discord ticket deleted after staff review. The approved decision remains in the staff audit.':'Ticket deleted. No verdict or NFA outcome was recorded and no penalty decision was sent. A small staff audit record remains.';
     });
     return modal('f7r-stew-deleteconfirm:'+c.id+':'+c.revision,completed?'Delete completed ticket':'Delete ticket · no verdict',[label(completed?'Reason for removing the completed ticket':'Reason this ticket needs no investigation',text('delete_reason',2,500)),label('Type DELETE to confirm permanent deletion',text('confirm_value',1,6))]);
   }
   if(kind==='f7r-stew-report'||kind==='f7r-stew-appeal') {
     const route=await s.route(reference),m=await s.member(user.id);
     if(!route?.config.enabled||!route.config.driver_roles.some(id=>m.roles.includes(id)))return reply('This reporting desk is not open to your driver role.');
     if(i.channel_id&&route.config.report_channel&&i.channel_id!==route.config.report_channel)return reply('To make a new report, return to the original incident reporting desk and press Report Incident. Each submission opens a fresh private ticket.\nhttps://discord.com/channels/'+s.guild+'/'+route.config.report_channel+(route.config.panel_message_id?'/'+route.config.panel_message_id:''));
     const appeal=kind==='f7r-stew-appeal';
     return modal((appeal?'f7r-stew-appealsubmit:':'f7r-stew-submit:')+route.id,appeal?'Appeal an in-game penalty':'Report an incident',[
       appeal?label('In-game penalty you want reviewed',text('original_penalty',1,150)):label('Driver you are reporting',{type:5,custom_id:'driver',min_values:1,max_values:1,required:true}),
       label('Race / round / date',text('race',1,150)),label('Lap and corner / timestamp',text('lap',1,150)),
       label(appeal?'Why should this penalty be removed?':'Your account of the incident',text('statement',2,1500))
     ]);
   }
   if(['f7r-stew-submit','f7r-stew-appealsubmit'].includes(kind)&&i.type===5) return defer(async()=>{
     const route=await s.route(reference),m=await s.member(user.id),v=values(i);
     if(!route?.config.enabled||!route.config.driver_roles.some(id=>m.roles.includes(id)))throw Error('That reporting desk is unavailable.');
     const appeal=kind==='f7r-stew-appealsubmit';
     if(!appeal&&(!idOK(v.driver)||v.driver===user.id))throw Error('Choose the other driver involved.');
     // Driver roles control who may file a report; reserves and other server members can still be reported.
     const accused=appeal?null:await s.member(v.driver);if(!appeal&&(!accused.user||accused.user.bot))throw Error('Choose the other server member involved, not a bot.');
     const prior=await s.db('f7r_steward_cases?interaction_id=eq.'+i.id);
     if(prior.length)return `Report already saved as case #${prior[0].number}.`;
     const open=await s.db('f7r_steward_cases?select=id&guild_id=eq.'+s.guild+'&reporter_id=eq.'+user.id+'&status=neq.closed');
     if(open.length>=10)throw Error('You have ten open cases. Ask a steward before submitting another.');
     const data={kind:appeal?'penalty_appeal':'incident',...(appeal?{original_penalty:required(v.original_penalty,'original penalty',1,150)}:{}),race:required(v.race,'race',1,150),lap:required(v.lap,'lap / corner',1,150),report:{statement:required(v.statement,'statement',1),links:evidenceLinks(v.links)},reporter_name:user.global_name||user.username,accused_name:accused?.user.global_name||accused?.user.username};
     const c=(await s.db('f7r_steward_cases','POST',{guild_id:s.guild,route_id:route.id,interaction_id:i.id,reporter_id:user.id,accused_id:appeal?APP_ID:v.driver,data,status:'awaiting_report_evidence'}))[0];
     let channel;try{channel=await evidenceTicket(s,c,route,'report');}catch{return {content:`Draft #${c.number} saved. The private clip ticket could not open. Check the bot’s Manage Channels permission, then retry.`,components:rowButtons([button('Retry private ticket','f7r-stew-ticket-report:'+c.id)])};}
     const link=`https://discord.com/channels/${s.guild}/${channel}`;
     await s.dm(user.id,{content:`**F7R ${appeal?'appeal':'report'} #${c.number} · finish your submission**\nVideo evidence is mandatory. Open your private ticket in the reporting group’s incident section, attach your clips, then press Submit.\n${link}`,components:rowButtons([ticketLink(s.guild,channel)])});
     return {content:`Draft #${c.number} saved. Video evidence is mandatory. Attach your clips in the private ticket, then press Submit there. This ticket is in the reporting group’s incident section. For another incident, return to the original incident reporting desk and press Report Incident again.\n${link}`,components:rowButtons([ticketLink(s.guild,channel)])};
   });
   if(['f7r-stew-ticket-report','f7r-stew-ticket-defence'].includes(kind))return defer(async()=>{
     const c=await s.incident(reference),phase=kind.endsWith('report')?'report':'defence',driver=phase==='report'?c.reporter_id:c.accused_id;
     if(user.id!==driver||c.status!==(phase==='report'?'awaiting_report_evidence':'awaiting_defence_evidence'))throw Error('This private evidence ticket is no longer available.');
     const channel=await evidenceTicket(s,c,await s.route(c.route_id),phase);return 'Open your private evidence ticket, add any clips and press Submit:\nhttps://discord.com/channels/'+s.guild+'/'+channel;
   });
   if(['f7r-stew-finish-report','f7r-stew-finish-defence'].includes(kind))return defer(async()=>{
     const c=await s.incident(reference),phase=kind.endsWith('report')?'report':'defence',driver=phase==='report'?c.reporter_id:c.accused_id;
     if(user.id!==driver||i.channel_id!==c.data[phase+'_ticket']||c.status!==(phase==='report'?'awaiting_report_evidence':'awaiting_defence_evidence'))throw Error('This submission is locked or is not your private evidence ticket.');
     const evidence=await collectEvidence(s,c,phase,driver),updated=await s.action(c,user.id,false,phase==='report'?'finish_report':'defence',evidence,c.revision);
     let locked=true;try{await s.discord('/channels/'+i.channel_id+'/permissions/'+driver,'PUT',{type:1,allow:'0',deny:'1024'});}catch{locked=false;}
     if(phase==='report'&&c.data.kind!=='penalty_appeal')await notifyDefence(s,updated);
     else {try{await reviewChannel(s,updated,await s.route(c.route_id));}catch{ /* Stored case remains in oversight for recovery. */ }}
     await s.dm(driver,{content:`**F7R submission received · Case #${c.number}**\nYour ${c.data.kind==='penalty_appeal'?'in-game penalty appeal':phase} is submitted and locked. ${evidence.links.length?evidence.links.length+' evidence link(s) saved; clips remain on Discord.':''}\nYou will receive the final decision by DM.`});
     return {content:`Submission #${c.number} locked.`+(locked?' Your ticket access has closed.':' Your statement is locked, but Discord ticket permissions could not update. Please notify a steward.'),components:[]};
   });
   if(kind==='f7r-stew-nodefence'||kind==='f7r-stew-nodefenceconfirm'){
     const c=await s.incident(reference);
     if(c.accused_id!==user.id||!['awaiting_defence','awaiting_defence_evidence'].includes(c.status))return reply('Only the reported driver can submit this response while a defence is pending.');
     if(kind==='f7r-stew-nodefence')return Response.json({type:4,data:{flags:64,content:'Submit without a defence? Your existing uploaded clips and links will still be included. Your access then closes and stewards review the case.',components:rowButtons([button('Confirm submit without defence','f7r-stew-nodefenceconfirm:'+c.id,1)])}});
     return defer(async()=>{
       const evidence=await collectEvidence(s,{...c,data:{...c.data,defence:c.data.defence||{links:[]}}},'defence',user.id);
       const updated=await s.action(c,user.id,false,'no_defence',evidence,c.revision);
       await s.discord('/channels/'+c.data.defence_ticket+'/permissions/'+user.id,'PUT',{type:1,allow:'0',deny:'1024'});
       await reviewChannel(s,updated,await s.route(c.route_id));
       await s.dm(user.id,{content:'Your response for case #'+c.number+' is submitted without a defence. Stewards have been notified. The final decision will be sent by DM.'});
       return 'Submitted without a defence. Your ticket access has closed and stewards have been notified.';
     });
   }
   if(kind==='f7r-stew-defend') {
     const c=await s.incident(reference);if(c.accused_id!==user.id||!['awaiting_defence','awaiting_defence_evidence'].includes(c.status))return reply('This defence invitation is unavailable or already submitted.');
     if(c.status==='awaiting_defence_evidence')return defer(async()=>{const channel=await evidenceTicket(s,c,await s.route(c.route_id),'defence');return 'Finish your defence in your private ticket:\nhttps://discord.com/channels/'+s.guild+'/'+channel;});
     await s.member(user.id);
     return modal('f7r-stew-defence:'+c.id,'Submit your defence',[
       label('Your account of the incident',text('statement',2,1500)),label('Video links (or upload clips in the ticket)',text('links',2,1500,false))
     ]);
   }
   if(kind==='f7r-stew-defence'&&i.type===5)return defer(async()=>{
     const c=await s.incident(reference),v=values(i);await s.member(user.id);
     const updated=await s.action(c,user.id,false,'defence_draft',{statement:required(v.statement,'defence',1),links:evidenceLinks(v.links)});
     let channel;try{channel=await evidenceTicket(s,updated,await s.route(c.route_id),'defence');}catch{return {content:'Defence draft saved. The private clip ticket could not open. Check bot permissions, then retry.',components:rowButtons([button('Retry private ticket','f7r-stew-ticket-defence:'+c.id)])};}
     return 'Defence draft saved. Video evidence is mandatory. Attach your clips in the private ticket and press Submit there.\nhttps://discord.com/channels/'+s.guild+'/'+channel;
   });
   if(kind==='f7r-stew-access')return defer(async()=>{
     if(reference==='desk') {
       const routes=await s.db('f7r_steward_routes?guild_id=eq.'+s.guild),m=await s.member(user.id);
       if(!routes.some(r=>accessFor(m.roles,r.config,user.id).steward))throw Error('Assigned steward access required.');
     }else await caseAccess(s,await s.incident(reference),user.id);
     return 'Website access requires an approved Race Control admin sign-in as well as this private steward link (valid for four hours; do not share). Stewards can complete reviews and votes in this Discord ticket:\n\n'+await makeSession(s,user.id);
   });
   let c;
   if(command){c=(await s.db('f7r_steward_cases?guild_id=eq.'+s.guild+'&or=(review_channel_id.eq.'+i.channel_id+',data->>report_ticket.eq.'+i.channel_id+',data->>defence_ticket.eq.'+i.channel_id+')'))[0];if(!c)return reply('Use /verdict inside an F7R case review channel.');}
   else if(['f7r-stew-verdict','f7r-stew-start','f7r-stew-vote','f7r-stew-appealdecision','f7r-stew-pick','f7r-stew-close','f7r-stew-sync','f7r-stew-ai'].includes(kind))c=await s.incident(reference);
   if(c) {
     const access=await caseAccess(s,c,user.id);
     if(c.data.kind!=='penalty_appeal'&&(command||(kind==='f7r-stew-verdict'&&!selectedTarget)))return Response.json({type:4,data:{flags:64,content:'Choose whose outcome to review. Each driver has a separate vote and decision.',components:[{type:1,components:[{type:3,custom_id:'f7r-stew-pick:'+c.id,options:[{label:'Reported driver',value:'accused'},{label:'Reporting driver (separate vote)',value:'reporter'},...(c.data.third?.role==='involved'?[{label:'Third driver (separate vote)',value:'third'}]:[])],min_values:1,max_values:1}]},...rowButtons([button('Delete ticket · staff only','f7r-stew-delete:'+c.id,4)])]}});
     const raw=c,target=kind==='f7r-stew-pick'?i.data.values?.[0]:selectedTarget||'accused';
     if(target==='third'&&!raw.data.third?.locked)return reply('The third driver must submit their statement and evidence before voting.');
     c=verdictView(c,target);const suffix=':'+c.id+':'+target;
     if(target==='reporter'&&!raw.data.reporter_verdict){
       if(raw.status==='closed')return reply('The final ticket is locked. Both driver votes must be opened before finalising.');
       if(kind==='f7r-stew-start'&&i.type===5)return defer(async()=>{const v=values(i);const opened=await s.action(raw,user.id,access.leader,'start_reporter_vote',{target,set:v.set,reason:required(v.reason,'reason for the separate vote',10)},raw.revision);await syncTicketLock(s,opened);return 'Separate voting for the reporting driver opened. Use /verdict and select Reporting driver to vote.';});
       return modal('f7r-stew-start'+suffix,'Reporting driver · separate vote',[label('Penalty set',{type:3,custom_id:'set',options:['F1','Endurance'].map(value=>({label:value,value})),min_values:1,max_values:1}),label('Why does the reporting driver need a vote?',text('reason',2,1500))]);
     }
     if(c.data.kind==='penalty_appeal'){
       if(!access.leader||c.status!=='discussion')return reply('This appeal is awaiting evidence or is already decided.');
       if(kind==='f7r-stew-appealdecision'&&i.type===5)return defer(async()=>{const v=values(i),updated=await s.action(c,user.id,true,'appeal_decision',{penalty:v.penalty,explanation:required(v.explanation,'decision explanation',20,1800)},c.revision);await completeVerdict(s,updated,user.id,true);return 'Appeal decision recorded. The driver’s DM delivery status is available in Race Control.';});
       return modal('f7r-stew-appealdecision:'+c.id,'Decide in-game penalty appeal',[label('Head Steward / CEO decision',{type:3,custom_id:'penalty',options:['In-game penalty kept','In-game penalty removed'].map(value=>({label:value,value})),min_values:1,max_values:1}),label('Approved explanation to send the driver',text('explanation',2,1800))]);
     }
     if(kind==='f7r-stew-ai'){
       if(!access.leader||!['voting','tied'].includes(c.status))return reply('Only a Head Steward or CEO can prepare the final summary.');
       return defer(async()=>{
         const draft=await draftExplanation(s,c,target);
         const latest=await s.incident(raw.id);if(latest.revision!==raw.revision)throw Error('Votes changed while drafting. Open /verdict and generate a fresh summary.');
         return {content:'Review this AI draft against the steward comments and votes. Nothing is sent until you approve the final form.',embeds:[{title:'AI explanation draft',description:draft}],components:rowButtons([button('Review and finalise','f7r-stew-close'+suffix+':'+raw.revision,3)])};
       });
     }
     if(kind==='f7r-stew-close'){
       if(!access.leader||!['voting','tied'].includes(c.status))return reply('Only a Head Steward or CEO can finalise an open vote.');
       if(i.type===5)return defer(async()=>{
         const v=values(i),revision=Number(expectedRevision);if(!Number.isInteger(revision))throw Error('Open the finalisation form again.');
         const updated=await s.action(raw,user.id,true,c.status==='tied'?'tie_break':'close_vote',{target,penalty:v.penalty,explanation:required(v.explanation,'approved explanation',20,1800)},revision);
         if(verdictView(updated,target).status==='tied')return 'Voting is tied. Use /verdict again, select this driver and finalise with a deciding vote.';
         const delivery=await completeVerdict(s,updated,user.id,true,target);
         return 'Verdict finalised for the '+(target==='third'?'third':target==='reporter'?'reporting':'reported')+' driver. The ticket is retained for review. Outcome DMs: reporting driver '+delivery.reporter+'; reported driver '+delivery.accused+(delivery.third?'; third driver '+delivery.third:'')+'.';
       });
       if(expectedRevision!==undefined&&Number(expectedRevision)!==raw.revision)return reply('Votes changed since this draft. Open /verdict and generate a fresh summary.');
       const draft=i.message?.author?.id===APP_ID&&i.message?.embeds?.[0]?.title==='AI explanation draft'?i.message.embeds[0].description:null;
       return modal('f7r-stew-close'+suffix+':'+c.revision,'Finalise '+(target==='third'?'third':target==='reporter'?'reporting':'reported')+' driver verdict',[
         ...(c.status==='tied'?[label('Deciding vote · tied outcomes only',{type:3,custom_id:'penalty',options:tally(c.votes).winners.map(value=>({label:value,value})),min_values:1,max_values:1})]:[]),
         label('Approved explanation to send involved drivers',{...text('explanation',2,1800),...(draft?{value:draft}:{})})
       ]);
     }
     if(access.leader&&['voting','tied'].includes(c.status)&&(command||kind==='f7r-stew-verdict'||kind==='f7r-stew-pick'))return Response.json({type:4,data:{flags:64,content:'**'+(target==='third'?'Third':target==='reporter'?'Reporting':'Reported')+' driver verdict**\n'+Object.entries(tally(c.votes).totals).map(([penalty,count])=>penalty+': '+count).join('\n')+'\nApprove an explanation to finalise. Ties require your deciding vote.',components:rowButtons([...(c.status==='voting'?[button('Cast / update my vote','f7r-stew-vote'+suffix,1)]:[]),button('Generate AI summary','f7r-stew-ai'+suffix,3),button('Finalise manually','f7r-stew-close'+suffix)])}});
     if(c.status==='discussion'&&(command||kind==='f7r-stew-verdict'||kind==='f7r-stew-pick'))return modal('f7r-stew-start'+suffix,'Choose penalty rules',[
       label('Penalty set',{type:3,custom_id:'set',options:['F1','Endurance'].map(value=>({label:value,value})),min_values:1,max_values:1})
     ]);
     if(kind==='f7r-stew-start'&&i.type===5)return defer(async()=>{
       const opened=await s.action(c,user.id,access.leader,'start_vote',{set:values(i).set,target},c.revision);await syncTicketLock(s,opened);
       return 'Verdict voting opened. Use /verdict again to vote, or open Race Control.';
     });
     if(c.status==='voting'&&(command||kind==='f7r-stew-verdict'||kind==='f7r-stew-pick'||(kind==='f7r-stew-vote'&&i.type===3)))return modal('f7r-stew-vote'+suffix,target==='third'?'Vote · third driver':target==='reporter'?'Vote · reporting driver':'Vote · reported driver',[
       label('Your penalty vote',{type:3,custom_id:'penalty',options:penalties(c.penalty_set).map(value=>({label:value,value})),min_values:1,max_values:1}),
       label('Reason for your vote',text('reason',2,1500))
     ]);
     if(kind==='f7r-stew-vote'&&i.type===5)return defer(async()=>{
       const v=values(i);if(!penalties(c.penalty_set).includes(v.penalty))throw Error('Invalid penalty.');
       const updated=await s.action(c,user.id,access.leader,'vote',{penalty:v.penalty,reason:required(v.reason,'vote reason',10),target});
       try{await postVoteProgress(s,updated,target);}catch{console.error('Vote saved; ticket progress could not be posted.');}
       return 'Your vote is saved. Each steward has one vote; voting again replaces your own vote. A Head Steward or CEO closes voting.';
     });
     if(kind==='f7r-stew-sync'&&access.leader&&c.status==='closed')return defer(async()=>{const delivery=await completeVerdict(s,raw,user.id,true,target);return 'Final outcome synced. Ticket: '+(delivery.ticket||'no channel recorded')+'. Existing outcome DMs are not sent twice.';});
     if(c.status==='closed'&&access.leader)return Response.json({type:4,data:{flags:64,content:'Final outcome: '+c.outcome+'. The ticket is retained for leadership review. You can sync its outcome and lock, or permanently delete it after review.',components:rowButtons([button('Sync outcome and ticket lock','f7r-stew-sync'+suffix),button('Delete completed ticket','f7r-stew-delete:'+c.id,4)])}});
     return reply(c.status==='tied'?'This vote is tied. A Head Steward or CEO must use /verdict to finalise it.':'This case is not ready for voting or is already closed.');
   }
   return reply('Open the reporting desk and try again.');
 }catch(error){return reply(error.message||'Stewards Room is unavailable.');}
}
