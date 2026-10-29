import {test} from 'node:test';import assert from 'node:assert/strict';import {sessionStats,compoundName} from '../dashboard/history-model.js';
const sample=(frame,lap,time,extra={})=>({frame,captured_at:'2026-10-25T20:00:00Z',data:{drivers:[{slot:0,name:'F7R Racer',telemetry_public:true,lap,last_lap_ms:time,position:1,pit_status:0,compound:17,tyre_age:lap,...extra}]}});
test('history calculates observed laps, average and consistency without inventing late-join laps',()=>{const data=sessionStats([sample(3,5,92000),sample(1,3,89000),sample(2,4,90000)]);assert.deepEqual(data[0].laps,[{lap:3,time:90000},{lap:4,time:92000}]);assert.equal(data[0].best,90000);assert.equal(data[0].average,91000);assert.equal(data[0].consistency,1000)});
test('missing laps and duplicated snapshots never become fake results',()=>{const c=sessionStats([sample(1,2,88000),sample(2,5,90000),sample(3,5,90000),sample(4,6,null)])[0];assert.deepEqual(c.laps,[{lap:4,time:90000}]);assert.equal(c.consistency,null)});
test('pit entries count once and tyre replacement creates a new stint',()=>{const c=sessionStats([sample(1,1,0),sample(2,2,90000,{pit_status:1}),sample(3,2,90000,{pit_status:2}),sample(4,3,91000,{compound:18,tyre_age:0})])[0];assert.equal(c.pitStops,1);assert.equal(c.stints.length,2);assert.equal(c.stints[1].compound,18)});
test('private names, unknown values and empty sessions remain honest',()=>{const c=sessionStats([sample(1,1,0,{telemetry_public:false,name:'Hidden'})])[0];assert.equal(c.name,'Player');assert.equal(c.best,null);assert.equal(c.average,null);assert.deepEqual(sessionStats([]),[])});

test('F2 visual tyre compounds are named without using F1 actual-compound meanings',()=>{assert.equal(compoundName(19),'Super soft');assert.equal(compoundName(20),'Soft');assert.equal(compoundName(21),'Medium');assert.equal(compoundName(22),'Hard');assert.equal(compoundName(15),'Wet');assert.equal(compoundName(16),'Soft')});

test('last completed lap is retained when the winner finishes without incrementing lap number',()=>{
 const input=[sample(1,1,0,{result_status:2}),sample(2,2,90000,{result_status:2}),sample(3,2,91000,{result_status:3}),sample(4,2,91000,{result_status:3})];
 for(const s of input)s.data.total_laps=2;
 assert.deepEqual(sessionStats(input)[0].laps,[{lap:1,time:90000},{lap:2,time:91000}]);
 assert.deepEqual(sessionStats([input[2]])[0].laps,[]);
});
