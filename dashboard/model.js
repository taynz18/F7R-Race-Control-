export const isNumber=n=>typeof n==='number'&&Number.isFinite(n);
export function lapTime(ms){if(!isNumber(ms)||ms<=0)return '—';return Math.floor(ms/60000)+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(Math.floor(ms)%1000).padStart(3,'0')}
export function reading(n,suffix='',digits=0){return isNumber(n)?n.toFixed(digits)+suffix:'—'}
export function driverName(d,race){const mapped=race?.driver_names?.[String(d.slot)];return typeof mapped==='string'&&mapped.trim()?mapped.slice(0,64):typeof d.name==='string'&&d.name.trim()?d.name.slice(0,64):'Car '+(d.slot+1)+' · name unavailable'}
export function energy(d){if(!d.telemetry_public)return 'Private';if(isNumber(d.ers_percent))return d.ers_percent.toFixed(0)+'%';return isNumber(d.ers_joules)?(d.ers_joules/1e6).toFixed(2)+' MJ':'—'}
export function feedState(snapshot,race,now=Date.now(),demo=false){if(demo)return 'DEMO DATA';if(!snapshot)return 'WAITING FOR RECEIVER';if(race?.status==='finished')return 'RACE FINISHED';return now-Date.parse(snapshot.received_at)>8000?'STALE · LAST KNOWN DATA':'LIVE'}
export function acceptsSnapshot(current,next){return !!next&&(!current||(next.session_id===current.session_id&&Number(next.frame)>Number(current.frame)))}


export function damageAlert(driver){
 if(driver.telemetry_public!==true||driver.damage_stale===true)return null;
 const values=Object.values(driver.damage||{}).filter(n=>isNumber(n)&&n>=0&&n<=100);
 const worst=values.length?Math.max(...values):0;
 return worst>0?{level:worst>=30?'major':'minor',percent:worst}:null;
}
export function penaltyLabel(seconds){return Number.isSafeInteger(seconds)&&seconds>0?'+'+seconds:''}
