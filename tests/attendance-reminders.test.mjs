import test from 'node:test';
import assert from 'node:assert/strict';
import {reminderSettings, reminderPayload, deliverReminder} from '../supabase/functions/_shared/attendance-reminders.js';
const role = '123456789012345678';
const row = {guild_id:role,channel_id:role,message_id:'223456789012345678',role_id:role,sent_count:0,total_count:2,starts_at:'2099-01-01T00:00:00Z'};
test('reminders are optional and validate interval, count, role and race deadline',()=>{
 assert.equal(reminderSettings(null,0,null),null);
 assert.deepEqual(reminderSettings({intervalHours:24,count:2},200000000,role,0),{intervalHours:24,count:2});
 for(const value of [{intervalHours:0,count:2},{intervalHours:24,count:21},{intervalHours:24,count:1.5}]) assert.throws(()=>reminderSettings(value,200000000,role,0));
 assert.throws(()=>reminderSettings({intervalHours:24,count:2},200000000,null,0));
 assert.throws(()=>reminderSettings({intervalHours:24,count:2},86400000,role,0));
});
test('ping mentions only the full-time role and links the original attendance',()=>{
 const payload=reminderPayload(row);
 assert.deepEqual(payload.allowed_mentions,{parse:[],roles:[role]});
 assert.match(payload.content,/Reminder 1 of 2/);
 assert.ok(payload.content.includes(`/channels/${role}/${role}/${row.message_id}`));
 assert.equal(payload.nonce,reminderPayload(row).nonce);
 assert.notEqual(payload.nonce,reminderPayload({...row,sent_count:1}).nonce);
 assert.ok(payload.nonce.length<=25);
});
const original = ()=>Response.json({author:{id:'1004676760815796334'}});
test('successful delivery sends one reminder',async()=>{
 let posts=0;
 const result=await deliverReminder(row,{token:'test',fetch:async(url,options)=>{if(options.method==='POST'){posts++;return Response.json({id:role});}return original();}});
 assert.equal(result.status,'sent');assert.equal(posts,1);
});
test('past races and deleted attendance never ping',async()=>{
 let calls=0;
 assert.equal((await deliverReminder({...row,starts_at:'2000-01-01'},{fetch:async()=>{calls++;}})).status,'completed');
 assert.equal(calls,0);
 assert.equal((await deliverReminder(row,{fetch:async()=>new Response('',{status:404})})).status,'cancelled');
});
test('rate limits retry without counting delivery; uncertain sends pause',async()=>{
 assert.equal((await deliverReminder(row,{fetch:async(u,o)=>o.method==='POST'?Response.json({retry_after:120},{status:429}):original()})).status,'active');
 assert.equal((await deliverReminder(row,{fetch:async(u,o)=>{if(o.method==='POST')throw new Error('timeout');return original();}})).status,'paused');
});
