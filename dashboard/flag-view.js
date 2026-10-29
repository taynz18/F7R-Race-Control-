import {FlagController,FLAG_LABELS,FLAG_COLORS} from './flags.js?v=countdown-phases-1';
const $=id=>document.getElementById(id);
let controller=null,editRevision=null,dirty=false;
const flagButtons=[];
for(const [flag,label] of Object.entries(FLAG_LABELS)){
 const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.flag=flag;b.style.setProperty('--signal',FLAG_COLORS[flag]);b.disabled=true;
 b.onclick=async()=>{if(controller&&await controller.send(flag,$('flag-message-input').value)){dirty=false;editRevision=null}};
 $('flag-buttons').append(b);flagButtons.push(b);
}
function render({state,isAdmin,busy,online,timer}){
 $('flag-admin-controls').hidden=!isAdmin;$('flag-access').textContent=isAdmin?'ADMIN CONTROLS':'DRIVER · VIEW ONLY';
 $('flag-banner').hidden=!state;
 $('flag-connection').textContent=online?'Live flag connection':'Flag feed offline';
 $('flag-banner').classList.toggle('offline',!online);
 $('flag-banner').style.setProperty('--signal',FLAG_COLORS[state?.flag]||'#8b96ab');
 $('flag-banner-label').textContent=online?(state?.flag==='CLEAR'?'No active flag':FLAG_LABELS[state?.flag]||'Waiting for flag data'):'FLAG FEED OFFLINE';
 $('flag-banner-message').textContent=online?(state?.custom_message||''):'Last signal may be outdated. Check race instructions.';
 $('flag-current').textContent=state?(state.flag==='CLEAR'?'No active flag':state.flag==='FCY'&&!state.countdown_ends_at?'FCY active':FLAG_LABELS[state.flag]):'Waiting for race control';
 $('flag-current-message').textContent=state?.custom_message||'';
 $('flag-time-label').textContent=online?timer.label:'LAST KNOWN SIGNAL';
 $('flag-time').textContent=online?timer.value:'—';
 $('flag-current-card').style.setProperty('--signal',FLAG_COLORS[state?.flag]||'#8b96ab');
 const disabled=!isAdmin||busy||!online||!state;
 flagButtons.forEach(b=>{b.disabled=disabled;b.setAttribute('aria-pressed',String(b.dataset.flag===state?.flag))});
 $('flag-green-countdown').disabled=disabled;$('flag-start-green-countdown').disabled=disabled;
 $('flag-message-input').disabled=disabled;$('flag-countdown').disabled=disabled;
 $('flag-update-message').disabled=disabled||state?.flag==='CLEAR';$('flag-start-countdown').disabled=disabled;
 $('flag-cancel-countdown').disabled=disabled||!['FCY','PREPARE TO RACE'].includes(state?.flag)||!state?.countdown_ends_at;
 if(!dirty)$('flag-message-input').value=state?.custom_message||'';
}
$('flag-message-input').oninput=()=>{if(!dirty)editRevision=controller?.state?.revision??null;dirty=true};
$('flag-update-message').onclick=async()=>{if(controller&&await controller.updateMessage($('flag-message-input').value,dirty?editRevision:controller.state?.revision)){dirty=false;editRevision=null}};
$('flag-start-countdown').onclick=async()=>{const text=$('flag-countdown').value.trim();if(!/^\d+$/.test(text)){$('flag-feedback').textContent='Enter a positive whole number of seconds.';return}if(controller&&await controller.send('FCY',$('flag-message-input').value,Number(text))){dirty=false;editRevision=null}};
$('flag-start-green-countdown').onclick=async()=>{const text=$('flag-green-countdown').value.trim();if(!/^\d+$/.test(text)){$('flag-feedback').textContent='Enter a positive whole number of seconds.';return}if(controller&&await controller.send('PREPARE TO RACE',$('flag-message-input').value,Number(text))){dirty=false;editRevision=null}};
$('flag-cancel-countdown').onclick=()=>controller?.cancelCountdown();
export async function startFlags(client,isAdmin,userId){
 await stopFlags();dirty=false;editRevision=null;$('flag-feedback').textContent='';
 controller=new FlagController({client,isAdmin,userId,onChange:render,onMessage:text=>{$('flag-feedback').textContent=text}});
 await controller.start();
}
export async function stopFlags(){const old=controller;controller=null;if(old)await old.stop();$('flag-banner').hidden=true;$('flag-admin-controls').hidden=true;$('flag-current').textContent='Waiting for race control';$('flag-current-message').textContent='';$('flag-message-input').value='';$('flag-feedback').textContent=''}


