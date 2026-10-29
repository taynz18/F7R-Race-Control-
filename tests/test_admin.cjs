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
let saved={id:1,flag:'CLEAR',revision:0,updated_at:new Date().toISOString(),custom_message:'',countdown_ends_at:null};
const client={
  auth:{onAuthStateChange(){},async signInWithPassword(){return {data:{session:{user:{id:'test-user'}}}};},async signOut(){return {}; }},
  from(table){const b={select(){return b},eq(){return b},order(){return b},async maybeSingle(){return {data:approved?{user_id:'test-user'}:null}},async single(){return {data:saved}},async limit(){return {data:[]}}};return b;},
  channel(){const c={on(){return c},subscribe(cb){cb('SUBSCRIBED');return c}};return c;},
  async removeChannel(){},
  async rpc(name,body){
    if(name==='get_race_state')return {data:saved};
    assert.ok(['set_race_signal','update_flag_message'].includes(name));
    calls++;
    if(name==='update_flag_message')saved={...saved,custom_message:body.requested_message,revision:++revision};
    else saved={...saved,flag:body.requested_flag,custom_message:body.requested_message,revision:++revision,
      updated_at:new Date().toISOString(),countdown_ends_at:body.countdown_seconds?new Date(Date.now()+body.countdown_seconds*1000).toISOString():null};
    return {data:saved};
  }
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
  assert.equal(get('flag-grid').children.length,11);
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
  get('custom-message').value='<script>alert(1)</script>';
  get('custom-message').oninput();
  await evaluate('changeFlag("FCY",30)');
  assert.equal(saved.flag,'FCY');
  assert.equal(get('live-custom-message').textContent,'<script>alert(1)</script>');
  const deadline=saved.countdown_ends_at;
  const started=saved.updated_at;
  get('custom-message').value='Hold position';
  await get('update-message').onclick();
  assert.equal(saved.custom_message,'Hold position');
  assert.equal(saved.countdown_ends_at,deadline);
  assert.equal(saved.updated_at,started);
  await evaluate('updateDuration(Date.parse(state.countdown_ends_at)-10500)');
  assert.equal(get('flag-duration').textContent,'00:00:11');
  await evaluate('updateDuration(Date.parse(state.countdown_ends_at)+5000)');
  assert.equal(get('flag-duration').textContent,'00:00:00');
  assert.equal(saved.flag,'FCY'); // The browser never invents a GREEN signal.
  assert.equal(get('duration-label').textContent,'ACTIVATING FCY');
  await get('cancel-countdown').onclick();
  assert.equal(saved.flag,'FCY');assert.equal(saved.countdown_ends_at,null);
  get('green-countdown-seconds').value='20';await get('start-green-countdown').onclick();
  assert.equal(saved.flag,'PREPARE TO RACE');
  await evaluate('updateDuration(Date.parse(state.countdown_ends_at)-20000)');
  assert.equal(get('duration-label').textContent,'GREEN IN');
  await evaluate('updateDuration(Date.parse(state.countdown_ends_at)+1000)');
  assert.equal(get('duration-label').textContent,'AWAITING GREEN');
  assert.equal(saved.flag,'PREPARE TO RACE');
  await get('cancel-countdown').onclick();
  assert.equal(saved.flag,'PREPARE TO RACE');assert.equal(saved.countdown_ends_at,null);
  const before=calls;
  for(const bad of ['0','-5','1.5','abc','2147483648']){
    get('countdown-seconds').value=bad;await get('start-countdown').onclick();
  }
  assert.equal(calls,before);
  get('countdown-seconds').value='90';await get('start-countdown').onclick();
  assert.ok(saved.countdown_ends_at);
  await evaluate('changeFlag("RED")');assert.equal(saved.countdown_ends_at,null);
  await get('sign-out').onclick();assert.equal(get('console').hidden,true);
  console.log('Admin flow checks passed: sign-in setup, unapproved account blocked, all primary flags, revision ordering, sign-out.');
})().catch(error=>{console.error(error);process.exitCode=1;});


