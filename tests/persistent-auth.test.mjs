import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import * as model from '../dashboard/model.js';import {teamFor} from '../dashboard/teams.js';
class Element{constructor(){this.children=[];this.textContent='';this.hidden=false;this.value='';this.style={setProperty(){}};this.classList={toggle(){},add(){},remove(){}};this.dataset={}}append(...n){this.children.push(...n)}replaceChildren(...n){this.children=n}setAttribute(){}}
async function boot(store){
 const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)};let authOptions,flagAccess;
 const client={auth:{getUser:async()=>({data:{user:store.user},error:null}),onAuthStateChange(){},signOut:async()=>{store.user=null;return {error:null}}},from(table){const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},maybeSingle:async()=>({data:table==='flag_admins'&&store.admin?{user_id:store.user.id}:null,error:null}),then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}};return q}};
 const code=(await readFile(new URL('../dashboard/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace('}start();','}');
 const ctx={...model,teamFor,renderCar:()=>new Element(),renderTrackMap:()=>new Element(),startFlags:async(c,a,id)=>{flagAccess={admin:a,id}},stopFlags:async()=>{},document:{getElementById:el,createElement:()=>new Element()},window:{supabase:{createClient:(u,k,options)=>{authOptions=options;return client}}},fetch:async()=>({ok:true,json:async()=>({supabase_url:'https://uyiafrzsyzrtnuxxjkye.supabase.co',supabase_publishable_key:'sb_publishable_test'})}),setInterval(){},setTimeout:fn=>fn(),Date,console,URLSearchParams};
 vm.createContext(ctx);vm.runInContext(code,ctx);await vm.runInContext('start()',ctx);return {ctx,el,authOptions,flagAccess};
}
test('existing driver sign-in restores after navigation/reload without requesting credentials',async()=>{
 const store={user:{id:'driver',user_metadata:{display_name:'F7R Driver'}}};const first=await boot(store);
 assert.equal(first.authOptions.auth.persistSession,true);assert.equal(first.el('login').hidden,true);assert.equal(first.el('dashboard').hidden,false);assert.equal(first.flagAccess.admin,false);assert.match(first.el('welcome').textContent,/F7R Driver/);
 const reload=await boot(store);assert.equal(reload.el('login').hidden,true);assert.equal(reload.flagAccess.id,'driver');
 await reload.el('sign-out').onclick();assert.equal(store.user,null);const signedOut=await boot(store);assert.equal(signedOut.el('login').hidden,false);
});
test('restored admin permissions still come from flag_admins, not user metadata',async()=>{
 const admin=await boot({user:{id:'admin',user_metadata:{}},admin:true});assert.equal(admin.flagAccess.admin,true);
 const spoof=await boot({user:{id:'driver',user_metadata:{role:'admin',approved:true}},admin:false});assert.equal(spoof.flagAccess.admin,false);
});
