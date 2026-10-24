import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import * as model from '../dashboard/model.js';import {teamFor} from '../dashboard/teams.js';
class Element{
 constructor(){this.children=[];this.value='';this.hidden=false;this.textContent='';this.style={setProperty(){}};this.dataset={};this.classList={toggle(){},add(){},remove(){}}}
 append(...x){this.children.push(...x)}replaceChildren(...x){this.children=x}setAttribute(){}
}
async function setup({flagAdmin=false,membership=null,missingTables=false,signupSession=true}={}){
 const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};const flags=[],signups=[];
 const client={auth:{onAuthStateChange(){},async signInWithPassword(){return {data:{user:{id:'user'},session:{user:{id:'user'}}}}},async signUp(body){signups.push(body);return {data:{user:{id:'user',user_metadata:{display_name:'New Driver',role:'admin'}},session:signupSession?{user:{id:'user'}}:null}}},async signOut(){return {}}},from(table){const q={select(){return q},eq(){return q},order(){return q},async limit(){return {data:[]}},async maybeSingle(){return table==='flag_admins'?{data:flagAdmin?{user_id:'user'}:null}:missingTables?{error:{message:'missing table'}}:{data:membership}}};return q},async removeChannel(){}};
 const code=(await readFile(new URL('../dashboard/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
 const context={...model,teamFor,renderCar:()=>new Element(),document:{getElementById:el,createElement:()=>new Element()},window:{supabase:{createClient:()=>client}},
 startFlags:async(_c,isAdmin)=>flags.push(isAdmin),stopFlags:async()=>{},fetch:async()=>({ok:true,json:async()=>({supabase_url:'https://example.supabase.co',supabase_publishable_key:'sb_publishable_example'})}),
 setInterval(){},setTimeout:fn=>fn(),console,Date,Option:Element};
 vm.createContext(context);vm.runInContext(code,context);await new Promise(r=>setImmediate(r));el('email').value='test@example.invalid';el('password').value='mock-only';
 await el('login-form').onsubmit({preventDefault(){}});return {el,flags,signups};
}
test('dashboard role admin does not grant flag control',async()=>{const {el,flags}=await setup({membership:{display_name:'Dashboard admin',role:'admin',approved:true}});assert.deepEqual(flags,[false]);assert.equal(el('dashboard').hidden,false);el('flags-tab').onclick();assert.equal(el('flags').hidden,false)});
test('existing flag admin retains login when telemetry SQL has not run',async()=>{const {el,flags}=await setup({flagAdmin:true,missingTables:true});assert.deepEqual(flags,[true]);assert.equal(el('dashboard').hidden,false);el('flags-tab').onclick();assert.equal(el('flags').hidden,false);assert.match(el('notice').textContent,/dashboard-01-setup\.sql/)});
test('driver login needs no membership approval and stays view-only',async()=>{const {el,flags}=await setup({membership:{display_name:'Pending',role:'driver',approved:false}});assert.deepEqual(flags,[false]);assert.equal(el('dashboard').hidden,false)});
test('approved driver receives view-only flags with same login',async()=>{const {el,flags}=await setup({membership:{display_name:'Driver',role:'driver',approved:true}});assert.deepEqual(flags,[false]);el('flags-tab').onclick();assert.equal(el('flags').hidden,false);await el('flags-logout').onclick();assert.equal(el('login').hidden,false);assert.equal(el('flags').hidden,true)});




test('self-signup creates a read-only driver even with edited metadata',async()=>{
 const {el,flags,signups}=await setup();await el('sign-out').onclick();el('signup-toggle').onclick();el('signup-name').value='New Driver';el('password').value='mock-password-123';await el('login-form').onsubmit({preventDefault(){}});
 assert.equal(signups.length,1);assert.equal(signups[0].options.data.display_name,'New Driver');assert.equal(flags.at(-1),false);assert.equal(el('dashboard').hidden,false);
});
test('signup without a session asks for email confirmation',async()=>{
 const {el,signups}=await setup({signupSession:false});await el('sign-out').onclick();el('signup-toggle').onclick();el('signup-name').value='New Driver';el('password').value='mock-password-123';await el('login-form').onsubmit({preventDefault(){}});
 assert.equal(signups.length,1);assert.match(el('auth-message').textContent,/Check your email/);assert.equal(el('dashboard').hidden,true);
});

test('guest opens live viewing without creating or logging in to an account',async()=>{
 const {el,flags,signups}=await setup();await el('sign-out').onclick();await el('guest').onclick();
 assert.equal(el('dashboard').hidden,false);assert.equal(el('sign-out').textContent,'Exit guest');assert.equal(flags.at(-1),false);assert.equal(signups.length,0);
});
