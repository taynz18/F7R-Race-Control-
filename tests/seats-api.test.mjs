import test from 'node:test';import assert from 'node:assert/strict';
globalThis.Deno={serve:()=>{},env:{get:()=>undefined}};
const {handleSeats}=await import('../supabase/functions/f7r-seats/index.js');
const env=k=>({SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',F7R_DISCORD_SERVER_ID:'111111111111111111'})[k];
const req=(token,origin='https://racecontrol.f7r.co.uk')=>new Request('https://api.test',{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'load'})});
test('seat waiting list rejects missing authentication and untrusted origins',async()=>{assert.equal((await handleSeats(req(null),env)).status,401);assert.equal((await handleSeats(req('token','https://untrusted.test'),env)).status,403);});
test('ordinary authenticated users cannot read private applications',async()=>{const old=fetch;globalThis.fetch=async url=>url.includes('/auth/')?Response.json({id:'member'}):Response.json([]);try{const result=await handleSeats(req('token'),env);assert.equal(result.status,403);}finally{globalThis.fetch=old;}});
test('anonymous accounts cannot use editable metadata to gain admin access',async()=>{const old=fetch;globalThis.fetch=async()=>Response.json({id:'member',is_anonymous:true,user_metadata:{admin:true}});try{assert.equal((await handleSeats(req('token'),env)).status,403);}finally{globalThis.fetch=old;}});
