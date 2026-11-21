import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureMessageReading,deleteTicket,ticketDeleteAccess,notifyDefence,verdictView,accessFor,evidenceLinks,penalties,tally,sendOutcomes,reviewChannel,evidenceTicket,collectEvidence,refreshEvidence,APP_ID} from '../supabase/functions/_shared/stewards.js';
import {stewardInteraction} from '../supabase/functions/_shared/steward-interactions.js';
const driver='123456789012345678',accused='223456789012345678',steward='323456789012345678',leader='423456789012345678';
const config={enabled:true,driver_roles:['driver'],steward_roles:['steward'],leader_roles:['leader']};
const c={id:'11111111-1111-4111-8111-111111111111',number:1001,reporter_id:driver,accused_id:accused,data:{race:'Monza',lap:'Lap 1',report:{statement:'First statement',links:['https://example.com/video']},defence:{statement:'Second statement',links:['https://example.com/defence']}},route_id:'f1',status:'discussion'};
test('only assigned roles review and involved stewards sit out',()=>{
 assert.equal(accessFor(['steward'],config,steward,c).steward,true);
 assert.equal(accessFor(['leader'],config,leader,c).leader,true);
 assert.equal(accessFor(['leader'],config,driver,c).steward,false);
 assert.equal(accessFor(['driver'],config,steward,c).steward,false);
});
test('F1 and Endurance penalty ranges remain separate',()=>{
 assert.ok(penalties('F1').includes('20 seconds'));assert.ok(!penalties('F1').includes('25 seconds'));
 assert.ok(penalties('Endurance').includes('50 seconds'));
 for(const set of ['F1','Endurance'])for(const penalty of ['No further action','Qualifying ban','Race ban','Season ban'])assert.ok(penalties(set).includes(penalty));
});
test('one vote per steward and ties retain all joint leaders',()=>{
 const votes={[steward]:{penalty:'5 seconds'},[leader]:{penalty:'Warning'}};
 assert.equal(tally(votes).count,2);assert.deepEqual(tally(votes).winners.sort(),['5 seconds','Warning']);
 votes[steward]={penalty:'Warning'};assert.deepEqual(tally(votes).totals,{Warning:2});
});
test('evidence stores HTTPS links only and never fetches them',()=>{
 assert.deepEqual(evidenceLinks('https://example.com/a\nhttps://example.com/b'),['https://example.com/a','https://example.com/b']);
 assert.deepEqual(evidenceLinks(''),[]);
 for(const value of ['javascript:alert(1)','http://example.com','https://user:pass@example.com'])assert.throws(()=>evidenceLinks(value));
});
test('report modal is private and restricts the driver role',async()=>{
 const i={type:3,data:{custom_id:'f7r-stew-report:f1'},member:{user:{id:driver}}};
 const s={route:async()=>({id:'f1',config}),member:async()=>({roles:['driver']})};
 let response=await (await stewardInteraction(i,s,()=>{})).json();assert.equal(response.type,9);assert.equal(response.data.components[0].component.type,5);assert.equal(response.data.components.find(x=>x.component.custom_id==='statement').component.min_length,1);
 s.member=async()=>({roles:[]});response=await(await stewardInteraction(i,s,()=>{})).json();assert.equal(response.data.flags,64);assert.match(response.data.content,/role/);
});
test('only the reported driver can open the defence and cannot resubmit it',async()=>{
 const s={incident:async()=>({...c,status:'awaiting_defence'}),member:async()=>({roles:['driver']})};
 let i={type:3,data:{custom_id:'f7r-stew-defend:'+c.id},user:{id:driver}};
 assert.equal((await(await stewardInteraction(i,s,()=>{})).json()).type,4);
 i.user.id=accused;assert.equal((await(await stewardInteraction(i,s,()=>{})).json()).type,9);
 s.incident=async()=>c;assert.equal((await(await stewardInteraction(i,s,()=>{})).json()).type,4);
});
test('review room denies both drivers and everyone while allowing assigned staff',async()=>{
 const calls=[];const s={guild:'guild',discord:async(path,method,body)=>{if(path==='/applications/@me')return {flags:1<<19};if(path==='/applications/@me')return {flags:1<<19};calls.push({path,body});return {id:'channel'};},db:async()=>{}};
 await reviewChannel(s,c,{config:{...config,name:'Tier 1'}});
 const permissions=calls[0].body.permission_overwrites;
 for(const id of ['guild',driver,accused])assert.ok(permissions.some(p=>p.id===id&&p.deny==='1024'));
 assert.ok(permissions.some(p=>p.id==='steward'&&p.allow!=='0'));
 assert.equal(calls[1].body.embeds.length,2);
});
test('final notifications are claimed before delivery and cannot send twice',async()=>{
 const claims=new Set(),sent=[];const s={action:async(c,a,l,action,v)=>{if(action==='claim_notification'){if(claims.has(v.recipient))throw Error('already attempted');claims.add(v.recipient);}},dm:async(id,body)=>{sent.push({id,body});return 'sent';}};
 const closed={...c,status:'closed',outcome:'5 seconds',explanation:'The stewards agreed the reported driver caused avoidable contact.'};
 await sendOutcomes(s,closed,steward,true);await sendOutcomes(s,closed,steward,true);
 assert.deepEqual(sent.map(x=>x.id),[driver,accused]);assert.ok(sent.every(x=>x.body.content.includes('5 seconds')));
});
test('no new interaction can bypass the attendance signature verification',async()=>{
 const {readFile}=await import('node:fs/promises');const code=await readFile(new URL('../supabase/functions/f7r-discord-interactions/index.js',import.meta.url),'utf8');
 assert.ok(code.indexOf('crypto.subtle.verify')<code.indexOf('return await stewardInteraction'));
});
test('private clip tickets allow only the submitting driver and deny the other driver',async()=>{
 const calls=[],s={guild:'guild',incident:async()=>c,db:async()=>{},discord:async(path,method,body)=>{if(path==='/applications/@me')return {flags:1<<19};calls.push({path,body});return {id:'ticket'};}};
 await evidenceTicket(s,c,{config},'report');
 const p=calls[0].body.permission_overwrites;
 assert.ok(p.some(x=>x.id===driver&&x.allow!=='0'&&x.deny==='0'));
 assert.ok(p.some(x=>x.id===accused&&x.deny==='1024'));
 assert.match(calls[1].body.content,/Video evidence is mandatory/);assert.doesNotMatch(calls[1].body.content,/No video|still submit/);
 assert.ok(calls[1].body.content.length<=2000);
});
test('clips remain on Discord; only links and source metadata are captured',async()=>{
 const incident={...c,data:{...c.data,report_ticket:'ticket'}};
 const s={discord:async()=>[{id:'message',author:{id:driver},content:'<@'+APP_ID+'>',attachments:[{id:'clip',filename:'contact.mp4',content_type:'video/mp4',url:'https://cdn.discordapp.com/clip'}]},{id:'other',author:{id:accused},content:'',attachments:[{id:'unrelated'}]}]};
 const result=await collectEvidence(s,incident,'report',driver);
 assert.equal(result.clips.length,1);assert.equal(result.clips[0].message_id,'message');assert.equal(result.no_video,false);assert.ok(!JSON.stringify(result).includes('base64'));
 s.discord=async()=>[];const empty=await collectEvidence(s,{...incident,data:{report:{links:[]},report_ticket:'ticket'}},'report',driver);assert.equal(empty.no_video,true);
 s.discord=async()=>[{author:{id:driver},content:'',attachments:[]}];await assert.rejects(()=>collectEvidence(s,incident,'report',driver),/Automatic reading is unavailable/);
});
test('Discord attachment links are refreshed from their original messages',async()=>{
 const incident=structuredClone(c);incident.data.report={external_links:[],clips:[{channel_id:'channel',message_id:'message',attachment_id:'clip',url:'https://cdn.discordapp.com/old'}]};
 await refreshEvidence({discord:async()=>({attachments:[{id:'clip',url:'https://cdn.discordapp.com/fresh'}]})},incident);
 assert.deepEqual(incident.data.report.links,['https://cdn.discordapp.com/fresh']);
});
test('in-game appeals are visible only to leaders and notify only the appealing driver',async()=>{
 const appeal={...c,data:{...c.data,kind:'penalty_appeal',original_penalty:'10 seconds'},accused_id:APP_ID,outcome:'In-game penalty removed',explanation:'The footage confirms the penalty was incorrectly applied.'};
 assert.equal(accessFor(['steward'],config,steward,appeal).steward,false);
 assert.equal(accessFor(['leader'],config,leader,appeal).leader,true);
 const recipients=[];await sendOutcomes({action:async()=>{},dm:async(id)=>{recipients.push(id);return 'sent';}},appeal,leader,true);
 assert.deepEqual(recipients,[driver]);
});

