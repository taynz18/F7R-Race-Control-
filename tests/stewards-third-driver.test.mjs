import test from 'node:test';
import assert from 'node:assert/strict';
import {thirdInteraction,thirdTicket,postThirdEvidence,registerAddDriver} from '../supabase/functions/_shared/third-driver.js';
import {accessFor,verdictView,syncTicketLock,sendOutcomes,APP_ID} from '../supabase/functions/_shared/stewards.js';
import {stewardInteraction} from '../supabase/functions/_shared/steward-interactions.js';
const reporter='111111111111111111',accused='222222222222222222',third='333333333333333333',staff='444444444444444444',channel='555555555555555555';
const route={config:{steward_roles:['steward'],leader_roles:['head'],category_id:'category'}};
const incident=()=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',number:999,revision:3,status:'discussion',reporter_id:reporter,accused_id:accused,route_id:'tier1',votes:{},data:{kind:'incident',race:'Brazil',lap:'Lap 1',report:{locked:true},defence:{locked:true},report_ticket:channel,third:{driver_id:third,name:'Third',role:'involved',added_by:staff,locked:false,links:[]},third_verdict:{status:'discussion',votes:{},notifications:{}}}});
test('third drivers and witnesses cannot act as stewards even with leadership roles',()=>{
 const c=incident();assert.equal(accessFor(['head'],route.config,third,c).steward,false);assert.equal(accessFor(['head'],route.config,staff,c).leader,true);
 c.data.third.role='witness';assert.equal(accessFor(['steward'],route.config,third,c).steward,false);
});
test('third-driver verdict is separate and witnesses cannot receive penalties',()=>{
 const c=incident();c.data.third_verdict={status:'closed',outcome:'Warning',votes:{head:{penalty:'Warning'}}};
 assert.equal(verdictView(c,'third').outcome,'Warning');assert.equal(c.status,'discussion');assert.deepEqual(c.votes,{});
 c.data.third.role='witness';assert.throws(()=>verdictView(c,'third'),/Witnesses/);
});
test('private third evidence denies both original drivers and preserves their case channel',async()=>{
 const c=incident(),calls=[];let stored;
 const s={guild:'guild',route:async()=>route,discord:async(path,method,body)=>{calls.push({path,method,body});return method==='POST'?{id:'666666666666666666'}:[];},action:async(...args)=>{stored=args;}};
 await thirdTicket(s,c);const permissions=calls.find(x=>x.method==='POST').body.permission_overwrites;
 for(const id of [reporter,accused,'guild'])assert.equal(permissions.find(x=>x.id===id).deny,'1024');
 assert.notEqual(permissions.find(x=>x.id===third).allow,'0');assert.equal(c.data.report_ticket,channel);assert.equal(stored[3],'third_ticket');assert.equal(stored[5],3);
});
test('third evidence ticket retries reuse the linked ticket without creating another',async()=>{
 const c=incident();c.data.third_ticket='existing';assert.equal(await thirdTicket({route:async()=>route,discord:async()=>{throw Error('must not create');}},c),'existing');
});
test('case remains writable until involved third verdict is final and witness requires statement only',async()=>{
 const c=incident();c.status='closed';c.data.third.locked=true;const calls=[];
 const s={route:async()=>route,discord:async(p,m,b)=>calls.push({p,b})};assert.equal(await syncTicketLock(s,c),false);
 c.data.third_verdict.status='closed';assert.equal(await syncTicketLock(s,c),true);
 c.data.third.role='witness';delete c.data.third_verdict;assert.equal(await syncTicketLock(s,c),true);
 c.data.third.locked=false;assert.equal(await syncTicketLock(s,c),false);
});
test('third verdict outcomes reach all involved drivers once, never witnesses',async()=>{
 const c=incident();c.data.third.locked=true;c.data.third_verdict={status:'closed',outcome:'Warning',explanation:'Approved explanation for third-driver contact.'};const sent=[],claimed=new Set();
 const s={action:async(c,a,l,name,v)=>{if(name==='claim_notification'){const key=v.target+v.recipient;if(claimed.has(key))throw Error('claimed');claimed.add(key);}},dm:async(id,p)=>{sent.push({id,p});return 'sent';}};
 await sendOutcomes(s,c,staff,true,'third');await sendOutcomes(s,c,staff,true,'third');
 assert.deepEqual(sent.map(x=>x.id),[reporter,accused,third]);assert.ok(sent.every(x=>x.p.content.includes('third driver')));
 c.data.third.role='witness';c.status='closed';c.outcome='No further action';await sendOutcomes(s,c,staff,true);assert.equal(sent.filter(x=>x.id===third).length,1);
});
test('third statement controls reject other members and submitted statements',async()=>{
 const c=incident();c.data.third_ticket=channel;const i={type:3,channel_id:channel,user:{id:reporter},data:{custom_id:'f7r-stew-thirdstatement:'+c.id}};
 const s={incident:async()=>c};assert.match((await(await thirdInteraction(i,s,()=>{})).json()).data.content,/not your/);
 i.user.id=third;assert.equal((await(await thirdInteraction(i,s,()=>{})).json()).type,9);
 c.data.third.locked=true;assert.match((await(await thirdInteraction(i,s,()=>{})).json()).data.content,/locked/);
});
test('third evidence posts clickable footage to staff without driver pings',async()=>{
 const c=incident();c.data.third_ticket='third-ticket';c.data.third={...c.data.third,locked:true,statement:'My account',links:['https://example.com/clip']};const posts=[];
 const s={discord:async(p,m,b)=>{if(m==='POST')posts.push(b);return [];}};await postThirdEvidence(s,c);
 assert.match(posts[0].embeds[0].fields[0].value,/\[Evidence 1\]\(https:\/\/example.com\/clip\)/);assert.deepEqual(posts[0].allowed_mentions.parse,[]);
});
test('Discord verdict picker adds a third option only for an involved driver',async()=>{
 const c=incident(),s={guild:'guild',db:async()=>[c],route:async()=>route,member:async()=>({roles:['steward']})};const i={type:2,channel_id:channel,guild_id:'guild',data:{name:'verdict'},member:{user:{id:staff}}};
 let r=await(await stewardInteraction(i,s,()=>{})).json();assert.ok(r.data.components[0].components[0].options.some(x=>x.value==='third'));
 c.data.third.role='witness';r=await(await stewardInteraction(i,s,()=>{})).json();assert.ok(!r.data.components[0].components[0].options.some(x=>x.value==='third'));
});
test('command registration adds one named command without overwriting other guild commands',async()=>{
 const calls=[],s={guild:'guild',discord:async(p,m,b)=>{calls.push({p,m,b});return m==='POST'?{id:'new'}:[{name:'verdict'}];}};await registerAddDriver(s);assert.equal(calls[1].m,'POST');assert.equal(calls[1].b.name,'add-driver');assert.ok(!calls.some(x=>x.m==='PUT'));
});
test('unauthorised add-driver command cannot create or change cases',async()=>{
 const c=incident();const i={type:2,channel_id:channel,member:{user:{id:staff}},data:{name:'add-driver',options:[{name:'driver',value:third},{name:'role',value:'involved'}]}};
 await assert.rejects(()=>thirdInteraction(i,{guild:'guild',db:async()=>[c],route:async()=>route,member:async()=>({roles:[]})},work=>work()),/Only assigned/);
});
test('a steward can add and invite a third driver while keeping the original report and defence',async()=>{
 let c=incident();delete c.data.third;delete c.data.third_verdict;const original=structuredClone(c),calls=[];
 const s={guild:'guild',db:async()=>[c],incident:async()=>c,route:async()=>route,member:async id=>({user:{id,username:'Driver'},roles:id===staff?['steward']:[]}),action:async(raw,a,l,name,value,revision)=>{assert.equal(revision,c.revision);calls.push(name);if(name==='add_third')c={...c,revision:c.revision+1,data:{...c.data,third:{...value,added_by:a,locked:false,links:[]},third_verdict:{status:'discussion',votes:{}}}};if(name==='third_ticket')c={...c,revision:c.revision+1,data:{...c.data,third_ticket:value.channel_id}};return c;},discord:async(p,m,b)=>{calls.push({p,m,b});if(m==='POST'&&p.endsWith('/channels'))return {id:'666666666666666666'};if(m==='GET'||!m)return [];return {id:'777777777777777777'};},dm:async()=> 'sent'};
 const i={type:2,channel_id:channel,member:{user:{id:staff}},data:{name:'add-driver',options:[{name:'driver',value:third},{name:'role',value:'involved'}]}};
 const response=await thirdInteraction(i,s,work=>work());assert.match(response,/linked to case/);assert.deepEqual(c.data.report,original.data.report);assert.deepEqual(c.data.defence,original.data.defence);assert.equal(c.data.report_ticket,channel);assert.equal(c.data.third.driver_id,third);assert.ok(calls.some(x=>x.m==='PUT'&&x.p.endsWith('/permissions/'+third)&&x.b.deny==='1024'));assert.ok(!calls.some(x=>x.m==='DELETE'));
});
