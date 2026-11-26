import {createService,APP_ID} from '../_shared/stewards.js';
import {SERIES,validateSeatSettings,safeSeatRoles,seatSettings,publishSeatDesk} from '../_shared/seats.js';
const origins=new Set(['https://racecontrol.f7r.co.uk','https://taynz18.github.io']);
export async function handleSeats(request,env=Deno.env.get.bind(Deno.env)){
 const origin=request.headers.get('origin'),headers={'Cache-Control':'no-store',Vary:'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};if(origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
 const reply=(body,status=200)=>Response.json(body,{status,headers});
 if(origin&&!origins.has(origin))return reply({error:'Origin not allowed.'},403);if(request.method==='OPTIONS')return new Response(null,{status:204,headers});if(request.method!=='POST')return reply({error:'Use POST.'},405);
 try{
   const bearer=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!bearer)return reply({error:'Sign in with an approved Race Control admin account.'},401);
   const auth=await fetch(env('SUPABASE_URL')+'/auth/v1/user',{headers:{Authorization:'Bearer '+bearer,apikey:env('SUPABASE_ANON_KEY')}});if(!auth.ok)return reply({error:'Sign in again.'},401);
   const user=await auth.json(),s=createService(env);if(user.is_anonymous||!(await s.db('flag_admins?user_id=eq.'+user.id+'&select=user_id')).length)return reply({error:'Only approved Race Control admins can view seat requests.'},403);
   const input=await request.json(),settings=await seatSettings(s);
   if(input.action==='load'){
     const [roles,channels,requests,bot]=await Promise.all([s.discord('/guilds/'+s.guild+'/roles'),s.discord('/guilds/'+s.guild+'/channels'),s.db('f7r_seat_requests?guild_id=eq.'+s.guild+'&order=created_at.asc&limit=1000'),s.member(APP_ID)]);
     const top=Math.max(0,...roles.filter(r=>bot.roles.includes(r.id)).map(r=>r.position));
     return reply({guild_id:s.guild,settings,requests,roles:roles.filter(r=>r.id!==s.guild&&!r.managed).map(({id,name,position,permissions})=>({id,name,assignable:position<top&&!(BigInt(permissions||0)&(8n|16n|32n|268435456n|134217728n|4n|2n|8192n|536870912n|1099511627776n))})),channels:channels.filter(c=>c.type===0||c.type===4).map(({id,name,type})=>({id,name,type}))});
   }
   if(input.action==='save'){
     const config=validateSeatSettings(input.config),[roles,channels]=await Promise.all([s.discord('/guilds/'+s.guild+'/roles'),s.discord('/guilds/'+s.guild+'/channels')]);
     if(config.staff_roles.some(id=>!roles.some(r=>r.id===id&&!r.managed&&r.id!==s.guild)))throw Error('Choose existing staff roles.');
     if(!channels.some(c=>c.id===config.desk_channel_id&&c.type===0)||!channels.some(c=>c.id===config.category_id&&c.type===4))throw Error('Choose an existing public text channel and ticket category.');
     await safeSeatRoles(s,Object.values(config.series).flatMap(p=>[...p.assignable_roles,...p.remove_roles]));
     if(settings){if(input.revision!==settings.revision)throw Error('Settings changed. Refresh before saving.');if(settings.config.desk_channel_id===config.desk_channel_id&&settings.config.message_id)config.message_id=settings.config.message_id;const rows=await s.db('f7r_seat_settings?guild_id=eq.'+s.guild+'&revision=eq.'+settings.revision,'PATCH',{config,revision:settings.revision+1});if(!rows.length)throw Error('Settings changed. Refresh before saving.');}
     else await s.db('f7r_seat_settings','POST',{guild_id:s.guild,config});
     return reply({saved:true});
   }
   if(input.action==='publish'){if(!settings)throw Error('Save the desk settings first.');return reply(await publishSeatDesk(s,settings));}
   return reply({error:'Unknown seat request action.'},400);
 }catch(e){return reply({error:e.message||'Seat requests are unavailable.'},400);}
}
Deno.serve(request=>handleSeats(request));
