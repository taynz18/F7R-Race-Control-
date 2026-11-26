import {APP_ID,idOK,uuidOK,button,rowButtons,safeText} from './stewards.js';
export const SERIES={F1:{colour:0xed3345},ACC:{colour:0x20bd68},LMU:{colour:0xef63b5}};
const ISO='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const display=new Intl.DisplayNames(['en'],{type:'region'}),cleanKey=s=>String(s||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const regionFlag=code=>String.fromCodePoint(...[...code].map(c=>127397+c.charCodeAt(0)));
const ukFlag=suffix=>'🏴'+String.fromCodePoint(...[...'gb'+suffix].map(c=>0xe0000+c.charCodeAt(0)),0xe007f);
const special=[{code:'ENG',name:'England',flag:ukFlag('eng')},{code:'SCO',name:'Scotland',flag:ukFlag('sct')},{code:'WAL',name:'Wales',flag:ukFlag('wls')},{code:'NIR',name:'Northern Ireland',flag:'🇬🇧'}];
export const COUNTRIES=[...special,...ISO.map(code=>({code,name:display.of(code),flag:regionFlag(code)}))];
export const COUNTRY_OPTIONS=['ENG','SCO','WAL','NIR','GB','IE','FR','DE','NL','BE','ES','PT','IT','CH','AT','DK','SE','NO','FI','PL','US','CA','AU','NZ'].map(code=>{const c=COUNTRIES.find(c=>c.code===code);return {label:c.name,value:code};}).concat({label:'Other country (enter below)',value:'OTHER'});
export function country(value){const aliases={uk:'GB',britain:'GB',greatbritain:'GB',unitedstates:'US',usa:'US',holland:'NL',czechrepublic:'CZ',southkorea:'KR',turkey:'TR'};const key=cleanKey(value),code=aliases[key];const c=COUNTRIES.find(c=>c.code===code||cleanKey(c.code)===key||cleanKey(c.name)===key);if(!c)throw Error('Choose a country, or enter its full name under Other country.');return c;}
const nameText=(value,label)=>{const n=String(value||'').normalize('NFC').trim().replace(/\s+/g,' ');if(!n||[...n].length>60||/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069<>]/u.test(n))throw Error('Check '+label+' (1–60 characters, without hidden formatting).');return n;};
export function seatProfile(series,fields){
 if(!SERIES[series])throw Error('Choose F1, ACC or LMU.');
 const online_name=nameText(fields.online,'online name'),racing_name=series==='LMU'?online_name:nameText(fields.gamertag,'gamer tag');
 if(series==='LMU'&&(online_name.split(' ').length<2||!online_name.split(' ').every(w=>/\p{L}/u.test(w))))throw Error('LMU requires your first and last racing name, not a gamer tag.');
 const c=country(fields.country==='OTHER'?fields.other:fields.country),maxName=32-3-[...c.flag].length,nickname_name=[...racing_name].slice(0,maxName).join('').trim(),nickname=nickname_name+' | '+c.flag;
 return {online_name,racing_name,country:c.name,country_code:c.code,flag:c.flag,nickname,nickname_shortened:nickname_name!==racing_name};
}
export async function seatSettings(s){return (await s.db('f7r_seat_settings?guild_id=eq.'+s.guild))[0];}
export async function seatRequest(s,id){if(!uuidOK(id))throw Error('Invalid seat request.');const t=(await s.db('f7r_seat_requests?guild_id=eq.'+s.guild+'&id=eq.'+id))[0];if(!t)throw Error('Seat request not found.');return t;}
export async function seatUpdate(s,t,changes){const rows=await s.db('f7r_seat_requests?guild_id=eq.'+s.guild+'&id=eq.'+t.id+'&revision=eq.'+t.revision,'PATCH',{...changes,revision:t.revision+1,updated_at:new Date().toISOString()});if(!rows?.length)throw Error('This request changed. Use its latest buttons and try again.');return rows[0];}
export function validateSeatSettings(c){
 if(!c||!idOK(c.desk_channel_id)||!idOK(c.category_id))throw Error('Choose the public desk channel and private ticket category.');
 const list=(v,required=false,max=25)=>{if(!Array.isArray(v)||v.length>max||required&&!v.length||v.some(id=>!idOK(id)))throw Error('Choose valid Discord roles (up to 25).');return [...new Set(v)];};
 const staff_roles=list(c.staff_roles,true),series={};
 for(const name of Object.keys(SERIES)){const v=c.series?.[name]||{};series[name]={assignable_roles:list(v.assignable_roles||[],false,100),remove_roles:list(v.remove_roles||[])};if([...series[name].assignable_roles,...series[name].remove_roles].some(id=>staff_roles.includes(id))||series[name].remove_roles.some(id=>series[name].assignable_roles.includes(id)))throw Error('Staff, seat and waiting roles must be separate.');}
 return {desk_channel_id:c.desk_channel_id,category_id:c.category_id,staff_roles,series,enabled:c.enabled===true};
}
export async function safeSeatRoles(s,ids){const [roles,bot]=await Promise.all([s.discord('/guilds/'+s.guild+'/roles'),s.member(APP_ID)]);const top=Math.max(0,...roles.filter(r=>bot.roles.includes(r.id)).map(r=>r.position)),permissions=roles.filter(r=>r.id===s.guild||bot.roles.includes(r.id)).reduce((v,r)=>v|BigInt(r.permissions||0),0n);if(ids.length&&!(permissions&8n)&&!(permissions&268435456n))throw Error('The bot needs Manage Roles.');for(const id of ids){const r=roles.find(r=>r.id===id);if(!r||id===s.guild||r.managed||r.position>=top||(BigInt(r.permissions||0)&(8n|16n|32n|268435456n|134217728n|4n|2n|8192n|536870912n|1099511627776n)))throw Error('Only ordinary seat roles below the bot may be assigned or removed.');}return roles;}
export async function seatStaff(s,t,user){const settings=await seatSettings(s),member=await s.member(user);if(user===t.driver_id||!settings?.config.staff_roles.some(id=>member.roles.includes(id)))throw Error('Only configured seat-request staff can manage another driver’s request.');return settings.config;}
export const seatRef=t=>t.series+' '+t.number;
export const seatURL=(s,t)=>'https://discord.com/channels/'+s.guild+'/'+t.channel_id;
export const seatChannelName=t=>t.series.toLowerCase()+'-'+t.number+'-'+(t.profile.racing_name.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55)||'driver');
export function seatControls(t){if(['deleted','deleting','draft','opening'].includes(t.status))return [];return rowButtons([...(t.status==='waiting'?[button('Seat acquired','f7r-seat-acquire:'+t.id,3),button('Close request','f7r-seat-close:'+t.id)]:t.status==='assigning'?[button('Retry approved seat roles','f7r-seat-retry:'+t.id,3)]:[]),button('Delete ticket · staff','f7r-seat-delete:'+t.id,4)]);}
const escape=s=>safeText(s).replace(/[\\*_~`|]/g,'\\$&');
export function seatEmbed(t){return {title:t.series+' · Full-time seat request #'+t.number,color:SERIES[t.series].colour,description:'Driver: <@'+t.driver_id+'>\nOnline name: '+escape(t.profile.online_name)+'\n'+(t.series==='LMU'?'Racing name: ':'Gamer tag: ')+escape(t.profile.racing_name)+'\nCountry: '+t.profile.country+' '+t.profile.flag+'\n**Status: '+({waiting:'Waiting for a full-time seat',assigning:'Seat approved · assigning roles',acquired:'Seat acquired',closed:'Request closed'}[t.status]||t.status)+'**\nRequested: <t:'+Math.floor(Date.parse(t.created_at)/1000)+':f>\n'+(t.profile.nickname_status==='manual_needed'?'Nickname needs staff attention: the bot could not update it.':'Server nickname: '+escape(t.profile.nickname))+(t.decision.reason?'\nStaff note: '+escape(t.decision.reason):'')};}
export async function seatSummary(s,t){const payload={embeds:[seatEmbed(t)],components:seatControls(t),allowed_mentions:{parse:[]}};let post;if(t.summary_message_id){try{post=await s.discord('/channels/'+t.channel_id+'/messages/'+t.summary_message_id,'PATCH',payload);}catch(e){if(e.status!==404)throw e;}}if(!post)post=await s.discord('/channels/'+t.channel_id+'/messages','POST',{...payload,nonce:t.id.replaceAll('-','').slice(0,20)+'s',enforce_nonce:true});if(t.summary_message_id!==post.id)t=await seatUpdate(s,t,{summary_message_id:post.id});return t;}
export async function lockSeat(s,t){for(const id of [t.driver_id])await s.discord('/channels/'+t.channel_id+'/permissions/'+id,'PUT',{type:1,allow:'66560',deny:'34816'});}
export async function finishSeat(s,t){
 if(t.status!=='assigning'&&t.status!=='acquired')throw Error('Approve the seat roles first.');
 if(t.status==='assigning'){
   const chosen=t.decision.roles,remove=t.decision.remove_roles;await safeSeatRoles(s,[...chosen,...remove]);
   for(const id of chosen)await s.discord('/guilds/'+s.guild+'/members/'+t.driver_id+'/roles/'+id,'PUT');
   let member=await s.member(t.driver_id);if(chosen.some(id=>!member.roles.includes(id)))throw Error('Some seat roles were not added. Retry the saved assignment.');
   for(const id of remove)if(member.roles.includes(id))await s.discord('/guilds/'+s.guild+'/members/'+t.driver_id+'/roles/'+id,'DELETE');
   member=await s.member(t.driver_id);if(chosen.some(id=>!member.roles.includes(id))||remove.some(id=>member.roles.includes(id)))throw Error('Role assignment is incomplete. Use Retry approved seat roles.');
   t=await seatUpdate(s,t,{status:'acquired'});
 }
 await lockSeat(s,t);t=await seatSummary(s,t);
 if(!t.decision.delivery){t=await seatUpdate(s,t,{decision:{...t.decision,delivery:'sending'}});const delivery=await s.dm(t.driver_id,{content:'Your F7R '+seatRef(t)+' request is marked **Seat acquired**. Staff have assigned your approved seat roles.\n'+t.decision.reason+'\n'+seatURL(s,t)});t=await seatUpdate(s,t,{decision:{...t.decision,delivery}});}
 return t;
}
export async function openSeatTicket(s,t,actor){
 if(actor!==t.driver_id)throw Error('This is another driver’s application.');
 if(!['draft','opening','waiting'].includes(t.status))throw Error('This request is no longer waiting.');
 if(t.status==='waiting')return seatSummary(s,t);
 const settings=await seatSettings(s);if(!settings?.config.enabled)throw Error('Seat requests are currently closed.');
 if(t.status==='draft')t=await seatUpdate(s,t,{status:'opening',snapshot:settings.config});
 else if(!t.channel_id&&Date.now()-Date.parse(t.updated_at)<30000)throw Error('Your ticket is being opened. Please wait 30 seconds and confirm again.');
 if(!t.channel_id){const channels=await s.discord('/guilds/'+s.guild+'/channels'),topic='F7R seat request '+t.id;let ch=channels.find(c=>c.topic===topic&&c.type===0);if(!ch)ch=await s.discord('/guilds/'+s.guild+'/channels','POST',{name:seatChannelName(t),topic,type:0,parent_id:t.snapshot.category_id,permission_overwrites:[{id:s.guild,type:0,allow:'0',deny:'1024'},{id:APP_ID,type:1,allow:'117776',deny:'0'},{id:t.driver_id,type:1,allow:'117760',deny:'0'},...t.snapshot.staff_roles.map(id=>({id,type:0,allow:'117760',deny:'0'}))]});t=await seatUpdate(s,t,{channel_id:ch.id});}
 if(!t.profile.nickname_status){let nickname_status='applied';try{const member=await s.member(actor);if(member.nick!==t.profile.nickname)await s.discord('/guilds/'+s.guild+'/members/'+actor,'PATCH',{nick:t.profile.nickname});}catch{nickname_status='manual_needed';}t=await seatUpdate(s,t,{profile:{...t.profile,nickname_status}});}
 t=await seatUpdate(s,t,{status:'waiting'});return seatSummary(s,t);
}
export async function deleteSeat(s,t,actor,reason){
 if(['assigning','opening'].includes(t.status))throw Error('Finish opening the ticket or assigning the seat roles before deleting.');
 if(t.status==='deleted')return t;
 if(t.status!=='deleting')t=await seatUpdate(s,t,{status:'deleting',decision:{...t.decision,deletion:{actor,reason,at:new Date().toISOString()}}});
 if(t.channel_id){let ch;try{ch=await s.discord('/channels/'+t.channel_id);}catch(e){if(e.status!==404)throw e;}if(ch){if(ch.guild_id!==s.guild||ch.type!==0||ch.topic!=='F7R seat request '+t.id||!ch.name.startsWith(t.series.toLowerCase()+'-'+t.number+'-'))throw Error('This channel is not the verified seat ticket. Nothing was deleted.');await s.discord('/channels/'+t.channel_id,'DELETE');}}
 return seatUpdate(s,t,{status:'deleted'});
}

export async function publishSeatDesk(s,settings){
 const config=settings.config;if(!config.enabled)throw Error('Enable and save the desk first.');
 const payload={embeds:[{title:'F7R · Full-time seat requests',description:'Looking for a permanent seat? Choose your series to join its waiting list.\n\n**F1 / ACC:** supply your online name, gamer tag and country.\n**LMU:** supply your first and last racing name and country.\n\nYou will see and confirm your proposed server nickname before your private ticket opens. The nickname applies across this server. Staff will contact you in your ticket when a seat is available.',color:0x27c9ad}],components:[{type:1,components:Object.keys(SERIES).map(name=>({type:2,style:2,label:name,custom_id:'f7r-seat-apply:'+name,emoji:{name:name==='F1'?'🔴':name==='ACC'?'🟢':'🩷'}}))}],allowed_mentions:{parse:[]}};
 let post;if(config.message_id){try{post=await s.discord('/channels/'+config.desk_channel_id+'/messages/'+config.message_id,'PATCH',payload);}catch(e){if(e.status!==404)throw e;}}
 if(!post)post=await s.discord('/channels/'+config.desk_channel_id+'/messages','POST',{...payload,nonce:config.desk_channel_id+'seats',enforce_nonce:true});
 const rows=await s.db('f7r_seat_settings?guild_id=eq.'+s.guild+'&revision=eq.'+settings.revision,'PATCH',{config:{...config,message_id:post.id},revision:settings.revision+1});if(!rows.length)throw Error('Desk posted, but settings changed. Refresh settings before publishing again.');
 return {url:'https://discord.com/channels/'+s.guild+'/'+config.desk_channel_id+'/'+post.id};
}
