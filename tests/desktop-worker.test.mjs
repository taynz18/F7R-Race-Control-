import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
async function worker({approved=true,selected='race-1'}={}){
 const messages=[],env={};let started=false;
 const output={write(line){messages.push(JSON.parse(line))}};
 const input={async *[Symbol.asyncIterator](){yield JSON.stringify({email:'receiver@example.test',password:'secret-test'});yield JSON.stringify({sessionId:selected,gameIp:''})},close(){}};
 const config={supabase_url:'https://example.supabase.co',supabase_publishable_key:'sb_publishable_test'};
 let code=(await readFile(new URL('../receiver/desktop-worker.mjs',import.meta.url),'utf8')).replace(/^import[^\n]*\n/gm,'').replace("new URL('../config.json',import.meta.url)","'config'").replace("await import('./start.mjs')","await startReceiver()");
 const context={process:{stdout:output,stderr:{},stdin:{pause(){}},env},createInterface:()=>input,readFile:async()=>JSON.stringify(config),AbortSignal,
 startReceiver:async()=>{started=true;assert.equal(env.F7R_RECEIVER_PASSWORD,'secret-test')},
 fetch:async(url)=>({ok:true,json:async()=>url.includes('/auth/')?{access_token:'test',user:{id:'user'}}:url.includes('f7r_members')?[{approved,role:'publisher'}]:[{id:'race-1',title:'Test race',game_format:2026}]})};
 vm.createContext(context);await vm.runInContext('(async()=>{'+code+'})()',context);
 return {messages,env,started};
}
test('desktop sign-in lists assigned races and starts automatic game detection privately',async()=>{
 const r=await worker();assert.equal(r.started,true);assert.equal(r.env.F7R_GAME_IP,'auto');
 assert.equal(r.messages[0].type,'races');assert.equal(r.messages[1].type,'connected');
 assert.ok(!JSON.stringify(r.messages).includes('secret-test'));
});
test('desktop blocks unapproved publishers before starting receiver',async()=>{
 const r=await worker({approved:false});assert.equal(r.started,false);assert.equal(r.messages[0].type,'fatal');
});
test('desktop cannot select a race outside the returned assignments',async()=>{
 const r=await worker({selected:'unassigned'});assert.equal(r.started,false);assert.equal(r.messages.at(-1).type,'fatal');
});
