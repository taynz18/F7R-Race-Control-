import {test} from 'node:test';import assert from 'node:assert/strict';
import {mapGeometry} from '../dashboard/track-map.js';import {circuitFor,CIRCUITS} from '../dashboard/circuits.js';
test('map preserves world position geometry and hides absent/stale positions',()=>{
 const g=mapGeometry({drivers:[{slot:0,world_position:{x:100,z:200}},{slot:1,world_position:{x:200,z:200}},{slot:2,motion_stale:true,world_position:{x:200,z:100}},{slot:3,world_position:null}]});
 assert.equal(g.drivers.length,2);assert.equal(g.project({x:100,z:200}).y,g.project({x:200,z:200}).y);
 assert.ok(g.project({x:100,z:200}).x<g.project({x:200,z:200}).x);
});
test('unmapped track sections are never connected across large gaps',()=>{
 const g=mapGeometry({track_map:{points:[{i:0,x:0,z:100},{i:1,x:20,z:100},{i:10,x:40,z:200}]}});
 assert.equal(g.paths.length,2);assert.equal(g.paths[0].length,2);
 assert.equal(mapGeometry({}).drivers.length,0);
});
test('circuit catalog matches F1 tracks and uses neutral unknown fallback',()=>{
 assert.equal(circuitFor(7).name,'Silverstone');assert.equal(circuitFor(32).name,'Lusail');
 assert.equal(circuitFor(999).logo,null);assert.equal(circuitFor(999).name,'Circuit 999');
 assert.ok(!CIRCUITS.some(c=>c.logo==='adelaide.png'));
});