test('reporting-driver verdict is isolated and notifications identify the correct driver',async()=>{
 const raw={...c,status:'closed',outcome:'No further action',votes:{original:{penalty:'No further action'}},data:{...c.data,reporter_verdict:{status:'closed',outcome:'10 seconds',explanation:'The reporting driver caused avoidable contact.',votes:{second:{penalty:'10 seconds'}},notifications:{}}}};
 const v=verdictView(raw,'reporter');assert.equal(v.outcome,'10 seconds');assert.equal(raw.outcome,'No further action');assert.deepEqual(Object.keys(v.votes),['second']);
 const claims=new Set(),sent=[],actions=[];
 const s={action:async(c,a,l,action,value)=>{actions.push(value);if(action==='claim_notification'){const key=value.target+value.recipient;if(claims.has(key))throw Error('duplicate');claims.add(key);}},dm:async(id,body)=>{sent.push({id,body});return 'sent';}};
 await sendOutcomes(s,raw,leader,true,'reporter');await sendOutcomes(s,raw,leader,true,'reporter');await sendOutcomes(s,raw,leader,true);
 assert.equal(sent.length,4);assert.ok(sent.slice(0,2).every(x=>x.body.content.includes('Outcome for the reporting driver:')&&x.body.content.includes('10 seconds')));
 assert.ok(sent.slice(2).every(x=>x.body.content.includes('Outcome for the reported driver:')&&x.body.content.includes('No further action')));
 assert.ok(actions.some(x=>x.target==='reporter'));assert.throws(()=>verdictView({...raw,data:{kind:'penalty_appeal'}},'reporter'));
});
test('Discord verdict selection uses a private menu then opens the correct independent vote',async()=>{
 const raw={...c,status:'voting',penalty_set:'F1',votes:{},data:{...c.data,reporter_verdict:{status:'voting',penalty_set:'Endurance',votes:{}}}};
 const s={incident:async()=>raw,route:async()=>({config}),member:async()=>({roles:['steward']}),db:async()=>[raw]};
 let r=await(await stewardInteraction({type:2,data:{name:'verdict'},channel_id:'review',user:{id:steward}},s,()=>{})).json();
 assert.equal(r.type,4);assert.equal(r.data.flags,64);assert.equal(r.data.components[0].components[0].type,3);
 r=await(await stewardInteraction({type:3,data:{custom_id:'f7r-stew-pick:'+c.id,values:['reporter']},user:{id:steward}},s,()=>{})).json();
 assert.equal(r.type,9);assert.match(r.data.custom_id,/:reporter$/);assert.match(r.data.title,/reporting driver/);assert.ok(r.data.components[0].component.options.some(x=>x.value==='50 seconds'));
 delete raw.data.reporter_verdict;
 r=await(await stewardInteraction({type:3,data:{custom_id:'f7r-stew-verdict:'+c.id+':reporter'},user:{id:steward}},s,()=>{})).json();
 assert.equal(r.type,9);assert.ok(r.data.components.some(x=>x.component.custom_id==='reason'));
});

