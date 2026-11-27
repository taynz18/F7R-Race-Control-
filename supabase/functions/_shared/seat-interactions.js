import {APP_ID,idOK,button,rowButtons} from './stewards.js';
import {SERIES,COUNTRY_OPTIONS,seatProfile,seatSettings,seatRequest,seatUpdate,seatStaff,seatRef,seatURL,seatControls,seatSummary,safeSeatRoles,openSeatTicket,finishSeat,lockSeat,deleteSeat} from './seats.js';
const reply=content=>Response.json({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
const label=(text,component)=>({type:18,label:text.slice(0,45),component});
const input=(id,max,required=true)=>({type:4,custom_id:id,style:1,max_length:max,required});
const modal=(id,title,components)=>Response.json({type:9,data:{custom_id:id,title,components}});
const values=i=>Object.fromEntries((i.data.components||[]).flatMap(r=>[r.component,...r.components||[]].filter(Boolean)).map(c=>[c.custom_id,c.custom_id==='roles'?c.values:c.values?.[0]??c.value]));
export async function seatInteraction(i,s,waitUntil){
 const [kind,id,expected]=String(i.data?.custom_id||'').split(':');if(!kind.startsWith('f7r-seat-'))return null;
 const user=i.member?.user||i.user;if(!idOK(user?.id)||user.bot||i.guild_id!==s.guild)return reply('Use the seat-request desk in the F7R server.');
 const defer=work=>{waitUntil((async()=>{let result;try{result=await work();}catch(e){console.error('Seat request',kind,e.message);result=e.message||'Seat request unavailable.';}const r=await fetch('https://discord.com/api/v10/webhooks/'+APP_ID+'/'+i.token+'/messages/@original',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(typeof result==='string'?{content:result}:result),allowed_mentions:{parse:[]}})});if(!r.ok)console.error('Seat reply delivery failed',r.status);})().catch(e=>console.error('Seat background task failed',e.message)));return Response.json({type:5,data:{flags:64}});};
 try{
   if(kind==='f7r-seat-apply'){
     if(!SERIES[id])throw Error('Choose F1, ACC or LMU.');
     return modal('f7r-seat-form:'+id,id+' · Full-time seat request',[
       label(id==='LMU'?'Full racing name (first and last name)':'Your online name',input('online',60)),
       ...(id==='LMU'?[]:[label('Your in-game gamer tag',input('gamertag',60))]),
       ...(id==='LMU'?[label('Which class are you looking for?',{type:3,custom_id:'class',options:[{label:'Hypercar',value:'Hypercar'},{label:'GT3',value:'GT3'}],min_values:1,max_values:1,required:true})]:[]),
       label('Country',{type:3,custom_id:'country',options:COUNTRY_OPTIONS,min_values:1,max_values:1}),
       label('Other country (only if you chose Other)',input('other',80,false))
     ]);
   }
   if(kind==='f7r-seat-form'&&i.type===5)return defer(async()=>{
     const config=(await seatSettings(s))?.config;if(!config?.enabled)throw Error('The seat-request desk is currently closed.');
     const member=await s.member(user.id),profile={...seatProfile(id,values(i)),original_nickname:member.nick||null};
     let t=await s.db('rpc/f7r_seat_draft','POST',{p_guild:s.guild,p_driver:user.id,p_series:id,p_profile:profile,p_snapshot:config});if(Array.isArray(t))t=t[0];
     if(t.channel_id)return {content:'You already have an open '+id+' request: '+seatURL(s,t),components:[]};
     return {content:'**Confirm your '+id+' seat request**\n'+(id==='LMU'?'Class: '+profile.lmu_class+'\n':'')+'Country: '+profile.country+' '+profile.flag+'\nProposed server nickname: **'+profile.nickname+'**\n'+(profile.nickname_shortened?'The nickname is shortened to fit Discord; your full supplied name stays in the request.\n':'')+'This changes your nickname across the whole F7R server, including other series. Your application keeps the names you supplied. If Discord prevents the change, staff will be notified and your ticket will still open.',components:rowButtons([button('Confirm and open ticket','f7r-seat-confirm:'+t.id+':'+t.revision,3),button('Cancel this draft','f7r-seat-cancel:'+t.id,4)])};
   });
   if(kind==='f7r-seat-confirm')return defer(async()=>{const draft=await seatRequest(s,id);if(draft.status==='draft'&&Number(expected)!==draft.revision)throw Error('Your application changed. Submit the form again and check the latest nickname preview.');const t=await openSeatTicket(s,draft,user.id);return {content:'Your '+seatRef(t)+' request is on the waiting list.\n'+seatURL(s,t),components:[]};});
   if(kind==='f7r-seat-cancel')return defer(async()=>{const t=await seatRequest(s,id);if(t.driver_id!==user.id||t.status!=='draft')throw Error('Only your unopened application draft can be cancelled here.');await seatUpdate(s,t,{status:'closed',decision:{reason:'Driver cancelled before opening a ticket.',actor:user.id}});return {content:'Draft cancelled. No nickname or roles were changed.',components:[]};});
   if(kind==='f7r-seat-acquire')return modal('f7r-seat-acquireconfirm:'+id,'Seat acquired · select approved roles',[
     label('Approved seat roles for this series',{type:6,custom_id:'roles',min_values:1,max_values:25,required:true}),
     label('Seat / tier / team and staff note',input('reason',500))
   ]);
   if(kind==='f7r-seat-close'||kind==='f7r-seat-delete')return modal(kind+'confirm:'+id,kind==='f7r-seat-delete'?'Delete seat ticket':'Close seat request',[
     label('Staff reason',input('reason',500)),...(kind==='f7r-seat-delete'?[label('Type DELETE to remove this ticket',input('confirm',6))]:[])
   ]);
   return defer(async()=>{
     let t=await seatRequest(s,id);if(t.channel_id!==i.channel_id)throw Error('Use the controls in this seat-request ticket.');const config=await seatStaff(s,t,user.id);
     if(kind==='f7r-seat-acquireconfirm'&&i.type===5){
       if(t.status!=='waiting')throw Error('This request is not waiting for seat approval.');
       const v=values(i),roles=[...new Set(v.roles||[])],policy=config.series[t.series],reason=v.reason?.trim();
       if(!roles.length||roles.length>25||roles.some(id=>!policy.assignable_roles.includes(id)))throw Error('Choose only this series’ approved seat roles. Staff can configure them at https://racecontrol.f7r.co.uk/seats.html');
       if(!reason||reason.length>500)throw Error('Add a staff note (up to 500 characters).');
       await safeSeatRoles(s,[...roles,...policy.remove_roles]);
       t=await seatUpdate(s,t,{status:'assigning',decision:{roles,remove_roles:policy.remove_roles,reason,actor:user.id,approved_at:new Date().toISOString()}});
       try{t=await finishSeat(s,t);}catch(e){await s.discord('/channels/'+t.channel_id+'/messages','POST',{content:'The seat decision is saved. Completion needs attention: '+e.message,components:rowButtons([button('Retry approved seat roles','f7r-seat-retry:'+t.id,3)]),allowed_mentions:{parse:[]}});throw e;}
       return seatRef(t)+' marked Seat acquired. Approved roles assigned. Driver DM: '+t.decision.delivery+'.';
     }
     if(kind==='f7r-seat-retry'){t=await finishSeat(s,t);return seatRef(t)+' completed. Driver DM: '+t.decision.delivery+'.';}
     if(kind==='f7r-seat-closeconfirm'&&i.type===5){if(t.status!=='waiting')throw Error('Only a waiting request can be closed.');const reason=values(i).reason?.trim();if(!reason||reason.length>500)throw Error('Add a staff reason.');t=await seatUpdate(s,t,{status:'closed',decision:{...t.decision,reason,actor:user.id,closed_at:new Date().toISOString()}});await lockSeat(s,t);await seatSummary(s,t);return seatRef(t)+' closed and retained. No seat roles were assigned.';}
     if(kind==='f7r-seat-deleteconfirm'&&i.type===5){const v=values(i),reason=v.reason?.trim();if(v.confirm?.trim()!=='DELETE'||!reason||reason.length>500)throw Error('Add a reason and type DELETE to confirm.');await deleteSeat(s,t,user.id,reason);return 'Seat ticket deleted. Its staff audit remains on the website.';}
     throw Error('Use the latest seat-request controls.');
   });
 }catch(e){return reply(e.message||'Seat requests are unavailable.');}
}
