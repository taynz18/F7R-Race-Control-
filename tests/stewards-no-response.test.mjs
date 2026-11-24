import test from 'node:test';
import assert from 'node:assert/strict';
import {noResponseInteraction,syncNoResponseButtons} from '../supabase/functions/_shared/no-response.js';
import {addNoResponseControl,APP_ID} from '../supabase/functions/_shared/stewards.js';
import {stewardInteraction} from '../supabase/functions/_shared/steward-interactions.js';
const accused='111111111111111111',reporter='222222222222222222',head='333333333333333333',ticket='444444444444444444';
const c={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',number:1021,status:'awaiting_defence',revision:2,reporter_id:reporter,accused_id:accused,route_id:'tier1',data:{kind:'incident',report:{locked:true,statement:'Report'},report_ticket:ticket,defence_ticket:ticket}};
const route={config:{leader_roles:['head'],steward_roles:['steward']}};
const interaction=(kind='proceed')=>({type:3,channel_id:ticket,user:{id:head},data:{custom_id:'f7r-stew-'+kind+':'+c.id}});
const service=(incident=c,roles=['head'])=>({incident:async()=>incident,route:async()=>route,member:async()=>({roles})});
const confirmInteraction=()=>({...interaction('proceedconfirm'),type:5,data:{custom_id:'f7r-stew-proceedconfirm:'+c.id,components:[{component:{custom_id:'reason',value:'The response deadline has passed.'}},{component:{custom_id:'confirm',value:'PROCEED'}}]}});
test('leadership override requires a reason and explicit PROCEED confirmation',async()=>{
 const result=await(await noResponseInteraction(interaction(),{incident:()=>{throw Error('Form must open without network access');}},()=>{})).json();assert.equal(result.type,9);assert.equal(result.data.custom_id,'f7r-stew-proceedconfirm:'+c.id);assert.equal(result.data.components[0].component.min_length,10);assert.equal(result.data.components[1].component.custom_id,'confirm');
});
test('ordinary stewards and involved leaders cannot override an unanswered defence',async()=>{
 await assert.rejects(()=>noResponseInteraction(confirmInteraction(),service(c,['steward']),work=>work()),/Only.*Head Steward/);
 const i=confirmInteraction();i.user.id=accused;await assert.rejects(()=>noResponseInteraction(i,service(),work=>work()),/not involved/);
});
test('submitted defences and in-game appeals cannot be overridden',async()=>{
 await assert.rejects(()=>noResponseInteraction(confirmInteraction(),service({...c,status:'discussion'}),work=>work()),/not awaiting/);
 await assert.rejects(()=>noResponseInteraction(confirmInteraction(),service({...c,data:{...c.data,kind:'penalty_appeal'}}),work=>work()),/not awaiting/);
});
test('pending defence buttons gain one leadership action without losing driver controls',()=>{
 const old=[{type:1,components:[{type:2,custom_id:'f7r-stew-defend:'+c.id},{type:2,custom_id:'f7r-stew-nodefence:'+c.id}]}],added=addNoResponseControl(old,c);
 assert.equal(old[0].components.length,2);assert.equal(added[0].components.length,3);assert.deepEqual(addNoResponseControl(added,c),added);assert.deepEqual(addNoResponseControl(old,{...c,status:'voting'}),old);
});
test('existing-ticket backfill only edits bot controls and never advances a case',async()=>{
 const original=[{type:1,components:[{type:2,custom_id:'f7r-stew-defend:'+c.id}]}],calls=[];
 const s={guild:'guild',db:async(p,m)=>{assert.equal(m,undefined);return [c];},discord:async(p,m,b)=>{calls.push({p,m,b});return m?{}:[{id:'bot-post',author:{id:APP_ID},components:original},{id:'driver-post',author:{id:accused},components:original}];}};
 const r=await syncNoResponseButtons(s);assert.equal(r.updated,1);assert.equal(r.failed.length,0);assert.equal(calls.filter(x=>x.m).length,1);assert.equal(calls.at(-1).m,'PATCH');assert.equal(calls.at(-1).b.content,undefined);assert.equal(original[0].components.length,1);
});
test('leadership continuation collects the accused driver footage, preserves draft and opens review without a penalty',async()=>{
 const raw={...c,status:'awaiting_defence_evidence',data:{...c.data,defence:{statement:'Unsubmitted draft',links:['https://example.com/existing']}}},calls=[];
 const updated={...raw,status:'discussion',data:{...raw.data,defence:{...raw.data.defence,locked:true,no_response:true}},review_channel_id:ticket};
 const s={...service(raw),discord:async(p,m,b)=>{calls.push({p,m,b});if(!m)return [{id:'footage',author:{id:accused},content:'My POV',attachments:[{id:'clip',filename:'pov.mp4',content_type:'video/mp4',url:'https://cdn.example.com/pov.mp4'}]},{id:'staff-footage',author:{id:head},content:'https://example.com/staff-clip'}];return {};},action:async(raw,actor,leader,action,v,rev)=>{assert.equal(actor,head);assert.equal(leader,true);assert.equal(action,'proceed_without_response');assert.equal(rev,2);assert.equal(v.clips.length,1);assert.equal(v.no_video,false);assert.ok(v.links.includes('https://example.com/existing'));assert.ok(!v.links.includes('https://example.com/staff-clip'));return updated;},dm:async()=> 'sent'};
 const i=interaction('proceedconfirm');i.type=5;i.data.custom_id+=':2';i.data.components=[{component:{custom_id:'reason',value:'Response deadline has passed.'}},{component:{custom_id:'confirm',value:'PROCEED'}}];
 const result=await noResponseInteraction(i,s,work=>work());assert.match(result,/normal verdict/);assert.ok(calls.some(x=>x.p.endsWith('/permissions/'+accused)&&x.b.deny==='1024'));assert.ok(!calls.some(x=>x.m==='DELETE'));assert.equal(raw.data.defence.statement,'Unsubmitted draft');
});
test('stale confirmation or missing confirmation never advances a case',async()=>{
 const i=interaction('proceedconfirm');i.type=5;i.data.custom_id+=':1';i.data.components=[{component:{custom_id:'reason',value:'Deadline passed yesterday.'}},{component:{custom_id:'confirm',value:'PROCEED'}}];
 await assert.rejects(()=>noResponseInteraction(i,service(),work=>work()),/case changed/);
 i.data.components[1].component.value='';await assert.rejects(()=>noResponseInteraction(i,service(),work=>work()),/Type PROCEED/);
});
test('Discord opens the form without waiting for case storage or role lookups',async()=>{
 const i=interaction(),s={incident:()=>{throw Error('Must not fetch case before acknowledging');},member:()=>{throw Error('Must not fetch roles before acknowledging');}};
 const response=await(await stewardInteraction(i,s,()=>{})).json();assert.equal(response.type,9);
});
test('leadership modal satisfies Discord field and title length limits',async()=>{
 const response=await(await noResponseInteraction(interaction(),{},()=>{})).json(),modal=response.data;
 assert.equal(response.type,9);assert.ok(modal.title.length>0&&modal.title.length<=45);assert.ok(modal.custom_id.length<=100);assert.ok(modal.components.length<=5);
 for(const label of modal.components){assert.equal(label.type,18);assert.ok(label.label.length>0&&label.label.length<=45,'Discord rejects label: '+label.label);assert.equal(label.component.type,4);assert.ok(label.component.custom_id.length<=100);assert.ok(label.component.min_length<=label.component.max_length);assert.ok(label.component.max_length<=4000);}
});
test('Discord acknowledges submission while storage is still pending, then enforces permissions',async()=>{
 let release;const blocked=new Promise(resolve=>{release=resolve;}),tasks=[],patches=[],originalFetch=globalThis.fetch;
 const i=confirmInteraction();i.token='test-interaction';
 globalThis.fetch=async(url,options)=>{patches.push(JSON.parse(options.body));return Response.json({});};
 try{
   const s={...service(c,[]),incident:()=>blocked};
   const response=await(await stewardInteraction(i,s,task=>tasks.push(task))).json();
   assert.equal(response.type,5);assert.equal(response.data.flags,64);assert.equal(patches.length,0);
   release(c);await Promise.all(tasks);assert.match(patches[0].content,/Only assigned stewards/);
 }finally{release(c);globalThis.fetch=originalFetch;}
});
