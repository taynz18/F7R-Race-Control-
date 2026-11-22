import {APP_ID,idOK,button,rowButtons} from './stewards.js';
import {lapMillis,formatLap,pacePanel,paceTicket,paceUpdate,paceReviewer,paceControls,paceAssessment,paceSummary,findPaceProof,assignPaceTier,ticketURL} from './pace.js';
const reply=content=>Response.json({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
const label=(name,component)=>({type:18,label:name,component});
const input=(id,style,max)=>({type:4,custom_id:id,style,max_length:max,required:true});
const modal=(id,title,components)=>Response.json({type:9,data:{custom_id:id,title,components}});
function fields(i){return Object.fromEntries((i.data.components||[]).flatMap(r=>[r.component,...r.components||[]].filter(Boolean)).map(c=>[c.custom_id,c.values?.[0]??c.value]));}
export async function paceInteraction(i,s,waitUntil){
 const [kind,id,expected]=String(i.data?.custom_id||'').split(':');if(!kind.startsWith('f7r-pace-'))return null;
 const user=i.member?.user||i.user;if(!idOK(user?.id)||user.bot||i.guild_id!==s.guild)return reply('Use this pace desk in the F7R server.');
 const defer=work=>{waitUntil((async()=>{let body;try{const result=await work();body=typeof result==='string'?{content:result}:result;}catch(e){body={content:e.message||'Pace submission unavailable. Try again.'};console.error('Pace workflow',kind,e.message);}const r=await fetch('https://discord.com/api/v10/webhooks/'+APP_ID+'/'+i.token+'/messages/@original',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,allowed_mentions:{parse:[]}})});if(!r.ok)console.error('Pace response delivery',r.status);})());return Response.json({type:5,data:{flags:64}});};
 try{
 if(kind==='f7r-pace-open')return defer(async()=>{
   const panel=await pacePanel(s,id),config=panel.config,member=await s.member(user.id);
   if(!config.enabled||config.driver_roles.length&&!config.driver_roles.some(id=>member.roles.includes(id)))throw Error('This pace desk is not available to your driver role.');
   let t=(await s.db('f7r_pace_tickets?guild_id=eq.'+s.guild+'&panel_id=eq.'+panel.id+'&driver_id=eq.'+user.id+'&status=in.(draft,review,assigning)'))[0];
   if(!t){try{t=(await s.db('f7r_pace_tickets','POST',{guild_id:s.guild,panel_id:panel.id,driver_id:user.id,snapshot:{...config,panel_revision:panel.revision,driver_name:member.nick||user.global_name||user.username},entries:{}}))[0];}catch(e){t=(await s.db('f7r_pace_tickets?guild_id=eq.'+s.guild+'&panel_id=eq.'+panel.id+'&driver_id=eq.'+user.id+'&status=in.(draft,review,assigning)'))[0];if(!t)throw e;}}
   if(!t.channel_id){
     // Claim creation. A second simultaneous click cannot create another channel.
     const claimed=await paceUpdate(s,t,{channel_id:'creating'});
     let channel;try{channel=await s.discord('/guilds/'+s.guild+'/channels','POST',{name:'pace-'+t.number,type:0,parent_id:t.snapshot.category_id,topic:'F7R pace submission '+t.id,permission_overwrites:[{id:s.guild,type:0,allow:'0',deny:'1024'},{id:user.id,type:1,allow:'117760',deny:'0'},{id:APP_ID,type:1,allow:'117776',deny:'0'},...t.snapshot.reviewer_roles.map(id=>({id,type:0,allow:'117760',deny:'0'}))]});}catch(e){await paceUpdate(s,claimed,{channel_id:null});throw e;}
     t=await paceUpdate(s,claimed,{channel_id:channel.id});
     await s.discord('/channels/'+channel.id+'/messages','POST',{content:'<@'+user.id+'> **Pace submission #'+t.number+'**',embeds:[{description:t.snapshot.instructions+'\n\nRequired tracks:\n'+t.snapshot.tracks.map((x,n)=>(n+1)+'. '+x.name).join('\n')+'\n\nUpload a screenshot, then press **Add / update track time** to choose its track and enter the time. Repeat for every track, then submit for admin review. You can chat here without interrupting submission. Saved progress stays in this ticket.'}],components:paceControls(t),allowed_mentions:{parse:[],users:[user.id]}});
   }
   if(t.channel_id==='creating')return 'Your private ticket is being created. Wait a moment and press Submit TT times again.';
   return {content:'Your private pace ticket is ready. Upload your screenshots there.',components:rowButtons([{type:2,style:5,label:'Open private pace ticket',url:ticketURL(s,t)}])};
 });
 const t=await paceTicket(s,id);if(t.channel_id!==i.channel_id)return reply('Use the buttons inside this private pace ticket.');
 if(['f7r-pace-track','f7r-pace-submit','f7r-pace-cancel'].includes(kind)){
   if(t.driver_id!==user.id||t.status!=='draft')return reply('Only this driver can update an open draft. Submitted times need an admin to request corrections.');
   if(kind==='f7r-pace-track'){
     if(i.type!==5)return modal(kind+':'+t.id+':'+t.revision,'Add a track time',[
       label('Track for your latest unused screenshot',{type:3,custom_id:'track',options:t.snapshot.tracks.map(x=>({label:x.name,value:x.id})),min_values:1,max_values:1}),label('Lap time (m:ss.mmm)',input('time',1,12))]);
     return defer(async()=>{if(Number(expected)!==t.revision)throw Error('This ticket changed. Reopen Add / update track time.');const v=fields(i),track=t.snapshot.tracks.find(x=>x.id===v.track);if(!track)throw Error('Choose a required track.');const ms=lapMillis(v.time),proof=await findPaceProof(s,t,user.id,track.id);
       const saved=await paceUpdate(s,t,{entries:{...t.entries,[track.id]:{ms,proof}}});
       await s.discord('/channels/'+t.channel_id+'/messages','POST',{content:'**'+track.name+' saved: '+formatLap(ms)+'** · '+Object.keys(saved.entries).length+'/'+t.snapshot.tracks.length+' tracks complete.\nScreenshot: https://discord.com/channels/'+s.guild+'/'+t.channel_id+'/'+proof.message_id,components:paceControls(saved),allowed_mentions:{parse:[]}});
       return 'Track time and screenshot saved. Continue in your private ticket.';
     });
   }
   if(kind==='f7r-pace-cancel')return defer(async()=>{await paceUpdate(s,t,{status:'cancelled'});await s.discord('/channels/'+t.channel_id+'/permissions/'+user.id,'PUT',{type:1,allow:'66560',deny:'34816'});return 'Submission cancelled. This ticket is retained read-only. You can start a new ticket from the pace desk.';});
   return defer(async()=>{paceAssessment(t.snapshot,t.entries);const updated=await paceUpdate(s,t,{status:'review'});await paceSummary(s,updated,true);return 'All times submitted. A pace admin will check your screenshots and approve your tier. You can still talk in your ticket.';});
 }
 await paceReviewer(s,t,user.id);
 if(kind==='f7r-pace-return'){
   if(t.status!=='review')return reply('Only a submission awaiting review can be returned.');
   if(i.type!==5)return modal(kind+':'+t.id+':'+t.revision,'Request corrections',[label('What should the driver correct?',input('reason',2,1000))]);
   return defer(async()=>{if(Number(expected)!==t.revision)throw Error('Ticket changed. Reopen the review.');const reason=fields(i).reason?.trim();if(!reason)throw Error('Explain what needs correcting.');const updated=await paceUpdate(s,t,{status:'draft',decision:{returned_by:user.id,reason}});await s.discord('/channels/'+t.channel_id+'/messages','POST',{content:'<@'+t.driver_id+'> **Corrections requested**\n'+reason,components:paceControls(updated),allowed_mentions:{parse:[],users:[t.driver_id]}});return 'The driver can now correct their times or screenshots.';});
 }
 if(kind==='f7r-pace-review'){
   if(t.status!=='review')return reply('This pace submission is not awaiting approval.');
   const assessment=paceAssessment(t.snapshot,t.entries);
   if(i.type!==5)return modal(kind+':'+t.id+':'+t.revision,'Verify screenshots and assign tier',[
     label(('Final tier (suggested: '+assessment.tier.name+')').slice(0,45),{type:3,custom_id:'tier',options:t.snapshot.tiers.map(x=>({label:x.name,value:x.role_id,default:x.role_id===assessment.tier.role_id})),min_values:1,max_values:1}),
     label('Approval reason / explanation for any override',input('reason',2,1000)),label('Type VERIFIED after checking every screenshot',input('verified',1,8))]);
   return defer(async()=>{if(Number(expected)!==t.revision)throw Error('The driver submission changed. Review it again.');const v=fields(i),tier=t.snapshot.tiers.find(x=>x.role_id===v.tier);if(!tier||v.verified?.trim()!=='VERIFIED'||!v.reason?.trim())throw Error('Choose a tier, provide a reason and type VERIFIED after checking the screenshots.');
     const claimed=await paceUpdate(s,t,{status:'assigning',decision:{tier,reason:v.reason.trim(),actor:user.id,at:new Date().toISOString(),suggested:assessment.tier,gap:assessment.gap}});
     try{const result=await assignPaceTier(s,claimed);return 'Approved and assigned '+tier.name+'. Driver DM: '+result.delivery+'. The ticket is retained read-only.';}catch(e){await s.discord('/channels/'+t.channel_id+'/messages','POST',{content:'Approval is saved, but role assignment / delivery needs attention: '+e.message,components:paceControls(claimed),allowed_mentions:{parse:[]}});throw e;}
   });
 }
 if(kind==='f7r-pace-retry')return defer(async()=>{const result=await assignPaceTier(s,t);return 'Approved tier assigned. Driver DM: '+result.delivery;});
 return reply('Use the latest pace ticket controls.');
 }catch(e){return reply(e.message||'Pace submission unavailable.');}
}