import test from 'node:test';
import assert from 'node:assert/strict';
import {verdictView,accessFor,evidenceLinks,penalties,tally,sendOutcomes,reviewChannel,evidenceTicket,collectEvidence,refreshEvidence,APP_ID} from '../supabase/functions/_shared/stewards.js';
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
 let response=await (await stewardInteraction(i,s,()=>{})).json();assert.equal(response.type,9);assert.equal(response.data.components[0].component.type,5);
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
 const calls=[];const s={guild:'guild',discord:async(path,method,body)=>{calls.push({path,body});return {id:'channel'};},db:async()=>{}};
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
 const calls=[],s={guild:'guild',incident:async()=>c,db:async()=>{},discord:async(path,method,body)=>{calls.push({path,body});return {id:'ticket'};}};
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
 s.discord=async()=>[{author:{id:driver},content:'',attachments:[]}];await assert.rejects(()=>collectEvidence(s,incident,'report',driver),/Mention/);
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
