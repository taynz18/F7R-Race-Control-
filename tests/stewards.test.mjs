import test from 'node:test';
import assert from 'node:assert/strict';
import {accessFor,evidenceLinks,penalties,tally,sendOutcomes,reviewChannel} from '../supabase/functions/_shared/stewards.js';
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
 for(const value of ['', 'javascript:alert(1)','http://example.com','https://user:pass@example.com'])assert.throws(()=>evidenceLinks(value));
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
