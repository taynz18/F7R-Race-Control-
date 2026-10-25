import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('receiver waits for admin start, publishes, and fails closed on lost control',async()=>{
 let enabled=false,failControl=false,tick,time=100000,uploads=0,frame=1;
 const handlers={},health=[];
 const socket={on(k,f){handlers[k]=f},bind(p,a,f){f()},close(){}};
 class FakeDate extends Date{static now(){return time}}
 const process={env:{F7R_SESSION_ID:'cda3f85a-268a-40b7-87d9-869932e749eb',F7R_RECEIVER_EMAIL:'receiver@example.test',F7R_RECEIVER_PASSWORD:'test-only'},on(){},stdout:{write(){}}};
 const request=async(url,options)=>{
  const path=new URL(url).pathname;
  let data=null;
  if(path==='/auth/v1/token')data={access_token:'test',refresh_token:'test',expires_in:3600,user:{id:'publisher'}};
  else if(path==='/rest/v1/f7r_sessions')data=[{publisher_id:'publisher',status:'live',game_format:2026}];
  else if(path==='/rest/v1/f7r_receiver_controls'){if(failControl)throw Error('Network unavailable');data=[{enabled}]}
  else if(path==='/rest/v1/f7r_receiver_status')health.push(JSON.parse(options.body));
  else if(path==='/rest/v1/f7r_snapshots'){if(options.method==='POST')uploads++;else data=[]}
  return {ok:true,text:async()=>JSON.stringify(data)};
 };
 class Decoder{constructor(){this.uid=null;this.format=2026}accept(){return true}snapshot(){return {frame:frame++,data:{drivers:[{ers_joules:10}]}}}}
 let code=await readFile(new URL('../receiver/start.mjs',import.meta.url),'utf8');
 code=code.replace(/^import[^\n]*\n/gm,'').replace("new URL('../config.json',import.meta.url)","'config'");
 const ctx={process,Date:FakeDate,Decoder,header:()=>({format:2026,uid:'1'}),dgram:{createSocket:()=>socket},readFile:async()=>JSON.stringify({supabase_url:'https://example.supabase.co',supabase_publishable_key:'sb_publishable_test'}),fetch:request,AbortSignal,setInterval:f=>{tick=f;return 1},clearInterval(){},networkInterfaces:()=>({}),console:{log(){},error(){}}};
 vm.createContext(ctx);await vm.runInContext('(async()=>{'+code+'})()',ctx);
 handlers.message(Buffer.alloc(1),{address:'192.168.1.5'});await tick();
 assert.equal(uploads,0);assert.equal(health.at(-1).state,'paused');
 enabled=true;time+=2100;handlers.message(Buffer.alloc(1),{address:'192.168.1.5'});await tick();assert.equal(uploads,1);
 enabled=false;time+=2100;handlers.message(Buffer.alloc(1),{address:'192.168.1.5'});await tick();assert.equal(uploads,1);
 enabled=true;failControl=true;time+=2100;await tick();assert.equal(uploads,1);
});
