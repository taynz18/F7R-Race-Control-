import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import {gunzipSync} from 'node:zlib';
const code=stripTypeScriptTypes(readFileSync('supabase/functions/f7r-rlt-sync/index.ts','utf8'));
function runtime({fail=false,busy=false}={}){
 const calls=[],saved=[],polls=[];
 const c=vm.createContext({Response,Request,Blob,CompressionStream,Uint8Array,AbortSignal,crypto,btoa,TextEncoder,Date,console,Set,Number,Error,JSON,setTimeout:fn=>fn(),Deno:{env:{get:n=>n==='SUPABASE_URL'?'https://db.example':'service-test'},serve:fn=>{c.handler=fn;}},fetch:async(url,options={})=>{
  if(url.includes('/rpc/')){const b=JSON.parse(options.body);calls.push(b.action);return Response.json(b.action==='claim'?(busy?null:{claim:'lease-test',key:'not-a-real-key',cursor:4}):b.action==='next'?{source_id:38}:b.action==='save'?(saved.push(b.payload),{}):b.action==='poll'?(polls.push(b.payload),{}):{});}
  const path=url.split('/v1/')[1].split('?')[0];
  if(fail&&path.startsWith('events/'))return new Response('upstream unavailable',{status:503});
  const data=path==='seasons'?{seasons:[{seasonId:38,seasonName:'Tier 2',isArchive:false}]}:path==='database/changes'?{cursor:{version:5},gap:false,operations:[{resources:[{type:'session',seasonId:38}]}]}:path==='seasons/38'?{season:{seasonId:38}}:path==='seasons/38/events'?{events:[{eventId:583}]}:path==='seasons/38/standings'?{seasonStatistics:{driverStandings:[]}}:path==='seasons/38/lineups'?{seats:[]}:path==='events/583'?{seasonId:38,event:{round:1},sessions:[{sessionInfo:{sessionType:'Race'},drivers:[]}]}:null;
  assert.ok(data,'Unexpected URL '+path);return Response.json({data});
 }});vm.runInContext(code,c);return {c,calls,saved,polls};
}
test('change feed targets one season and expands global edits or gaps',()=>{
 const {c}=runtime();c.seasons=[{seasonId:1},{seasonId:2}];
 for(const [feed,want] of [[{gap:false,operations:[{resources:[{seasonId:2}]}]},[2]],[{gap:true,operations:[]},[1,2]],[{gap:false,operations:[{resources:[{type:'driver',id:3}]}]},[1,2]]]){c.feed=feed;assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('dirtySeasons(feed,seasons)',c))),want);}
});
test('full season saved only after all responses and compression succeeds',async()=>{
 const {c,calls,saved,polls}=runtime();const result=await vm.runInContext('run()',c);assert.equal(result.status,'updated');assert.equal(saved.length,1);assert.equal(polls[0].cursor,5);const snapshot=JSON.parse(gunzipSync(Buffer.from(saved[0].payload_gzip_base64,'base64')));assert.equal(snapshot.events.length,1);assert.equal(snapshot.events[0].sessions[0].sessionInfo.sessionType,'Race');assert.equal(calls.at(-1),'release');
});
test('upstream failure keeps old snapshot and records retry',async()=>{
 const {c,calls,saved}=runtime({fail:true});const result=await vm.runInContext('run()',c);assert.equal(result.status,'retry');assert.equal(saved.length,0);assert.ok(calls.includes('fail'));assert.equal(calls.at(-1),'release');
});
test('busy lease prevents overlapping requests',async()=>{const {c,calls}=runtime({busy:true});const result=await vm.runInContext('run()',c);assert.equal(result.status,'busy');assert.deepEqual(calls,['claim']);});
test('missing scheduler token is rejected before database access',async()=>{const {c,calls}=runtime();const r=await c.handler(new Request('https://example',{method:'POST'}));assert.equal(r.status,401);assert.equal(calls.length,0);});

