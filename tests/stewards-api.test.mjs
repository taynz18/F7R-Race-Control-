import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.Deno={serve:()=>{},env:{get:()=>undefined}};
const {handleStewards}=await import('../supabase/functions/f7r-stewards/index.js');
const env=key=>({SUPABASE_URL:'https://database.test',SUPABASE_SERVICE_ROLE_KEY:'service-test',SUPABASE_ANON_KEY:'anon-test',F7R_DISCORD_BOT_TOKEN:'bot-test',F7R_DISCORD_SERVER_ID:'123456789012345678'})[key];
const request=(body,token)=>new Request('https://api.test',{method:'POST',headers:{...(token?{Authorization:'Bearer '+token,...(/^[a-f0-9]{64}$/.test(token)?{'x-f7r-admin-token':'admin-jwt'}:{})}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)});
const driver='223456789012345678',caseId='11111111-1111-4111-8111-111111111111',token='a'.repeat(64);
const route={id:'t1',config:{name:'Tier 1',steward_roles:['steward'],leader_roles:['head'],default_set:'F1'}};
const c={id:caseId,route_id:'t1',reporter_id:'323456789012345678',accused_id:'423456789012345678',data:{race:'Monza',lap:'Lap 1',report:{statement:'report'},defence:{statement:'defence'}},status:'discussion',votes:{},comments:[]};
async function withFetch(fn,work){const original=globalThis.fetch;globalThis.fetch=fn;try{return await work();}finally{globalThis.fetch=original;}}
function backend(roles=['steward'],incident=c,approved=true){return async url=>{
 if(url.endsWith('/auth/v1/user'))return Response.json({id:'admin'});
 if(url.includes('flag_admins'))return Response.json(approved?[{user_id:'admin'}]:[]);
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
 await withFetch(backend(['head']),async()=>{
   const result=await(await handleStewards(request({action:'brief',id:caseId},token),env)).json();assert.equal(result.ai,false);assert.match(result.note,/not configured/);
 });
});
test('ordinary stewards cannot change reporting roles',async()=>{
 await withFetch(backend(['steward'],c,false),async()=>assert.equal((await handleStewards(request({action:'save_route'},token),env)).status,403));
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
   if(url.includes('/channels/channel/messages')){const body=JSON.parse(options.body);assert.ok(body.components[0].components.some(b=>b.label==='Appeal in-game penalty'));assert.equal(body.components[0].components.length,2);assert.ok(body.components[0].components.every(b=>!b.custom_id.includes('access')));assert.match(body.content,/Video evidence is mandatory/);if(options.method==='PATCH')edits++;else posts++;return Response.json({id:'message'});}
   throw Error('Unexpected request '+url);
 },async()=>{
   const first=await(await handleStewards(request({action:'publish_panel',id:route.id},'admin-jwt'),env)).json();
   assert.ok(first.url);assert.match(first.warning,/registration failed/);
   const second=await(await handleStewards(request({action:'publish_panel',id:route.id},'admin-jwt'),env)).json();assert.equal(second.url,first.url);
 });
 assert.equal(posts,1);assert.equal(edits,1);
});
test('a mixed-case reference saves and publishes using the same canonical group',async()=>{
 const driverRole='523456789012345678',stewardRole='623456789012345678',headRole='723456789012345678',channel='823456789012345678';let stored;
 await withFetch(async(url,options={})=>{
   if(url.endsWith('/auth/v1/user'))return Response.json({id:'admin'});
   if(url.includes('flag_admins'))return Response.json([{user_id:'admin'}]);
   if(url.includes('f7r_steward_routes')){if(options.method==='POST')stored=JSON.parse(options.body);if(options.method==='PATCH')stored.config=JSON.parse(options.body).config;return Response.json(stored?[stored]:[]);}
   if(url.endsWith('/roles'))return Response.json([{id:driverRole},{id:stewardRole},{id:headRole},{id:'bot',permissions:'8'}]);
   if(url.endsWith('/channels'))return Response.json([{id:channel,type:0}]);
   if(url.includes('/members/'))return Response.json({roles:['bot']});
   if(url.includes('/commands'))return Response.json({id:'command'});
   if(url.includes('/messages'))return Response.json({id:'message'});
   throw Error('Unexpected request '+url);
 },async()=>{
   const result=await(await handleStewards(request({action:'save_route',id:'Test',config:{name:'Test',default_set:'F1',enabled:true,driver_roles:[driverRole],steward_roles:[stewardRole],leader_roles:[headRole],report_channel:channel}},'admin-jwt'),env)).json();
   assert.equal(result.saved,true);assert.equal(result.id,'test');assert.equal(stored.id,'test');
   const published=await(await handleStewards(request({action:'publish_panel',id:'Test'},'admin-jwt'),env)).json();assert.ok(published.url?.endsWith('/message'));
 });
});

