import {test} from 'node:test';import assert from 'node:assert/strict';import {safetyPeriod} from '../dashboard/model.js';
test('safety banner follows game status and clears when stale, finished or unknown',()=>{const now=Date.now(),s={received_at:new Date(now).toISOString(),data:{safety_car_status:2}},r={status:'live'};assert.equal(safetyPeriod(s,r,now).code,'VSC');s.data.safety_car_status=1;assert.equal(safetyPeriod(s,r,now).code,'SC');assert.equal(safetyPeriod(s,r,now+8001),null);assert.equal(safetyPeriod(s,{status:'finished'},now),null);for(const state of [0,3,null,undefined,99]){s.data.safety_car_status=state;assert.equal(safetyPeriod(s,r,now),null)}assert.equal(safetyPeriod(null,r,now),null)});

test('yellow marshal zones show caution, SC/VSC take priority and green clears it',()=>{const now=Date.now(),s={received_at:new Date(now).toISOString(),data:{safety_car_status:0,marshal_zones:[{start:0,flag:0},{start:.4,flag:3}]}},r={status:'live'};assert.equal(safetyPeriod(s,r,now).label,'YELLOW FLAG');assert.equal(safetyPeriod(s,r,now).local,true);for(const [value,label] of [[1,'SAFETY CAR'],[2,'VIRTUAL SAFETY CAR']]){s.data.safety_car_status=value;assert.equal(safetyPeriod(s,r,now).label,label)}s.data.safety_car_status=0;assert.equal(safetyPeriod(s,r,now+8001),null);s.data.marshal_zones[1].flag=1;assert.equal(safetyPeriod(s,r,now),null);s.data.marshal_zones=[{start:null,flag:3}];assert.equal(safetyPeriod(s,r,now),null)});

test('sector yellow stays separate from SC/VSC and expires with the game signal',()=>{
 const now=Date.now(),race={status:'live'};
 const snap={received_at:new Date(now).toISOString(),data:{
  game_signal_age_ms:1200,safety_car_status:0,marshal_zones:[{start:.4,flag:3,sector:2}]
 }};
 assert.equal(safetyPeriod(snap,race,now).label,'YELLOW FLAG · SECTOR 2');
 snap.data.marshal_zones.push({start:.8,flag:3,sector:3});
 assert.equal(safetyPeriod(snap,race,now).label,'YELLOW FLAG · SECTORS 2, 3');
 for(const [status,label] of [[1,'SAFETY CAR'],[2,'VIRTUAL SAFETY CAR'],[0,'YELLOW FLAG · SECTORS 2, 3']]){
  snap.data.safety_car_status=status;
  assert.equal(safetyPeriod(snap,race,now).label,label);
  assert.equal(safetyPeriod(snap,race,now+2301),null);
 }
 snap.data.marshal_zones.forEach(zone=>{zone.flag=1});
 assert.equal(safetyPeriod(snap,race,now),null);
});
