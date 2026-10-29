import {circuitFor} from '../dashboard/circuits.js';
import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import {sessionStats,compoundName,sessionInfo} from '../dashboard/history-model.js';import {lapTime,reading,driverName} from '../dashboard/model.js';import {teamFor} from '../dashboard/teams.js';
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.value='';this.hidden=false;this.style={setProperty(k,v){this[k]=v}};this.disabled=false}
 append(...n){this.children.push(...n);if(this.tag==='select'&&this.value===''&&n[0])this.value=n[0].value}
 replaceChildren(...n){this.children=[];this.append(...n)}setAttribute(){}scrollIntoView(){}click(){return this.onclick?.()}querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tag===tag?[c]:[]),...(c.querySelectorAll?.(tag)||[])])}get text(){return this.textContent+this.children.map(c=>c.text||c.textContent||'').join(' ')}
}
test('signed-in history opens recorded driver analysis and admin saves a recording',async()=>{
 const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
 const driver={slot:0,name:'F7R Test',telemetry_public:true,position:1,team_id:0,lap:2,last_lap_ms:90000,pit_status:0,wear:[10,12,15,16],compound:17,tyre_age:1};
 const record={id:'r1',title:'Race test',state:'recording',started_at:'2026-10-25T20:00:00Z',last_seen:'2026-10-25T20:05:00Z',sample_count:2,final_data:{drivers:[driver]}};
 const samples=[{recording_id:'r1',frame:1,captured_at:record.started_at,data:{drivers:[{...driver,lap:1}]}},{recording_id:'r1',frame:2,captured_at:record.last_seen,data:{drivers:[driver]}}];
 const client={from(name){let conditions=[];const q={select(){return q},eq(k,v){conditions.push([k,v]);return q},order(){return q},limit(){return q},range(){return q},maybeSingle(){return Promise.resolve({data:{user_id:'admin'}})},then(resolve){const all=name==='f7r_recordings'?[record]:samples;return Promise.resolve({data:all.filter(r=>conditions.every(([k,v])=>r[k]===v)),error:null}).then(resolve)}};return q},rpc:async(name,args)=>{if(name==='f7r_label_recording'){record.session_kind=args.session_category;return {error:null}}assert.equal(name,'f7r_finish_recording');record.state=args.discard?'discarded':'saved';record.title=args.session_title;return {error:null}},auth:{getUser:async()=>({data:{user:{id:'admin'}}}),onAuthStateChange(){}}};
 const code=(await readFile(new URL('../dashboard/history.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace('}init();','}await init();');
 const ctx={circuitFor,sessionInfo,sessionStats,compoundName,lapTime,reading,driverName,teamFor,Node:Element,document:{getElementById:el,createElement:tag=>new Element(tag),createTextNode:t=>new Element('text')},window:{supabase:{createClient:()=>client}},fetch:async()=>({json:async()=>({})}),Date,console,setTimeout,setInterval(){},Blob,URL};
 vm.createContext(ctx);await vm.runInContext('(async()=>{'+code+'})()',ctx);
 assert.equal(el('history-admin').hidden,false);assert.equal(el('draft-list').children.length,1);
 const draft=el('draft-list').children[0];await draft.querySelectorAll('button').find(b=>b.textContent==='Preview recording').click();
 assert.match(el('session-detail').text,/F7R Test/);assert.match(el('session-detail').text,/1:30.000/);assert.match(el('session-detail').text,/15.0%/);const branded=el('session-detail').querySelectorAll('tr').find(r=>r.className==='history-team-row');assert.ok(branded.style['--team-color']);assert.ok(el('session-detail').querySelectorAll('img').some(i=>i.src==='./assets/teams/mercedes.png'));
 draft.querySelectorAll('input')[0].value='Monza league race';await draft.querySelectorAll('button').find(b=>b.textContent==='Save now').click();
 assert.equal(record.state,'saved');assert.match(el('session-list').text,/Monza league race/);assert.equal(el('draft-list').children[0].tag,'p');
 let saved=el('session-list').children[0];saved.querySelectorAll('select')[0].value='qualifying';await saved.querySelectorAll('button').find(b=>b.textContent==='Apply type').click();assert.equal(record.session_kind,'qualifying');assert.match(el('session-list').text,/Qualifying/);saved=el('session-list').children[0];await saved.querySelectorAll('button').find(b=>b.textContent==='Delete session').click();
 assert.equal(record.state,'discarded');assert.match(el('removed-list').text,/Restore session/);assert.equal(el('session-detail').hidden,true);
 await el('removed-list').children[0].querySelectorAll('button').find(b=>b.textContent==='Restore session').click();assert.equal(record.state,'saved');assert.match(el('session-list').text,/Monza league race/);
});
