import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import * as model from '../dashboard/model.js';import {teamFor} from '../dashboard/teams.js';
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.value='';this.hidden=false;this.style={setProperty(){}};this.dataset={};this.classList={toggle(){},add(){},remove(){}}}
 append(...items){this.children.push(...items)}replaceChildren(...items){this.children=[...items]}setAttribute(){}get text(){return this.textContent+this.children.map(c=>c.text||c.textContent||'').join(' ')}
}
test('dashboard demo, search, driver selection, guide and logout work without network',async()=>{
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
 const code=(await readFile(new URL('../dashboard/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
 const context={...model,teamFor,renderCar:()=>new Element(),renderTrackMap:()=>new Element(),startFlags:async()=>{},stopFlags:async()=>{},document:{getElementById:el,createElement:t=>new Element(t)},window:{},Option:function(text,value){const e=new Element('option');e.textContent=text;e.value=value;return e},fetch:async()=>{throw Error('No network in smoke test')},setInterval(){},setTimeout:fn=>fn(),Date,console};
 vm.createContext(context);vm.runInContext(code,context);await el('demo').onclick();
 assert.equal(el('rows').children.length,22);assert.match(el('rows').children[0].text,/McLaren/);
 vm.runInContext("gridChanges.update(snapshot);const next=JSON.parse(JSON.stringify(snapshot));next.frame=2;next.received_at=new Date().toISOString();next.data.drivers[0].position=2;next.data.drivers[1].position=1;next.data.drivers[0].pit_status=1;apply(next,generation)",context);
 assert.match(el('rows').text,/↑1/);assert.match(el('rows').text,/↓1/);assert.match(el('rows').text,/PIT/);assert.match(el('detail').text,/PIT/);
 vm.runInContext("snapshot.data.drivers[0].pit_status=0;render()",context);assert.doesNotMatch(el('rows').text,/PIT/);
 el('search').value='Ferrari';el('search').oninput();assert.equal(el('rows').children.length,2);assert.equal(el('feed').textContent,'DEMO DATA');
 el('search').value='Ghost';el('search').oninput();assert.equal(el('rows').children.length,1);
 el('rows').children[0].onclick();assert.match(el('detail').text,/F7R Ghost/);
 el('setup-tab').onclick();assert.equal(el('connection').hidden,false);el('back').onclick();assert.equal(el('dashboard').hidden,false);
 
 el('search').value='';vm.runInContext("snapshot.data.drivers[0].team_id=465;snapshot.data.drivers[0].compound=19;render()",context);
 assert.equal(el('series-mark').alt,'Formula 2');assert.match(el('rows').text,/ART Grand Prix/);assert.match(el('rows').text,/SS/);
 const images=n=>[...(n.tag==='img'?[n.src]:[]),...n.children.flatMap(images)];assert.ok(images(el('rows')).includes('./assets/teams/f2-art.png'));
 await el('flags-tab').onclick();assert.match(el('auth-message').textContent,/Sign in with your F7R account/);assert.equal(el('flags').hidden,true);assert.equal(el('login').hidden,false);assert.equal(el('dashboard').hidden,true);assert.equal(el('rows').children.length,0);
});



