import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
const output=process.stdout.write.bind(process.stdout);
const emit=(type,data={})=>output(JSON.stringify({type,...data})+'\n');
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
const iterator=input[Symbol.asyncIterator]();
async function next(){const line=await iterator.next();if(line.done)throw Error('Sign-in cancelled.');return JSON.parse(line.value)}
try{
 const credentials=await next();
 if(typeof credentials.email!=='string'||typeof credentials.password!=='string')throw Error('Enter your email and password.');
 const config=JSON.parse(await readFile(new URL('../config.json',import.meta.url),'utf8'));
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabase_url)||!config.supabase_publishable_key?.startsWith('sb_publishable_'))throw Error('Invalid receiver configuration.');
 async function api(path,body,token){
  const response=await fetch(config.supabase_url+path,{method:body?'POST':'GET',signal:AbortSignal.timeout(10000),headers:{apikey:config.supabase_publishable_key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok)throw Error(response.status===400||response.status===401?'Sign-in failed. Check your F7R email and password.':'Could not connect to F7R ('+response.status+').');
  return data;
 }
 const auth=await api('/auth/v1/token?grant_type=password',credentials);
 const members=await api('/rest/v1/f7r_members?user_id=eq.'+auth.user.id+'&select=approved,role',null,auth.access_token);
 if(!members[0]?.approved||!['admin','publisher'].includes(members[0].role))throw Error('This account is not an approved telemetry publisher.');
 const races=await api('/rest/v1/f7r_sessions?publisher_id=eq.'+auth.user.id+'&status=eq.live&select=id,title,game_format&order=created_at.desc',null,auth.access_token);
 if(!races.length)throw Error('No live race is assigned to this account. Ask a race admin to assign one.');
 emit('races',{races});
 const choice=await next();
 if(!races.some(r=>r.id===choice.sessionId))throw Error('Choose one of your assigned live races.');
 const gameIp=typeof choice.gameIp==='string'?choice.gameIp.trim():'';
 process.env.F7R_SESSION_ID=choice.sessionId;process.env.F7R_GAME_IP=gameIp||'auto';
 process.env.F7R_RECEIVER_EMAIL=credentials.email;process.env.F7R_RECEIVER_PASSWORD=credentials.password;
 credentials.password='';input.close();process.stdin.pause();
 // Keep the existing receiver implementation and its server-enforced permissions.
 // Frame messages use carriage returns in the CLI; send each as a GUI event instead.
 process.stdout.write=(chunk)=>{emit('log',{message:String(chunk).replace(/\r/g,'').trim()});return true};
 process.stderr.write=(chunk)=>{emit('error',{message:String(chunk).trim()});return true};
 emit('connected');
 await import('./start.mjs');
}catch(error){emit('fatal',{message:error.message});process.exitCode=1;input.close();process.stdin.pause();}