test('reporter target returns its own tally and routes votes without changing the primary decision',async()=>{
 const raw={...c,status:'closed',outcome:'No further action',votes:{primary:{penalty:'No further action'}},data:{...c.data,reporter_verdict:{status:'voting',penalty_set:'Endurance',votes:{second:{penalty:'50 seconds'}}}}};
 await withFetch(async(url,options)=>{
   if(url.includes('/rpc/f7r_steward_action')){const input=JSON.parse(options.body);assert.equal(input.p_value.target,'reporter');assert.equal(input.p_action,'vote');return Response.json(raw);}
   return backend(['steward'],raw)(url);
 },async()=>{
   const result=await(await handleStewards(request({action:'case',id:caseId,target:'reporter'},token),env)).json();
   assert.deepEqual(result.tally.totals,{});assert.equal(result.tally.count,1);assert.equal(result.incident.outcome,'No further action');
   const voted=await handleStewards(request({action:'vote',id:caseId,target:'reporter',penalty:'50 seconds',reason:'Reporting driver was responsible.'},token),env);assert.equal(voted.status,200);
 });
});

test('Discord access tokens alone cannot open any website case endpoint',async()=>{
 await withFetch(()=>{throw Error('Must reject before querying sessions or cases');},async()=>{
   for(const action of ['list','case','open_review','comment','vote','brief','close_vote','send_pending']){
     const r=await handleStewards(new Request('https://api.test',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action,id:caseId})}),env);
     assert.equal(r.status,403,action);
   }
 });
});
test('unapproved website accounts are denied even with a valid steward link',async()=>{
 const requests=[];
 await withFetch(async url=>{requests.push(url);if(url.endsWith('/auth/v1/user'))return Response.json({id:'not-admin'});if(url.includes('flag_admins'))return Response.json([]);throw Error('Non-admin accessed private data');},async()=>{
   for(const bearer of ['driver-jwt',token])assert.equal((await handleStewards(request({action:'list'},bearer),env)).status,403);
 });
 assert.ok(requests.every(url=>url.includes('/auth/')||url.includes('flag_admins')));
});
test('approved admins can inspect cases without a Discord steward session',async()=>{
 await withFetch(backend(),async()=>{
   const r=await(await handleStewards(request({action:'case',id:caseId},'admin-jwt'),env)).json();
   assert.equal(r.incident.id,caseId);assert.equal(r.access.steward,false);
 });
});

test('approved admin setup enables automatic reading and reports the verified setting',async()=>{
 let enabled=false;
 await withFetch(async(url,options={})=>{
   if(url.endsWith('/applications/@me')){if(options.method==='PATCH'){const b=JSON.parse(options.body);assert.equal(b.flags,1<<19);enabled=true;}return Response.json({flags:enabled?1<<19:0});}
   if(url.endsWith('/roles')||url.endsWith('/channels'))return Response.json([]);
   if(url.includes('f7r_steward_cases?'))return Response.json([]);
   return backend()(url);
 },async()=>{
   const r=await(await handleStewards(request({action:'setup_options'},'admin-jwt'),env)).json();assert.equal(r.reading.enabled,true);assert.equal(enabled,true);
 });
});
test('admin ticket deletion requires explicit confirmation and deletes only its case channel',async()=>{
 const raw={...c,number:1001,revision:3,guild_id:env('F7R_DISCORD_SERVER_ID'),data:{...c.data,report_ticket:'ticket'}},removed=[];
 await withFetch(async(url,options={})=>{
   if(url.includes('/rpc/f7r_steward_action'))return Response.json({...raw,data:{...raw.data,deletion:{channels:['ticket']}}});
   if(url.endsWith('/channels/ticket')){if(options.method==='DELETE'){removed.push('ticket');return new Response(null,{status:204});}return Response.json({type:0,name:'case-1001',guild_id:raw.guild_id});}
   return backend(['steward'],raw)(url);
 },async()=>{
   assert.equal((await handleStewards(request({action:'delete_ticket',id:caseId,revision:3,reason:'Duplicate'},'admin-jwt'),env)).status,400);
   assert.equal((await handleStewards(request({action:'delete_ticket',id:caseId,revision:3,reason:'Duplicate',confirm:'DELETE'},'admin-jwt'),env)).status,200);
   assert.deepEqual(removed,['ticket']);
 });
});

test('ordinary website stewards see vote count and own vote only, including separate verdict',async()=>{
 const incident={...c,votes:{[driver]:{penalty:'Warning',reason:'Own reason'},other:{penalty:'Race ban',reason:'Private reason'}},data:{...c.data,reporter_verdict:{status:'voting',votes:{other:{penalty:'Season ban',reason:'Secret second vote'}}}}};
 await withFetch(backend(['steward'],incident),async()=>{const r=await(await handleStewards(request({action:'case',id:caseId},token),env)).json();assert.equal(r.tally.count,2);assert.deepEqual(r.tally.totals,{});assert.deepEqual(Object.keys(r.incident.votes),[driver]);assert.deepEqual(r.incident.data.reporter_verdict.votes,{});assert.ok(!JSON.stringify(r).includes('Private reason'));});
});