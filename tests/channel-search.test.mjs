import test from 'node:test';import assert from 'node:assert/strict';
import {filterChannels} from '../dashboard/channel-search.js';
const channels=[{id:'1',name:'📮-ɪɴᴄɪᴅᴇɴᴛ-ʀᴇᴘᴏʀᴛɪɴɢ-ᴛɪᴇʀ-1',type:0},{id:'2',name:'🎙️-ʟᴍᴜ-ᴘᴀᴅᴅᴏᴄᴋ',type:0},{id:'3',name:'CREATED TICKETS TIER 1',type:4}];
test('channel search understands Discord small caps, emoji and multiple words',()=>{
 assert.deepEqual(filterChannels(channels,'incident tier 1',0).map(c=>c.id),['1']);
 assert.deepEqual(filterChannels(channels,'TIER1',0).map(c=>c.id),['1']);
 assert.deepEqual(filterChannels(channels,'LMU',0).map(c=>c.id),['2']);
 assert.deepEqual(filterChannels(channels,'tickets tier 1',4).map(c=>c.id),['3']);
 assert.equal(filterChannels(channels,'unknown',0).length,0);
 assert.equal(filterChannels(channels,'',0).length,2);
});
