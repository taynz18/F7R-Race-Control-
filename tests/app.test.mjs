import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import * as model from '../dashboard/model.js';import {teamFor} from '../dashboard/teams.js';
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.value='';this.hidden=false;this.style={setProperty(){}};this.dataset={};this.classList={toggle(){},add(){},remove(){}}}
 append(...items){this.children.push(...items)}replaceChildren(...items){this.children=[...items]}setAttribute(){}get text(){return this.textContent+this.children.map(c=>c.text||c.textContent||'').join(' ')}
}
test('dashboard demo, search, driver selection, guide and logout work without network',async()=>{
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
 const code=(await readFile(new URL('../dashboard/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
 const context={...model,teamFor,startFlags:async()=>{},stopFlags:async()=>{},document:{getElementById:el,createElement:t=>new Element(t)},window:{},Option:function(text,value){const e=new Element('option');e.textContent=text;e.value=value;return e},fetch:async()=>{throw Error('No network in smoke test')},setInterval(){},setTimeout:fn=>fn(),Date,console};
 vm.createContext(context);vm.runInContext(code,context);await el('demo').onclick();
 assert.equal(el('rows').children.length,10);assert.match(el('rows').children[0].text,/McLaren/);el('search').value='Ferrari';el('search').oninput();assert.equal(el('rows').children.length,1);assert.equal(el('feed').textContent,'DEMO DATA');
 el('search').value='Ghost';el('search').oninput();assert.equal(el('rows').children.length,1);
 el('rows').children[0].onclick();assert.match(el('detail').text,/F7R Ghost/);
 el('setup-tab').onclick();assert.equal(el('connection').hidden,false);el('back').onclick();assert.equal(el('dashboard').hidden,false);
 await el('flags-tab').onclick();assert.match(el('auth-message').textContent,/Sign in with your F7R account/);assert.equal(el('flags').hidden,true);assert.equal(el('login').hidden,false);assert.equal(el('dashboard').hidden,true);assert.equal(el('rows').children.length,0);
});