test('Discord head stewards can open finalisation while ordinary stewards cannot',async()=>{
 const raw={...c,status:'voting',revision:8,penalty_set:'F1',votes:{[steward]:{penalty:'5 seconds'}},data:{...c.data}};
 const s={incident:async()=>raw,route:async()=>({config}),member:async id=>({roles:[id===leader?'leader':'steward']})};
 const interaction=id=>({type:3,data:{custom_id:'f7r-stew-close:'+c.id+':accused'},user:{id}});
 let r=await(await stewardInteraction(interaction(steward),s,()=>{})).json();assert.equal(r.type,4);assert.match(r.data.content,/Only a Head/);
 r=await(await stewardInteraction(interaction(leader),s,()=>{})).json();assert.equal(r.type,9);assert.ok(r.data.custom_id.endsWith(':accused:8'));
 raw.status='tied';raw.votes[leader]={penalty:'Warning'};
 r=await(await stewardInteraction(interaction(leader),s,()=>{})).json();assert.equal(r.data.components[0].component.options.length,2);
});
test('Discord finalisation checks the reviewed revision and sends the approved outcome',async()=>{
 const raw={...c,status:'voting',revision:8,penalty_set:'F1',votes:{[steward]:{penalty:'5 seconds'}}},actions=[],sent=[],pending=[];
 const s={incident:async()=>raw,route:async()=>({config}),member:async()=>({roles:['leader']}),action:async(c,a,l,name,value,revision)=>{actions.push({name,value,revision});return {...raw,status:'closed',outcome:'5 seconds',explanation:value.explanation};},dm:async id=>{sent.push(id);return 'sent';}};
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({});
 try{
 const r=await(await stewardInteraction({type:5,data:{custom_id:'f7r-stew-close:'+c.id+':accused:8',components:[{component:{custom_id:'explanation',value:'The evidence shows avoidable contact.'}}]},user:{id:leader},token:'test'},s,p=>pending.push(p))).json();assert.equal(r.type,5);await Promise.all(pending);
 assert.equal(actions[0].name,'close_vote');assert.equal(actions[0].revision,8);assert.deepEqual(sent,[driver,accused]);
 }finally{globalThis.fetch=original;}
});

