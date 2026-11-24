import {APP_ID,caseAccess,collectEvidence,reviewChannel,addNoResponseControl,uuidOK} from './stewards.js';

export async function syncNoResponseButtons(s){
 const cases=await s.db('f7r_steward_cases?guild_id=eq.'+s.guild+'&status=in.(awaiting_defence,awaiting_defence_evidence)&limit=200');
 const result={checked:0,updated:0,failed:[]};
 for(const c of cases){
   for(const channel of new Set([c.data.defence_ticket,c.data.report_ticket].filter(Boolean))){
     result.checked++;
     try{const messages=await s.discord('/channels/'+channel+'/messages?limit=100');
       for(const m of messages){
         if(m.author?.id!==APP_ID)continue;
         const components=addNoResponseControl(m.components,c);
         if(JSON.stringify(components)!==JSON.stringify(m.components||[])){
           await s.discord('/channels/'+channel+'/messages/'+m.id,'PATCH',{components,allowed_mentions:{parse:[]}});result.updated++;
         }
       }
     }catch{result.failed.push(c.number);}
   }
 }
 return result;
}

export async function noResponseInteraction(i,s,defer){
 const custom=i.data?.custom_id||'',[kind,id,revision]=custom.split(':');
 if(!['f7r-stew-proceed','f7r-stew-proceedconfirm'].includes(kind))return null;
 const user=i.member?.user||i.user;if(!uuidOK(id))throw Error('Invalid case.');
 // Opening a form does not change a case. Keep all network calls after the deferred submission acknowledgement.
 if(kind==='f7r-stew-proceed')return Response.json({type:9,data:{custom_id:'f7r-stew-proceedconfirm:'+id,title:'Proceed without driver response',components:[{type:18,label:'Reason / response deadline given to the driver',component:{type:4,custom_id:'reason',style:2,required:true,min_length:10,max_length:500}},{type:18,label:'Type PROCEED · preserves existing evidence',component:{type:4,custom_id:'confirm',style:1,required:true,min_length:7,max_length:7}}]}});
 if(i.type!==5)throw Error('Open the leadership confirmation form again.');
 const fields=Object.fromEntries((i.data.components||[]).flatMap(x=>[x.component,...(x.components||[])].filter(Boolean)).map(x=>[x.custom_id,x.value]));
 if(fields.confirm?.trim()!=='PROCEED')throw Error('Type PROCEED to confirm.');
 const reason=fields.reason?.trim();if(!reason||reason.length<10||reason.length>500)throw Error('Record a reason of 10–500 characters.');
 if(revision!==undefined&&!Number.isInteger(Number(revision)))throw Error('Open the confirmation form again.');
 return defer(async()=>{
   const c=await s.incident(id),access=await caseAccess(s,c,user.id);
   if(!access.leader)throw Error('Only the configured Head Steward / CEO or equivalent leadership role can proceed without a driver response.');
   if(!['awaiting_defence','awaiting_defence_evidence'].includes(c.status)||c.data.kind==='penalty_appeal'||!c.data.report?.locked||c.data.deletion)throw Error('This case is not awaiting a reported driver response.');
   if(revision!==undefined&&c.revision!==Number(revision))throw Error('The case changed. Open the confirmation form again.');
   const channel=c.data.defence_ticket||c.data.report_ticket;if(!channel)throw Error('The private defence ticket is missing. Ask an admin to recover it first.');
   const evidence=await collectEvidence(s,{...c,data:{...c.data,defence_ticket:channel,defence:c.data.defence||{links:[]}}},'defence',c.accused_id);
   // Remove driver access before opening the private staff review. A failure leaves the case awaiting response.
   await s.discord('/channels/'+channel+'/permissions/'+c.accused_id,'PUT',{type:1,allow:'0',deny:'1024'});
   const updated=await s.action(c,user.id,true,'proceed_without_response',{...evidence,reason},c.revision);
   const review=await reviewChannel(s,updated,access.route);
   await s.discord('/channels/'+review+'/messages','POST',{content:'**Leadership action · Case #'+c.number+'**\n<@'+user.id+'> proceeded without the reported driver completing their response.\nReason: '+reason+'\nAny existing draft statement and uploaded evidence were preserved. No penalty has been decided. Use /verdict or Start / view verdict to begin the normal vote.',allowed_mentions:{parse:[]}});
   await s.dm(c.accused_id,{content:'**F7R case #'+c.number+' · moved to steward review**\nLeadership proceeded because your response was not completed. Any existing draft statement or evidence has been preserved. No penalty has been decided. You will receive the final outcome by DM.'});
   return 'Case #'+c.number+' is ready for the normal verdict process. Existing evidence is preserved and the driver’s ticket access has closed. Use /verdict in the case ticket.';
 });
}
