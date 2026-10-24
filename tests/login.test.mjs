import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import * as model from '../dashboard/model.js';import {teamFor} from '../dashboard/teams.js';
class Element{
 constructor(){this.children=[];this.value='';this.hidden=false;this.textContent='';this.style={setProperty(){}};this.dataset={};this.classList={toggle(){},add(){},remove(){}}}
 append(...x){this.children.push(...x)}replaceChildren(...x){this.children=x}setAttribute(){}
}
async function setup({flagAdmin=false,membership=null,missingTables=false}={}){
 const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};const flags=[];
 const client={auth:{onAuthStateChange(){},async signInWithPassword(){return {data:{user:{id:'user'},session:{user:{id:'user'}}}}},async signOut(){return {}}},from(table){const q={select(){return q},eq(){return q},order(){return q},async limit(){return {data:[]}},async maybeSingle(){return table==='flag_admins'?{data:flagAdmin?{user_id:'user'}:null}:missingTables?{error:{message:'missing table'}}:{data:membership}}};return q},async removeChannel(){}};
 const code=(await readFile(new URL('../dashboard/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
 const context={...model,teamFor,document:{getElementById:el,createElement:()=>new Element()},window:{supabase:{createClient:()=>client}},
 startFlags:async(_c,isAdmin)=>flags.push(isAdmin),stopFlags:async()=>{},fetch:async()=>({ok:true,json:async()=>({supabase_url:'https://example.supabase.co',supabase_publishable_key:'sb_publishable_example'})}),
 setInterval(){},setTimeout:fn=>fn(),console,Date,Option:Element};
 vm.createContext(context);vm.runInContext(code,context);await new Promise(r=>setImmediate(r));el('email').value='test@example.invalid';el('password').value='mock-only';
 await el('login-form').onsubmit({preventDefault(){}});return {el,flags};
}
test('dashboard role admin does not grant flag control',async()=>{const {el,flags}=await setup({membership:{display_name:'Dashboard admin',role:'admin',approved:true}});assert.deepEqual(flags,[false]);assert.equal(el('dashboard').hidden,false);el('flags-tab').onclick();assert.equal(el('flags').hidden,false)});
test('existing flag admin retains login when telemetry SQL has not run',async()=>{const {el,flags}=await setup({flagAdmin:true,missingTables:true});assert.deepEqual(flags,[true]);assert.equal(el('dashboard').hidden,false);el('flags-tab').onclick();assert.equal(el('flags').hidden,false);assert.match(el('notice').textContent,/dashboard-01-setup\.sql/)});
test('unapproved login cannot start flag viewing or telemetry',async()=>{const {el,flags}=await setup({membership:{display_name:'Pending',role:'driver',approved:false}});assert.deepEqual(flags,[]);assert.match(el('auth-message').textContent,/awaiting F7R approval/)});
test('approved driver receives view-only flags with same login',async()=>{const {el,flags}=await setup({membership:{display_name:'Driver',role:'driver',approved:true}});assert.deepEqual(flags,[false]);el('flags-tab').onclick();assert.equal(el('flags').hidden,false);await el('flags-logout').onclick();assert.equal(el('login').hidden,false);assert.equal(el('flags').hidden,true)});

