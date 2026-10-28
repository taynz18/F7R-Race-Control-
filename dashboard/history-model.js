import {driverName,isNumber} from './model.js?v=0.10.1';
export function sessionStats(samples,finalData={}){
 const cars=new Map(),ordered=[...samples].sort((a,b)=>Number(a.frame)-Number(b.frame));
 for(const sample of ordered){
  for(const d of sample.data?.drivers||[]){
   let c=cars.get(d.slot);if(!c){c={slot:d.slot,driver:d,laps:[],timeline:[],lastLap:null,pitStops:0,lastPit:null,stints:[],lastCompound:null,lastAge:null};cars.set(d.slot,c)}
   if(c.lastLap!==null&&d.lap>c.lastLap&&isNumber(d.last_lap_ms)&&d.last_lap_ms>0&&!c.laps.some(l=>l.lap===d.lap-1))
    c.laps.push({lap:d.lap-1,time:d.last_lap_ms});
   // Do not invent missing laps when the receiver joins late or packets are lost.
   if(c.lastLap===null||d.lap>c.lastLap)c.lastLap=d.lap;
   if(d.pit_status>0&&c.lastPit===0)c.pitStops++;
   c.lastPit=d.pit_status;
   if(d.compound!==null&&d.compound!==undefined&&(c.lastCompound!==d.compound||(isNumber(d.tyre_age)&&isNumber(c.lastAge)&&d.tyre_age<c.lastAge))){
    c.stints.push({compound:d.compound,lap:d.lap,age:d.tyre_age});c.lastCompound=d.compound;
   }
   c.lastAge=d.tyre_age;
   c.timeline.push({at:sample.captured_at,lap:d.lap,driver:d});c.driver=d;
  }
 }
 for(const d of finalData.drivers||[]){if(cars.has(d.slot))cars.get(d.slot).driver=d;else cars.set(d.slot,{slot:d.slot,driver:d,laps:[],timeline:[],pitStops:0,stints:[]})}
 return [...cars.values()].map(c=>{
  const times=c.laps.map(l=>l.time),mean=times.length?times.reduce((a,b)=>a+b,0)/times.length:null;
  return {...c,name:driverName(c.driver),best:times.length?Math.min(...times):null,average:mean,consistency:times.length>=2?Math.sqrt(times.reduce((a,b)=>a+(b-mean)**2,0)/times.length):null};
 }).sort((a,b)=>(a.driver.position||99)-(b.driver.position||99));
}
export const compoundName=code=>({16:'Soft',17:'Medium',18:'Hard',7:'Intermediate',8:'Wet',15:'Wet',19:'Super soft',20:'Soft',21:'Medium',22:'Hard'})[code]||'Unknown';