test('eligible drivers can report members without the group role and open separate tickets',async()=>{
 const rows=[],channels=[],dms=[],replies=[],tasks=[];let seq=0;
 const service={guild:'guild',route:async()=>({id:'f1',config}),member:async id=>({roles:id===driver?['driver']:[],user:{id,username:'Driver'}}),incident:async id=>rows.find(r=>r.id===id),
 db:async(path,method='GET',body)=>{
   if(method==='POST'){const row={...body,id:'11111111-1111-4111-8111-'+String(++seq).padStart(12,'0'),number:1000+seq};rows.push(row);return [row];}
   if(method==='PATCH'){const row=rows.find(r=>path.endsWith(r.id));Object.assign(row,body);return [row];}
   if(path.includes('interaction_id=eq.'))return rows.filter(r=>r.interaction_id===path.split('interaction_id=eq.')[1]);
   return rows;
 },discord:async(path,method,body)=>{if(path==='/applications/@me')return {flags:1<<19};if(path.endsWith('/channels')){const channel={id:'ticket-'+(channels.length+1)};channels.push({channel,body});return channel;}return {id:'message'};},
 dm:async(id,body)=>{dms.push({id,body});return 'sent';}};
 const submit=(id,other)=>({id,type:5,user:{id:driver},token:'test',data:{custom_id:'f7r-stew-submit:f1',components:Object.entries({driver:other,race:'Monza',lap:'Lap 1',statement:'test',links:''}).map(([custom_id,value])=>({component:{custom_id,value}}))}});
 const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{replies.push(JSON.parse(options.body));return Response.json({});};
 try{
   for(const [id,other] of [['first',accused],['second',leader]]){assert.equal((await(await stewardInteraction(submit(id,other),service,p=>tasks.push(p))).json()).type,5);await tasks.pop();}
   assert.equal(rows.length,2);assert.equal(channels.length,2);assert.notEqual(rows[0].data.report_ticket,rows[1].data.report_ticket);assert.ok(rows.every(r=>r.status==='awaiting_report_evidence'));
   assert.ok(replies.every(r=>r.components[0].components.some(b=>b.label==='Report another incident')));
   assert.ok(dms.every(r=>r.body.components[0].components.some(b=>b.label==='Open private video ticket')));
   const again=await(await stewardInteraction({type:3,user:{id:driver},data:{custom_id:'f7r-stew-report:f1'}},service,()=>{})).json();assert.equal(again.type,9);
   await stewardInteraction(submit('first',accused),service,p=>tasks.push(p));await tasks.pop();assert.equal(rows.length,2);
 }finally{globalThis.fetch=original;}
});

