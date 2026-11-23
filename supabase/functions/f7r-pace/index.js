import {createService,idOK,groupReference,button,rowButtons} from '../_shared/stewards.js';
import {validatePace,validatePaceRoles,pacePanel,paceAssessment} from '../_shared/pace.js';
const origins=new Set(['https://racecontrol.f7r.co.uk','https://taynz18.github.io']);
export async function handlePace(request,env=Deno.env.get.bind(Deno.env)){
 const origin=request.headers.get('origin'),headers={'Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};if(origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
 const reply=(body,status=200)=>Response.json(body,{status,headers});
 if(origin&&!origins.has(origin))return reply({error:'Origin not allowed.'},403);if(request.method==='OPTIONS')return new Response(null,{status:204,headers});if(request.method!=='POST')return reply({error:'Use POST.'},405);
 try{
 const bearer=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!bearer)return reply({error:'Sign in with your approved admin account.'},401);
 const auth=await fetch(env('SUPABASE_URL')+'/auth/v1/user',{headers:{Authorization:'Bearer '+bearer,apikey:env('SUPABASE_ANON_KEY')}});if(!auth.ok)return reply({error:'Sign in again.'},401);
 const user=await auth.json(),s=createService(env);if(user.is_anonymous||!(await s.db('flag_admins?user_id=eq.'+user.id+'&select=user_id')).length)return reply({error:'Pace control is restricted to approved Race Control admins.'},403);
 const input=await request.json(),action=input.action;
 if(action==='load'){
   const [panels,channels,roles,tickets]=await Promise.all([s.db('f7r_pace_panels?guild_id=eq.'+s.guild),s.discord('/guilds/'+s.guild+'/channels'),s.discord('/guilds/'+s.guild+'/roles'),s.db('f7r_pace_tickets?guild_id=eq.'+s.guild+'&order=created_at.desc&limit=1000')]);
   return reply({guild_id:s.guild,panels,channels:channels.filter(c=>[0,4].includes(c.type)).map(({id,name,type})=>({id,name,type})),roles:roles.filter(r=>r.id!==s.guild&&!r.managed).map(({id,name})=>({id,name})),tickets:tickets.map(t=>({id:t.id,number:t.number,panel_id:t.panel_id,driver_id:t.driver_id,name:t.snapshot.driver_name,status:t.status,channel_id:t.channel_id,created_at:t.created_at,snapshot:t.snapshot,entries:t.entries,decision:t.decision}))});
 }
 if(action==='save'){
   const id=groupReference(input.id);if(!id)throw Error('Enter a panel reference.');const config=validatePace(input.config);
   const channels=await s.discord('/guilds/'+s.guild+'/channels');if(!channels.some(c=>c.id===config.channel_id&&c.type===0)||!channels.some(c=>c.id===config.category_id&&c.type===4))throw Error('Choose an existing text channel and category.');
   await validatePaceRoles(s,config);
   const prior=(await s.db('f7r_pace_panels?guild_id=eq.'+s.guild+'&id=eq.'+id))[0];
   if(prior){if(!Number.isInteger(input.revision)||input.revision!==prior.revision)throw Error('Settings changed. Reload before saving.');if(prior.config.panel_message_id&&prior.config.channel_id===config.channel_id)config.panel_message_id=prior.config.panel_message_id;const rows=await s.db('f7r_pace_panels?guild_id=eq.'+s.guild+'&id=eq.'+id+'&revision=eq.'+prior.revision,'PATCH',{config,revision:prior.revision+1});if(!rows.length)throw Error('Settings changed. Reload before saving.');}
   else await s.db('f7r_pace_panels','POST',{guild_id:s.guild,id,config});return reply({saved:true,id});
 }
 if(action==='publish'){
   const panel=await pacePanel(s,input.id),c=panel.config;if(!c.enabled)throw Error('Enable and save the panel first.');await validatePaceRoles(s,c);
   const payload={embeds:[{title:'F7R · '+c.name,description:'Submit your qualifying lap times and screenshot proof in a private ticket. **Qualifying laps only: Time Trial laps are not accepted.** A pace admin checks every screenshot before assigning your tier.\n\n**Required tracks**\n'+c.tracks.map((t,i)=>(i+1)+'. '+t.name).join('\n')+'\n\n'+c.instructions+'\n\nTier suggestion uses the average percentage gap from the track benchmarks. Your admin makes the final decision.',color:0x27c9ad}],components:rowButtons([button('Submit qualifying times','f7r-pace-open:'+panel.id,3)]),allowed_mentions:{parse:[]}};
   let post;if(c.panel_message_id){try{post=await s.discord('/channels/'+c.channel_id+'/messages/'+c.panel_message_id,'PATCH',payload);}catch(e){if(e.status!==404)throw e;}}
   if(!post)post=await s.discord('/channels/'+c.channel_id+'/messages','POST',payload);
   await s.db('f7r_pace_panels?guild_id=eq.'+s.guild+'&id=eq.'+panel.id+'&revision=eq.'+panel.revision,'PATCH',{config:{...c,panel_message_id:post.id},revision:panel.revision+1});return reply({url:'https://discord.com/channels/'+s.guild+'/'+c.channel_id+'/'+post.id});
 }
 return reply({error:'Unknown pace action.'},400);
 }catch(e){return reply({error:e.message||'Pace control unavailable.'},400);}
}
Deno.serve(request=>handlePace(request));