import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sendReserveConfirmation} from '../supabase/functions/_shared/reserve-dm.js';
const details={token:'test',driverId:'123456789012345678',team:'Hypercar · Ferrari',guild:'223456789012345678',channelId:'323456789012345678',messageId:'423456789012345678'};
test('reserve DM goes to the confirmed driver and includes class, team and attendance link',async()=>{
 const calls=[];
 const result=await sendReserveConfirmation({...details,fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({id:'523456789012345678'});}});
 assert.equal(result,'sent');
 assert.deepEqual(calls[0].body,{recipient_id:details.driverId});
 assert.ok(calls[1].body.content.includes('Hypercar · Ferrari'));
 assert.ok(calls[1].body.content.includes(`${details.guild}/${details.channelId}/${details.messageId}`));
 assert.deepEqual(calls[1].body.allowed_mentions,{parse:[]});
});
test('closed DMs fail without throwing or retrying',async()=>{
 let calls=0;
 const result=await sendReserveConfirmation({...details,fetch:async()=>{calls++;return Response.json({code:50007},{status:403});}});
 assert.equal(result,'failed'); assert.equal(calls,1);
});
test('uncertain deliveries are reported without duplicate sends',async()=>{
 let calls=0;
 const result=await sendReserveConfirmation({...details,fetch:async()=>{calls++;if(calls===1)return Response.json({id:'523456789012345678'});throw Error('timeout');}});
 assert.equal(result,'uncertain');assert.equal(calls,2);
});
test('DM follows a successful confirmation automatically, including seat moves',async()=>{
 const source=await readFile(new URL('../supabase/functions/f7r-discord-attendance/index.js',import.meta.url),'utf8');
 const confirmation=source.slice(source.indexOf('const outcome = await assigned.json()'),source.indexOf('if (input.action === "roster")'));
 assert.ok(confirmation.indexOf('outcome!=="Confirmed"')<confirmation.indexOf('await sendReserveConfirmation'));
 assert.ok(!confirmation.includes('notifyDriver'));
 assert.ok(confirmation.includes('return reply({refreshed,dmStatus})'));
});
