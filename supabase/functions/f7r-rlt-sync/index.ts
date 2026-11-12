const TOKEN_HASH='7a76c9bd446e7c8dca329d0df2cabc4ba633fb2936a7eea17c40771098257608';
const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const dbHeaders={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
async function rpc(action:string,claim:string|null=null,payload:unknown={}){
 const r=await fetch(url+'/rest/v1/rpc/f7r_rlt_sync',{method:'POST',headers:dbHeaders,body:JSON.stringify({action,claim,payload}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Archive storage unavailable');return await r.json();
}
async function api(key:string,path:string,started:number){
 if(Date.now()-started>85000)throw Error('Import time limit; retry queued');
 let r:Response; for(let attempt=0;;attempt++){r=await fetch('https://www.racingleaguetools.com/api/public/v1/'+path,{headers:{'X-API-Key':key},signal:AbortSignal.timeout(20000)});if(r.status<500||attempt>=2)break;await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}
 if(!r.ok)throw Error(r.status===429?'RLT rate limit; retry queued':r.status===401||r.status===403?'RLT key rejected; admin action required':'RLT request failed ('+r.status+') at '+path.split('?')[0]);
 const b=await r.json();if(!b.data)throw Error('RLT returned no data');return b.data;
}
function dirtySeasons(feed:any,seasons:any[]){
 const all=()=>seasons.map(s=>s.seasonId);
 if(feed.gap||feed.operations.length>=1000)return all();
 const ids=new Set<number>();
 for(const op of feed.operations)for(const resource of op.resources||[]){
  if(Number.isInteger(resource.seasonId))ids.add(resource.seasonId);
  else if(resource.type==='season'&&Number.isInteger(resource.id))ids.add(resource.id);
  else return all(); // League-wide driver, team or scoring edits may affect any season.
 }
 return [...ids];
}
async function encode(value:unknown){
 const stream=new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'));
 const bytes=new Uint8Array(await new Response(stream).arrayBuffer());
 let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return btoa(binary);
}
async function run(){
 const started=Date.now(),lock=await rpc('claim');if(!lock)return {status:'busy'};
 let sourceId:number|null=null;
 try{
  if(!lock.key)throw Error('RLT key is not configured');
  const manifest=await api(lock.key,'seasons',started);
  if(!Array.isArray(manifest.seasons))throw Error('Invalid RLT season list');
  const feed=await api(lock.key,'database/changes?limit=1000&'+(lock.cursor==null?'since='+encodeURIComponent(lock.since):'afterId='+lock.cursor),started);
  if(!Array.isArray(feed.operations)||!Number.isInteger(feed.cursor?.version))throw Error('Invalid RLT change feed');
  await rpc('poll',lock.claim,{seasons:manifest.seasons,dirty:dirtySeasons(feed,manifest.seasons),cursor:feed.cursor.version});
  sourceId=(await rpc('next',lock.claim)).source_id;
  if(sourceId==null)return {status:'checked',updated:0};
  const index=manifest.seasons.find((s:any)=>s.seasonId===sourceId);
  if(!index)throw Error('Queued RLT season unavailable');
  const detail=await api(lock.key,`seasons/${sourceId}`,started);
  const eventIndex=await api(lock.key,`seasons/${sourceId}/events`,started);
  const standings=await api(lock.key,`seasons/${sourceId}/standings?includeHistory=true&includeDeepRatings=true&includeTeammates=true`,started);
  const lineups=await api(lock.key,`seasons/${sourceId}/lineups`,started);
  if(!Array.isArray(eventIndex.events)||!Array.isArray(standings.seasonStatistics?.driverStandings)||!Array.isArray(lineups.seats))throw Error('Incomplete RLT season response');
  const events=[];
  for(let i=0;i<eventIndex.events.length;i+=2){
   const batch=await Promise.all(eventIndex.events.slice(i,i+2).map((e:any)=>api(lock.key,`events/${e.eventId}?includeDeepRatings=true`,started)));
   if(batch.some(e=>e.seasonId!==sourceId||!Array.isArray(e.sessions)))throw Error('Invalid RLT event response');
   events.push(...batch);
  }
  const importedAt=new Date().toISOString();
  const snapshot={source:'RLT Public API v1',importedAt,index,detail,standings,lineups,events};
  await rpc('save',lock.claim,{source_id:sourceId,name:index.seasonName,archived:index.isArchive,event_count:events.length,session_count:events.reduce((n,e)=>n+e.sessions.length,0),imported_at:importedAt,payload_gzip_base64:await encode(snapshot)});
  return {status:'updated',source_id:sourceId,events:events.length};
 }catch(e){
  const error=e instanceof Error?e.message:'Sync failed';
  await rpc('fail',lock.claim,{source_id:sourceId,error});
  return {status:'retry',message:error};
 }finally{await rpc('release',lock.claim);}
}
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const token=req.headers.get('x-sync-token')||'';
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==TOKEN_HASH)return new Response('Unauthorized',{status:401});
 try{return Response.json(await run());}catch{return Response.json({status:'error',message:'Archive sync unavailable'},{status:500});}
});

