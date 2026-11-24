import test from 'node:test';
import assert from 'node:assert/strict';
import {noResponseInteraction,syncNoResponseButtons} from '../supabase/functions/_shared/no-response.js';
import {addNoResponseControl,APP_ID} from '../supabase/functions/_shared/stewards.js';
const accused='111111111111111111',reporter='222222222222222222',head='333333333333333333',ticket='444444444444444444';
const c={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',number:1021,status:'awaiting_defence',revision:2,reporter_id:reporter,accused_id:accused,route_id:'tier1',data:{kind:'incident',report:{locked:true,statement:'Report'},report_ticket:ticket,defence_ticket:ticket}};
const route={config:{leader_roles:['head'],steward_roles:['steward']}};
const interaction=(kind='proceed')=>({type:3,channel_id:ticket,user:{id:head},data:{custom_id:'f7r-stew-'+kind+':'+c.id}});
const service=(incident=c,roles=['head'])=>({incident:async()=>incident,route:async()=>route,member:async()=>({roles})});
test('leadership override requires a reason and explicit PROCEED confirmation',async()=>{
 const result=await(await noResponseInteraction(interaction(),service(),()=>{})).json();assert.equal(result.type,9);assert.match(result.data.custom_id,/:2$/);assert.equal(result.data.components[0].component.min_length,10);assert.equal(result.data.components[1].component.custom_id,'confirm');
});
test('ordinary stewards and involved leaders cannot override an unanswered defence',async()=>{
 await assert.rejects(()=>noResponseInteraction(interaction(),service(c,['steward']),()=>{}),/Only.*Head Steward/);
 const i=interaction();i.user.id=accused;await assert.rejects(()=>noResponseInteraction(i,service(),()=>{}),/not involved/);
});
test('submitted defences and in-game appeals cannot be overridden',async()=>{
 await assert.rejects(()=>noResponseInteraction(interaction(),service({...c,status:'discussion'}),()=>{}),/not awaiting/);
 await assert.rejects(()=>noResponseInteraction(interaction(),service({...c,data:{...c.data,kind:'penalty_appeal'}}),()=>{}),/not awaiting/);
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