test('report, defence and steward review stay in one category ticket with sequential driver access',async()=>{
 const raw=structuredClone(c);raw.status='awaiting_report_evidence';const calls=[];let channels=0;
 const s={guild:'guild',incident:async()=>raw,db:async(path,method,body)=>{Object.assign(raw,body);return[raw];},dm:async()=> 'sent',discord:async(path,method,body)=>{if(path==='/applications/@me')return {flags:1<<19};calls.push({path,method,body});if(path==='/guilds/guild/channels'){channels++;return{id:'same-ticket'};}return{id:'message'};}};
 const route={config:{...config,name:'Tier 4',category_id:'tier4-incidents'}};
 await evidenceTicket(s,raw,route,'report');
 assert.equal(calls[0].body.parent_id,'tier4-incidents');assert.equal(calls[0].body.name,'case-1001');
 assert.ok(calls[0].body.permission_overwrites.some(p=>p.id==='steward'&&p.allow!=='0'));
 raw.status='awaiting_defence';raw.data.report.locked=true;
 const before=calls.length;await notifyDefence(s,raw);
 assert.equal(calls[before].path,'/channels/same-ticket/permissions/'+driver);assert.equal(calls[before].body.deny,'1024');
 assert.equal(calls[before+1].path,'/channels/same-ticket/permissions/'+accused);assert.equal(calls[before+1].body.deny,'0');
 assert.equal(raw.data.defence_ticket,raw.data.report_ticket);
 raw.status='awaiting_defence_evidence';await evidenceTicket(s,raw,route,'defence');assert.equal(channels,1);
 raw.status='discussion';raw.data.defence.locked=true;
 const review=await reviewChannel(s,raw,route);assert.equal(review,'same-ticket');assert.equal(raw.review_channel_id,'same-ticket');assert.equal(channels,1);
 const permissionCalls=calls.filter(c=>c.method==='PUT');assert.ok(permissionCalls.slice(-2).every(p=>p.body.deny==='1024'));
 const final=calls.at(-1).body;assert.equal(final.embeds.length,2);assert.ok(final.components[0].components.some(b=>b.label==='Start / view verdict'));
});
test('failed reporter removal never admits the reported driver',async()=>{
 const raw={...c,status:'awaiting_defence',data:{...c.data,report:{locked:true},report_ticket:'ticket'}},calls=[];
 await assert.rejects(()=>notifyDefence({discord:async path=>{calls.push(path);throw Error('Permission denied');}},raw),/Permission denied/);
 assert.deepEqual(calls,['/channels/ticket/permissions/'+driver]);
});

test('report target flexibility never permits unapproved reporters, bots or self reports',async()=>{
 const replies=[],pending=[],original=globalThis.fetch;globalThis.fetch=async(url,options)=>{replies.push(JSON.parse(options.body));return Response.json({});};
 const base={id:'report',type:5,user:{id:driver},token:'test',data:{custom_id:'f7r-stew-submit:f1',components:[{component:{custom_id:'driver',values:[accused]}}]}};
 const service={route:async()=>({id:'f1',config}),member:async id=>({roles:id===driver?['driver']:[],user:{id,bot:id===accused}}),db:async()=>{throw Error('Rejected submissions must not save a case');}};
 const submit=async i=>{await stewardInteraction(i,service,p=>pending.push(p));await pending.pop();return replies.at(-1).content;};
 const error=console.error;console.error=()=>{};
 try{
   assert.match(await submit(base),/not a bot/);
   assert.match(await submit({...base,data:{...base.data,components:[{component:{custom_id:'driver',values:[driver]}}]}}),/other driver/);
   service.member=async id=>({roles:[],user:{id}});
   assert.match(await submit(base),/desk is unavailable/);
 }finally{console.error=error;globalThis.fetch=original;}
});

