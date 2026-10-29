import {test} from 'node:test';import assert from 'node:assert/strict';import {FlagController,flagTimer} from '../dashboard/flags.js';
function rig(admin=true){
 let calls=[],allowed=admin,now=100000,state={flag:'FCY',revision:5,updated_at:new Date(90000).toISOString(),custom_message:'Hold',countdown_ends_at:new Date(110000).toISOString()};
 const client={from(){const q={select(){return q},eq(){return q},async maybeSingle(){return {data:allowed?{user_id:'admin'}:null}}};return q},async rpc(name,body){calls.push({name,body});if(name==='get_race_state')return {data:state};state={...state,flag:body.requested_flag??state.flag,custom_message:body.requested_message,revision:state.revision+1,countdown_ends_at:body.countdown_seconds?new Date(now+body.countdown_seconds*1000).toISOString():null};return {data:state}},async removeChannel(){}};
 const c=new FlagController({client,isAdmin:admin,userId:'admin',now:()=>now});c.active=true;c.apply(state);
 return {c,calls,setAllowed:x=>allowed=x,setNow:x=>now=x,client};
}
test('driver cannot invoke flag writes even via controller methods',async()=>{const {c,calls}=rig(false);assert.equal(await c.send('RED'),false);assert.equal(await c.updateMessage('No',5),false);assert.equal(await c.cancelCountdown(),false);assert.equal(calls.length,0)});
test('admin writes use existing RPC with expected revision',async()=>{const {c,calls}=rig();assert.equal(await c.send('RED','Stop'),true);assert.deepEqual(calls[0],{name:'set_race_signal',body:{requested_flag:'RED',requested_message:'Stop',countdown_seconds:null,expected_revision:5}})});
test('admin membership is rechecked before each write',async()=>{const {c,calls,setAllowed}=rig();setAllowed(false);assert.equal(await c.send('RED'),false);assert.equal(c.isAdmin,false);assert.equal(calls.filter(x=>x.name!=='get_race_state').length,0)});
test('offline controller does not send stale edits',async()=>{const {c,calls,setNow}=rig();setNow(120001);assert.equal(await c.send('GREEN'),false);assert.equal(calls.length,0)});
test('FCY expiry waits for confirmed FCY activation',()=>{const {c}=rig();const t=flagTimer(c.state,115000);assert.equal(t.label,'ACTIVATING FCY');assert.equal(t.value,'00:00:00');assert.equal(c.state.flag,'FCY')});
test('message edit uses captured revision to avoid overwriting a concurrent edit',async()=>{const {c,calls}=rig();await c.updateMessage('New',3);assert.equal(calls[0].body.expected_revision,3)});
test('invalid timers and overlong messages cannot invoke RPC',async()=>{const {c,calls}=rig();for(const n of [0,-1,1.5,2147483648])assert.equal(await c.send('FCY','',n),false);assert.equal(await c.send('RED','',60),false);assert.equal(await c.send('RED','x'.repeat(121)),false);assert.equal(calls.length,0)});
test('older flag revision cannot replace new signal',()=>{const {c}=rig();c.apply({flag:'RED',revision:4});assert.equal(c.state.flag,'FCY')});
test('failed server permission check cannot manufacture a saved flag',async()=>{const {c,client}=rig();client.rpc=async name=>name==='get_race_state'?{data:c.state}:{error:{message:'Denied'}};assert.equal(await c.send('RED'),false);assert.equal(c.state.flag,'FCY')});
test('stopping removes privileged state',async()=>{const {c}=rig();await c.stop();assert.equal(c.isAdmin,false);assert.equal(c.state,null);assert.equal(await c.send('RED'),false)});



test('prepare countdown is separate and waits for confirmed green',async()=>{const {c,calls}=rig();assert.equal(await c.send('PREPARE TO RACE','Ready',20),true);assert.equal(calls[0].body.requested_flag,'PREPARE TO RACE');assert.equal(flagTimer(c.state,100000).label,'GREEN IN');assert.equal(flagTimer(c.state,130000).label,'AWAITING GREEN');assert.equal(c.state.flag,'PREPARE TO RACE');await c.cancelCountdown();assert.equal(c.state.flag,'PREPARE TO RACE');assert.equal(c.state.countdown_ends_at,null)});
