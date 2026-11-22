export const colours=['#f34b57','#ff8b36','#e8b918','#23c763','#63aaff','#b68bff'];
export const formatLap=value=>{const ms=Math.round(value);return Math.floor(ms/60000)+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');};
export const assessmentKey=s=>JSON.stringify({panel:s.name,tracks:s.tracks.map(t=>[t.name,t.benchmark_ms]),tiers:s.tiers});
export function chartDrivers(tickets,key,measure='gap'){
 const latest=new Map();
 for(const t of tickets){if(t.status!=='approved'||assessmentKey(t.snapshot)!==key)continue;const entries=t.snapshot.tracks.map(track=>({track,entry:t.entries[track.id]}));if(entries.some(x=>!Number.isSafeInteger(x.entry?.ms)||x.entry.ms<10000||x.entry.ms>3599999||!x.entry.proof?.message_id))continue;
 const gap=entries.reduce((n,x)=>n+(x.entry.ms/x.track.benchmark_ms-1)*100,0)/entries.length,average=entries.reduce((n,x)=>n+x.entry.ms,0)/entries.length;
 const track=measure.startsWith('track:')?entries.find(x=>x.track.id===measure.slice(6)):null,value=track?track.entry.ms:measure==='average'?average:gap;
 const previous=latest.get(t.driver_id);if(!previous||String(t.created_at)>String(previous.created_at))latest.set(t.driver_id,{...t,gap,average,value});
 }return [...latest.values()].sort((a,b)=>a.value-b.value||a.driver_id.localeCompare(b.driver_id));
}