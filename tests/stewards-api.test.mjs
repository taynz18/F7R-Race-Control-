import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.Deno={serve:()=>{},env:{get:()=>undefined}};
const {handleStewards}=await import('../supabase/functions/f7r-stewards/index.js');
const env=key=>({SUPABASE_URL:'https://database.test',SUPABASE_SERVICE_ROLE_KEY:'service-test',SUPABASE_ANON_KEY:'anon-test',F7R_DISCORD_BOT_TOKEN:'bot-test',F7R_DISCORD_SERVER_ID:'123456789012345678'})[key];
const request=(body,token)=>new Request('https://api.test',{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)});
const driver='223456789012345678',caseId='11111111-1111-4111-8111-111111111111',token='a'.repeat(64);
const route={id:'t1',config:{name:'Tier 1',steward_roles:['steward'],leader_roles:['head'],default_set:'F1'}};
const c={id:caseId,route_id:'t1',reporter_id:'323456789012345678',accused_id:'423456789012345678',data:{race:'Monza',lap:'Lap 1',report:{statement:'report'},defence:{statement:'defence'}},status:'discussion',votes:{},comments:[]};
async function withFetch(fn,work){const original=globalThis.fetch;globalThis.fetch=fn;try{return await work();}finally{globalThis.fetch=original;}}
function backend(roles=['steward'],incident=c){return async url=>{
 if(url.includes('f7r_steward_sessions'))return Response.json([{driver_id:driver}]);
 if(url.includes('/members/'))return Response.json({roles,user:{id:driver}});
 if(url.includes('f7r_steward_routes'))return Response.json([route]);
 if(url.includes('f7r_steward_cases'))return Response.json([incident]);
 throw Error('Unexpected request '+url);
};}
test('missing auth is rejected before reading cases',async()=>{
 await withFetch(()=>{throw Error('Must not fetch');},async()=>assert.equal((await handleStewards(request({action:'list'}),env)).status,401));
});
test('role membership is rechecked and removed stewards lose case access',async()=>{
 await withFetch(backend([]),async()=>{
   const list=await(await handleStewards(request({action:'list'},token),env)).json();assert.deepEqual(list.cases,[]);
   assert.equal((await handleStewards(request({action:'case',id:caseId},token),env)).status,403);
 });
});
test('involved stewards cannot retrieve their own case',async()=>{
 await withFetch(backend(['steward'],{...c,reporter_id:driver}),async()=>assert.equal((await handleStewards(request({action:'case',id:caseId},token),env)).status,400));
});
test('AI missing configuration gives an explicit template without calling AI',async()=>{
 await withFetch(backend(),async()=>{
   const result=await(await handleStewards(request({action:'brief',id:caseId},token),env)).json();assert.equal(result.ai,false);assert.match(result.note,/not configured/);
 });
});
test('ordinary stewards cannot change reporting roles',async()=>{
 await withFetch(backend(),async()=>assert.equal((await handleStewards(request({action:'save_route'},token),env)).status,403));
});
test('publishing updates the same desk and slash-command failure does not block it',async()=>{
 let stored={...route,config:{...route.config,enabled:true,report_channel:'channel'}},posts=0,edits=0;
 await withFetch(async(url,options={})=>{
   if(url.endsWith('/auth/v1/user'))return Response.json({id:'admin'});
   if(url.includes('flag_admins'))return Response.json([{user_id:'admin'}]);
   if(url.includes('f7r_steward_routes')){if(options.method==='PATCH')stored={...stored,config:JSON.parse(options.body).config};return Response.json([stored]);}
   if(url.endsWith('/roles'))return Response.json([{id:'bot',permissions:'8'}]);
   if(url.endsWith('/members/1004676760815796334'))return Response.json({roles:['bot']});
   if(url.endsWith('/channels'))return Response.json([{id:'channel',type:0}]);
   if(url.includes('/commands'))return Response.json({message:'Forbidden'},{status:403});
   if(url.includes('/channels/channel/messages')){const body=JSON.parse(options.body);assert.ok(body.components[0].components.some(b=>b.label==='Appeal in-game penalty'));if(options.method==='PATCH')edits++;else posts++;return Response.json({id:'message'});}
   throw Error('Unexpected request '+url);
 },async()=>{
   const first=await(await handleStewards(request({action:'publish_panel',id:route.id},'admin-jwt'),env)).json();
   assert.ok(first.url);assert.match(first.warning,/registration failed/);
   const second=await(await handleStewards(request({action:'publish_panel',id:route.id},'admin-jwt'),env)).json();assert.equal(second.url,first.url);
 });
 assert.equal(posts,1);assert.equal(edits,1);
});
