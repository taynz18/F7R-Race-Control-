export const isNumber=n=>typeof n==='number'&&Number.isFinite(n);
export function lapTime(ms){if(!isNumber(ms)||ms<=0)return '—';return Math.floor(ms/60000)+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(Math.floor(ms)%1000).padStart(3,'0')}
export function reading(n,suffix='',digits=0){return isNumber(n)?n.toFixed(digits)+suffix:'—'}
export function driverName(d,race){if(d.telemetry_public===false)return 'Player';const mapped=race?.driver_names?.[String(d.slot)];return typeof mapped==='string'&&mapped.trim()?mapped.slice(0,64):typeof d.name==='string'&&d.name.trim()?d.name.slice(0,64):'Player'}
export function energy(d){if(!d.telemetry_public)return 'Private';if(isNumber(d.ers_percent))return d.ers_percent.toFixed(0)+'%';return isNumber(d.ers_joules)?(d.ers_joules/1e6).toFixed(2)+' MJ':'—'}
export function feedState(snapshot,race,now=Date.now(),demo=false){if(demo)return 'DEMO DATA';if(!snapshot)return 'WAITING FOR RECEIVER';if(race?.status==='finished')return 'RACE FINISHED';return now-Date.parse(snapshot.received_at)>8000?'STALE · LAST KNOWN DATA':'LIVE'}
export function acceptsSnapshot(current,next){
 if(!next)return false;if(!current)return true;if(next.session_id!==current.session_id)return false;
 if(current.game_uid&&next.game_uid&&current.game_uid!==next.game_uid)return Date.parse(next.received_at)>Date.parse(current.received_at);
 return Number(next.frame)>Number(current.frame);
}
export function currentLiveRace(races,stamps=[],now=Date.now()){
 const live=races.filter(r=>r.status==='live');
 const fresh=stamps.filter(s=>live.some(r=>r.id===s.session_id)&&now-Date.parse(s.received_at)<15000).sort((a,b)=>Date.parse(b.received_at)-Date.parse(a.received_at));
 return live.find(r=>r.id===fresh[0]?.session_id)||[...live].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0]||null;
}


export function damageAlert(driver){
 if(driver.telemetry_public!==true||driver.damage_stale===true)return null;
 // Engine condition loss is separate from collision damage and must not outline the row.
 const values=['front_left','front_right','rear','floor'].map(key=>driver.damage?.[key]).filter(n=>isNumber(n)&&n>=0&&n<=100);
 const worst=values.length?Math.max(...values):0;
 return worst>0?{level:worst>=30?'major':'minor',percent:worst}:null;
}
export function penaltyLabel(seconds){return Number.isSafeInteger(seconds)&&seconds>0?'+'+seconds:''}

export function safetyPeriod(snapshot,race,now=Date.now(),demo=false){
 const state=feedState(snapshot,race,now,demo);
 if(state!=='LIVE'&&state!=='DEMO DATA')return null;
 const safety=({1:{code:'SC',label:'SAFETY CAR'},2:{code:'VSC',label:'VIRTUAL SAFETY CAR'}})[snapshot?.data?.safety_car_status];
 if(safety)return {...safety,message:'DEPLOYED · LIVE GAME SIGNAL'};
 if(snapshot?.data?.safety_car_status!==0)return null;
 const yellow=snapshot?.data?.marshal_zones?.some(z=>z.flag===3&&isNumber(z.start)&&z.start>=0&&z.start<=1);
 return yellow?{code:'⚑',label:'YELLOW FLAG',local:true,message:'CAUTION ON TRACK · LIVE GAME SIGNAL'}:null;
}
