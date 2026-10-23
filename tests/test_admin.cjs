const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
class Element {
  constructor(){this.children=[];this.dataset={};this.style={};this.attributes={};this.value='';this.hidden=false;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(k,v){this.attributes[k]=v;}
}
const elements=new Map();
const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
let approved=false, revision=0, calls=0;
let saved={id:1,flag:'CLEAR',revision:0,updated_at:new Date().toISOString()};
const client={
  auth:{onAuthStateChange(){},async signInWithPassword(){return {data:{session:{user:{id:'test-user'}}}};},async signOut(){return {}; }},
  from(table){const b={select(){return b},eq(){return b},order(){return b},async maybeSingle(){return {data:approved?{user_id:'test-user'}:null}},async single(){return {data:saved}},async limit(){return {data:[]}}};return b;},
  channel(){const c={on(){return c},subscribe(cb){cb('SUBSCRIBED');return c}};return c;},
  async removeChannel(){},
  async rpc(name,body){assert.equal(name,'set_flag');calls++;saved={...saved,flag:body.requested_flag,revision:++revision};return {data:saved};}
};
const context=vm.createContext({
  document:{getElementById:get,createElement:()=>new Element(),querySelector:()=>get('current'),querySelectorAll:()=>get('flag-grid').children},
  window:{supabase:{createClient:()=>client}},
  fetch:async()=>({ok:true,json:async()=>({supabase_url:'https://example.supabase.co',supabase_publishable_key:'sb_publishable_example'})}),
  setInterval(){},setTimeout(){},console,Date
});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..','admin.js'),'utf8'),context);
async function evaluate(code){return await vm.runInContext(code,context);}
(async()=>{
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(get('sign-in').disabled,false);
  assert.equal(get('flag-grid').children.length,10);
  get('email').value='test@example.invalid';get('password').value='local-test-only';
  await get('login-form').onsubmit({preventDefault(){}});
  assert.equal(get('console').hidden,true);
  await evaluate('changeFlag("RED")');assert.equal(calls,0);
  approved=true;
  await get('login-form').onsubmit({preventDefault(){}});
  assert.equal(get('console').hidden,false);
  for(const flag of ['YELLOW','SAFETY CAR','FCY','RED','GREEN','CLEAR']){
    await evaluate(`changeFlag(${JSON.stringify(flag)})`);
    assert.equal(saved.flag,flag);
  }
  await evaluate('applyState({id:1,flag:"RED",revision:0,updated_at:new Date().toISOString()})');
  assert.equal(get('active-flag').textContent,'No active flag');
  await get('sign-out').onclick();assert.equal(get('console').hidden,true);
  console.log('Admin flow checks passed: sign-in setup, unapproved account blocked, all primary flags, revision ordering, sign-out.');
})().catch(error=>{console.error(error);process.exitCode=1;});

