import {test} from 'node:test';import assert from 'node:assert/strict';import {lapTime,driverName,energy,feedState,acceptsSnapshot,reading} from '../dashboard/model.js';
test('missing is distinct from zero',()=>{assert.equal(lapTime(90123),'1:30.123');assert.equal(lapTime(0),'—');assert.equal(reading(null),'—');assert.equal(reading(0,'%'),'0%')});
test('private ERS cannot show false zero',()=>assert.equal(energy({telemetry_public:false,ers_percent:0}),'Private'));
test('uncalibrated energy stays in MJ',()=>{assert.equal(energy({telemetry_public:true,ers_joules:2000000}),'2.00 MJ');assert.equal(energy({telemetry_public:true,ers_percent:50}),'50%')});
test('session roster names and fallback',()=>{assert.equal(driverName({slot:0,name:'Game name'},{driver_names:{0:'F7R Name'}}),'F7R Name');assert.equal(driverName({slot:1,name:null},null),'Car 2 · name unavailable')});
test('stale status uses original timestamp',()=>{const s={received_at:new Date(0).toISOString()};assert.equal(feedState(s,{status:'live'},9000),'STALE · LAST KNOWN DATA');assert.equal(feedState(s,{status:'finished'},9000),'RACE FINISHED');assert.equal(feedState(null,null,0,true),'DEMO DATA')});
test('older and unrelated race snapshots rejected',()=>{const c={session_id:'a',frame:5};assert.equal(acceptsSnapshot(c,{session_id:'a',frame:4}),false);assert.equal(acceptsSnapshot(c,{session_id:'b',frame:6}),false);assert.equal(acceptsSnapshot(c,{session_id:'a',frame:6}),true)});

