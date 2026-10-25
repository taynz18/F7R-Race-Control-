import {test} from 'node:test';import assert from 'node:assert/strict';import {currentLiveRace} from '../dashboard/model.js';
test('viewers follow the active feed instead of choosing a race',()=>{
 const races=[{id:'new',status:'live',created_at:'2026-10-25T12:00:00Z'},{id:'old',status:'live',created_at:'2026-10-24T12:00:00Z'}];
 const now=Date.parse('2026-10-25T12:01:00Z');
 assert.equal(currentLiveRace(races,[{session_id:'old',received_at:'2026-10-25T12:00:58Z'}],now).id,'old');
 assert.equal(currentLiveRace(races,[],now).id,'new');
 assert.equal(currentLiveRace([{id:'closed',status:'finished'}],[],now),null);
});
