import {readFile,writeFile,mkdir} from 'node:fs/promises';
const key=process.env.RLT_API_KEY;
if(!key) throw Error('RLT_API_KEY is required');
const dir='outputs/rlt-import'; await mkdir(dir,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(path){
 const file=dir+'/'+path.replace(/[^a-z0-9]/gi,'_')+'.json';
 try{return JSON.parse(await readFile(file,'utf8'))}catch{}
 for(let attempt=0;attempt<7;attempt++){
  const res=await fetch('https://www.racingleaguetools.com/api/public/v1/'+path,{headers:{'X-API-Key':key},signal:AbortSignal.timeout(60000)});
  if(res.status===429||res.status>=500){await sleep(Math.min(30000,2000*2**attempt));continue;}
  if(!res.ok) throw Error('RLT request failed: '+res.status+' '+path);
  const body=await res.json();if(!body.data)throw Error('Missing data: '+path);
  await writeFile(file,JSON.stringify(body.data));await sleep(250);return body.data;
 }throw Error('RLT retry limit: '+path);
}
const seasons=await get('seasons');
await get('league');
for(const index of seasons.seasons){
 const id=index.seasonId;
 const detail=await get(`seasons/${id}`);
 const events=await get(`seasons/${id}/events`);
 const standings=await get(`seasons/${id}/standings?includeHistory=true&includeDeepRatings=true&includeTeammates=true`);
 const lineups=await get(`seasons/${id}/lineups`);
 const fullEvents=[];
 for(const event of events.events)fullEvents.push(await get(`events/${event.eventId}?includeDeepRatings=true`));
 await writeFile(`${dir}/season-${id}.json`,JSON.stringify({source:'RLT Public API v1',importedAt:new Date().toISOString(),index,detail,standings,lineups,events:fullEvents}));
 console.log('Saved '+index.seasonName+' · '+fullEvents.length+' events');
}
console.log('Completed '+seasons.seasons.length+' seasons.');

