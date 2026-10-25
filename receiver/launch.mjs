import {createInterface} from 'node:readline/promises';
import {emitKeypressEvents} from 'node:readline';
import {pathToFileURL} from 'node:url';

export function readHiddenPassword(input=process.stdin,output=process.stdout){
 if(!input.isTTY||typeof input.setRawMode!=='function')return Promise.reject(Error('Open START-F7R-RECEIVER.cmd in a normal terminal to enter your password privately.'));
 output.write('Receiver password (hidden): ');
 emitKeypressEvents(input);
 const wasRaw=!!input.isRaw;input.setRawMode(true);input.resume();
 return new Promise((resolve,reject)=>{
  let password='';
  const finish=(error)=>{
   input.removeListener('keypress',onKey);input.setRawMode(wasRaw);input.pause();output.write('\n');
   if(error){password='';reject(error)}else resolve(password);
  };
  const onKey=(text,key={})=>{
   if(key.ctrl&&key.name==='c')return finish(Error('Sign-in cancelled.'));
   if(key.name==='return'||key.name==='enter')return finish();
   if(key.name==='backspace'){password=Array.from(password).slice(0,-1).join('');return}
   if(!key.ctrl&&!key.meta&&text&&!/[\x00-\x1f\x7f]/.test(text))password+=text;
  };
  input.on('keypress',onKey);
 });
}
export async function launch(){
 if(Number(process.versions.node.split('.')[0])<22)throw Error('Install Node.js 24 LTS from https://nodejs.org then reopen the launcher.');
 console.log('F7R Race Control - live receiver');
 console.log('Keep this window open. Close Racing League Tools first.');
 console.log('F1: UDP On, Broadcast On, port 20777, format 2026.');
 const prompt=createInterface({input:process.stdin,output:process.stdout});
 try{
  process.env.F7R_SESSION_ID=(await prompt.question('Race ID (Enter for F7R Live Race): ')).trim()||'cda3f85a-268a-40b7-87d9-869932e749eb';
  process.env.F7R_GAME_IP=(await prompt.question('Game IP (Enter for automatic detection): ')).trim()||'auto';
  process.env.F7R_RECEIVER_EMAIL=(await prompt.question('Receiver email (Enter for formula7racing@gmail.com): ')).trim()||'formula7racing@gmail.com';
 }finally{prompt.close()}
 try{
  process.env.F7R_RECEIVER_PASSWORD=await readHiddenPassword();
  if(!process.env.F7R_RECEIVER_PASSWORD)throw Error('No password entered. Reopen the launcher to try again.');
  await import('./start.mjs');
 }finally{delete process.env.F7R_RECEIVER_PASSWORD}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 launch().catch(error=>{console.error('\nReceiver could not start: '+error.message);process.exitCode=1});
}