test('empty descriptions get a clear error before creating a case or channel',async()=>{
 const pending=[],replies=[],original=globalThis.fetch,log=console.error;globalThis.fetch=async(url,options)=>{replies.push(JSON.parse(options.body));return Response.json({});};console.error=()=>{};
 const s={route:async()=>({id:'f1',config}),member:async id=>({roles:['driver'],user:{id}}),db:async(path,method)=>{assert.notEqual(method,'POST');return[];},discord:async()=>{throw Error('Must not create a ticket for rejected form');}};
 try{
 await stewardInteraction({type:5,id:'short',user:{id:driver},token:'test',data:{custom_id:'f7r-stew-submit:f1',components:Object.entries({driver:accused,race:'Monza',lap:'Lap 1',statement:' ',links:''}).map(([custom_id,value])=>({component:{custom_id,value}}))}},s,p=>pending.push(p));await Promise.all(pending);
 assert.match(replies[0].content,/Enter an incident description/);
 }finally{globalThis.fetch=original;console.error=log;}
});

test('automatic reading enables only the limited message-content flag and verifies the result',async()=>{
 const calls=[];let flags=1<<13;
 await ensureMessageReading({discord:async(path,method,body)=>{calls.push({path,method,body});if(method==='PATCH')flags=body.flags;return {flags};}});
 assert.equal(calls[1].body.flags,(1<<13)|(1<<19));
 const before=calls.length;await ensureMessageReading({discord:async()=>{calls.push({});return {flags:1<<19};}});assert.equal(calls.length,before+1);
 await assert.rejects(()=>ensureMessageReading({discord:async()=>({flags:0})}),/has not enabled/);
});
test('only assigned non-involved stewards or server admin staff can delete a ticket',async()=>{
 const s={guild:'guild',route:async()=>({config}),member:async()=>({roles:['steward']})};
 assert.equal((await ticketDeleteAccess(s,c,steward)).steward,true);
 await assert.rejects(()=>ticketDeleteAccess(s,c,driver),/Involved drivers/);
 s.member=async()=>({roles:['unrelated']});s.discord=async()=>[{id:'unrelated',permissions:'0'}];await assert.rejects(()=>ticketDeleteAccess(s,c,steward),/Only assigned/);
 s.discord=async()=>[{id:'unrelated',permissions:'8'}];assert.equal((await ticketDeleteAccess(s,c,steward)).steward,true);
});
test('deletion removes only verified case channels and records completion without outcome DMs',async()=>{
 const calls=[],raw={...c,revision:4},claimed={...raw,data:{...raw.data,deletion:{channels:['one','two']}}};
 const s={guild:'guild',route:async()=>({config:{report_channel:'desk',category_id:'category'}}),action:async(c,a,l,name,value)=>{calls.push({name,value});return claimed;},discord:async(path,method)=>{calls.push({path,method});return {guild_id:'guild',type:0,name:'case-1001'};}};
 await deleteTicket(s,raw,steward,false,'Duplicate report',4);assert.equal(calls.filter(x=>x.method==='DELETE').length,2);assert.equal(calls.at(-1).name,'delete_ticket_complete');
 s.discord=async()=>({guild_id:'other-guild',type:0,name:'case-1001'});await assert.rejects(()=>deleteTicket(s,raw,steward,false,'Duplicate',4),/not this case/);
 claimed.data.deletion.channels=['category'];await assert.rejects(()=>deleteTicket(s,raw,steward,false,'Duplicate',4),/Refusing/);
});
test('driver cannot obtain a delete confirmation and a steward must explicitly confirm',async()=>{
 const s={incident:async()=>({...c,revision:2}),route:async()=>({config}),member:async()=>({roles:['steward']})};
 let r=await(await stewardInteraction({type:3,user:{id:driver},data:{custom_id:'f7r-stew-delete:'+c.id}},s,()=>{})).json();assert.match(r.data.content,/cannot delete/);
 r=await(await stewardInteraction({type:3,user:{id:steward},data:{custom_id:'f7r-stew-delete:'+c.id}},s,()=>{})).json();assert.equal(r.type,9);assert.ok(r.data.components.some(x=>x.component.custom_id==='confirm_value'));
});

